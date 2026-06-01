const express = require('express');
const router = express.Router();
const { Groq } = require('groq-sdk');
const pool = require('../config/database');

const ai = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Rate limiting em memória ───────────────────────────────
const rateLimitMap = new Map();
const LIMITE_POR_MINUTO = 60;

setInterval(() => {
  const agora = Date.now();
  for (const [chave, dados] of rateLimitMap.entries()) {
    if (dados.resetAt <= agora) rateLimitMap.delete(chave);
  }
}, 5 * 60 * 1000);

function verificarRateLimit(identificador) {
  const agora = Date.now();
  const entrada = rateLimitMap.get(identificador);

  if (!entrada || entrada.resetAt <= agora) {
    rateLimitMap.set(identificador, { count: 1, resetAt: agora + 60 * 1000 });
    return { bloqueado: false, restantes: LIMITE_POR_MINUTO - 1 };
  }

  if (entrada.count >= LIMITE_POR_MINUTO) {
    const segundosRestantes = Math.ceil((entrada.resetAt - agora) / 1000);
    return { bloqueado: true, segundosRestantes };
  }

  entrada.count += 1;
  return { bloqueado: false, restantes: LIMITE_POR_MINUTO - entrada.count };
}

// ── Validação de intenção de adicionar ao carrinho ─────────
function extrairAcaoJSON(texto) {
  const limpo = texto
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (!limpo.startsWith('{') || !limpo.endsWith('}')) return null;

  try {
    const obj = JSON.parse(limpo);

    if (
      typeof obj.acao !== 'string' ||
      obj.acao !== 'adicionar_carrinho' ||
      typeof obj.pneu_id === 'undefined'
    ) return null;

    const id = parseInt(obj.pneu_id);
    if (!Number.isInteger(id) || id <= 0) return null;

    return {
      acao: obj.acao,
      pneu_id: id,
      mensagem: typeof obj.mensagem === 'string' ? obj.mensagem.slice(0, 300) : null
    };
  } catch {
    return null;
  }
}

// ── Rota principal ─────────────────────────────────────────
router.post('/mensagem', async (req, res) => {
  try {
    const { mensagem, historico = [] } = req.body;

    if (!mensagem?.trim())
      return res.status(400).json({ erro: 'Mensagem vazia.' });

    const clienteId = req.session?.cliente?.id;
    const identificador = clienteId
      ? `cliente_${clienteId}`
      : `ip_${req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress}`;

    const limite = verificarRateLimit(identificador);
    if (limite.bloqueado) {
      return res.status(429).json({
        resposta: `Você enviou muitas mensagens! Aguarde ${limite.segundosRestantes} segundo${limite.segundosRestantes !== 1 ? 's' : ''} antes de continuar. 😊`
      });
    }

    // Busca catálogo trazendo o ID obrigatório para o carrinho funcionar!
    const { rows: pneus } = await pool.query(
      `SELECT id, marca, modelo, largura, perfil, aro, preco_venda, estoque, imagem_url
       FROM pneus
       WHERE ativo = TRUE AND estoque > 0
       ORDER BY marca, modelo
       LIMIT 30`
    );

    const catalogoTexto = pneus.map(p =>
      `Produto: ${p.marca} ${p.modelo} | Medida: ${p.largura}/${p.perfil} R${p.aro} | Preço: R$${parseFloat(p.preco_venda).toFixed(2)} | Estoque: ${p.estoque} | (Referência Interna ID:${p.id})`
    ).join('\n');

    let garagemTexto = '';
    let historicoComprasTexto = '';

    if (clienteId) {
      const { rows: veiculos } = await pool.query(
        `SELECT marca, modelo, ano, versao FROM veiculos
         WHERE cliente_id = $1 ORDER BY principal DESC`,
        [clienteId]
      );
      if (veiculos.length) {
        garagemTexto = `\nVeículos do cliente:\n` +
          veiculos.map(v => `- ${v.marca} ${v.modelo} ${v.ano}${v.versao ? ' ' + v.versao : ''}`).join('\n');
      }

      const { rows: compras } = await pool.query(
        `SELECT pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro,
                SUM(ip.quantidade)::int AS quantidade,
                MAX(p.criado_em) AS ultima_compra
         FROM pedidos p
         JOIN itens_pedido ip ON ip.pedido_id = p.id
         JOIN pneus pn ON pn.id = ip.pneu_id
         WHERE p.cliente_id = $1
           AND p.status <> 'CANCELADO'
         GROUP BY pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro
         ORDER BY ultima_compra DESC
         LIMIT 12`,
        [clienteId]
      );

      if (compras.length) {
        historicoComprasTexto = `\nHistórico de compras do cliente:\n` +
          compras.map(c =>
            `- ${c.marca} ${c.modelo} ${c.largura}/${c.perfil} R${c.aro} (${c.quantidade} un.)`
          ).join('\n');
      }
    }

    const contexto = `
Você é o HyperBot, assistente virtual do e-commerce HyperPneus.
Ajude o cliente a encontrar o pneu ideal de forma objetiva e amigável.

Regras gerais:
- Vendemos APENAS pneus para carros de passeio, SUVs e caminhonetes leves
- NÃO vendemos pneus para motos, caminhões, ônibus, bicicletas, tratores ou aviões
- Se perguntarem sobre veículo fora do escopo, explique educadamente
- Carrinho reserva estoque por 30 minutos
- Troca gera cupom de crédito após aprovação do administrador
- Responda em português do Brasil, de forma curta e direta
- Se o cliente mencionar o veículo dele, sugira pneus compatíveis do catálogo
- Use o histórico de compras para personalizar a recomendação quando existir
- Recomende somente produtos listados no catálogo abaixo (com seus IDs)
- Se não houver pneu compatível exato para o carro dele, diga isso claramente
- Não invente marcas, modelos, medidas, preços, estoque ou benefícios
- NUNCA mostre o "ID" ou "Referência Interna" para o cliente em conversas normais.
- Ao sugerir um pneu, cite SEMPRE a Marca, o Modelo e a Medida Completa (Ex: 225/60 R18).
- O ID só deve ser usado internamente por você quando gerar o comando JSON de adicionar ao carrinho.
- Seja consultivo: se o cliente perguntar de um carro como a Toro, destaque que você tem as medidas específicas para ela.

REGRA CRÍTICA — ADICIONAR AO CARRINHO:
Quando o cliente pedir para adicionar um pneu ao carrinho (frases como "adiciona", "coloca no carrinho",
"quero esse", "pode adicionar", "adicione", "adicionar ao carrinho", "comprar esse", etc.),
você DEVE responder EXCLUSIVAMENTE com um objeto JSON no seguinte formato, sem nenhum texto antes ou depois:
{"acao":"adicionar_carrinho","pneu_id":ID_DO_PNEU,"mensagem":"Mensagem confirmando qual pneu foi adicionado, com marca, modelo e medida."}

Se houver ambiguidade (cliente não especificou qual pneu quer), pergunte qual antes de retornar o JSON.
Se o pneu solicitado não estiver no catálogo, responda normalmente em texto explicando.

Catálogo disponível (use os IDs internamente para adicionar ao carrinho):
${catalogoTexto}
${garagemTexto}
${historicoComprasTexto}
`.trim();

    // ── MONTAGEM DO HISTÓRICO PADRÃO OPENAI / GROQ ─────────
    const messages = [
      { role: 'system', content: contexto }
    ];

    historico.forEach(h => {
      messages.push({
        role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
        content: h.text
      });
    });

    messages.push({ role: 'user', content: message });

    // Chamada oficial da SDK da Groq
    const chatCompletion = await ai.chat.completions.create({
      messages: messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    });

    const textoResposta = chatCompletion.choices[0]?.message?.content?.trim() || '';

    // Tenta extrair e validar se a inteligência artificial disparou uma ação de carrinho
    const acao = extrairAcaoJSON(textoResposta);

    if (acao) {
      const pneuValido = pneus.find(p => p.id === acao.pneu_id);

      if (!pneuValido) {
        return res.json({
          resposta: 'Não consegui localizar este pneu no catálogo no momento. Poderia me confirmar a marca ou modelo do pneu desejado?'
        });
      }

      // Se o usuário estiver logado, faz a inserção/atualização direta no banco
      if (clienteId) {
        const { rows: [existente] } = await pool.query(
          `SELECT id, quantidade FROM itens_carrinho WHERE cliente_id = $1 AND pneu_id = $2`,
          [clienteId, acao.pneu_id]
        );

        if (existente) {
          const novaQtd = existente.quantidade + 1;
          if (pneuValido.estoque < novaQtd) {
            return res.json({
              resposta: `Desculpe, o estoque do ${pneuValido.marca} ${pneuValido.modelo} está esgotado para essa quantidade (${pneuValido.estoque} unid. disponíveis).`
            });
          }
          await pool.query(
            `UPDATE itens_carrinho
             SET quantidade = $1, expira_em = NOW() + INTERVAL '30 minutes'
             WHERE id = $2`,
            [novaQtd, existente.id]
          );
        } else {
          await pool.query(
            `INSERT INTO itens_carrinho (cliente_id, pneu_id, quantidade, preco_unitario, expira_em)
             VALUES ($1, $2, 1, $3, NOW() + INTERVAL '30 minutes')`,
            [clienteId, acao.pneu_id, pneuValido.preco_venda]
          );
        }
      }

      // Devolve a resposta estruturada para o front-end
      return res.json({
        resposta: acao.mensagem || `${pneuValido.marca} ${pneuValido.modelo} adicionado ao carrinho! 🛒`,
        pneu_id_para_adicionar: acao.pneu_id,
        item_carrinho: {
          pneu_id: pneuValido.id,
          marca: pneuValido.marca,
          modelo: pneuValido.modelo,
          largura: pneuValido.largura,
          perfil: pneuValido.perfil,
          aro: pneuValido.aro,
          preco_unitario: parseFloat(pneuValido.preco_venda),
          imagem_url: pneuValido.imagem_url || null,
          quantidade: 1
        }
      });
    }

    // Se for texto normal, apenas entrega a resposta
    res.json({ resposta: textoResposta });

  } catch (err) {
    console.error('Erro detalhado do chatbot:', err.message);
    res.status(500).json({
      resposta: 'Desculpe, tive um problema técnico ao processar com a IA. Tente novamente em instantes.'
    });
  }
});

module.exports = router;