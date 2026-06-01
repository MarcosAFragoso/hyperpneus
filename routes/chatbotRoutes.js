const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/database');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/mensagem', async (req, res) => {
  try {
    const { mensagem, historico = [] } = req.body;

    if (!mensagem?.trim())
      return res.status(400).json({ erro: 'Mensagem vazia.' });

    // Busca catálogo de pneus disponíveis
    const { rows: pneus } = await pool.query(
      `SELECT marca, modelo, largura, perfil, aro, preco_venda, estoque
       FROM pneus
       WHERE ativo = TRUE AND estoque > 0
       ORDER BY marca, modelo
       LIMIT 30`
    );

    const catalogoTexto = pneus.map(p =>
      `${p.marca} ${p.modelo} - ${p.largura}/${p.perfil} R${p.aro} - R$${parseFloat(p.preco_venda).toFixed(2)}`
    ).join('\n');

    // Busca veículos do cliente logado (se houver sessão)
    let garagemTexto = '';
    let historicoComprasTexto = '';
    const clienteId = req.session?.cliente?.id;
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

Regras:
- Vendemos APENAS pneus para carros de passeio, SUVs e caminhonetes leves
- NÃO vendemos pneus para motos, caminhões, ônibus, bicicletas, tratores ou aviões
- Se perguntarem sobre veículo fora do escopo, explique educadamente que nosso foco é carros de passeio, SUVs e caminhonetes
- Carrinho reserva estoque por 30 minutos
- Troca gera cupom de crédito após aprovação do administrador
- Responda em português do Brasil, de forma curta e direta
- Se o cliente mencionar o veículo dele, sugira pneus compatíveis do catálogo
- Use o histórico de compras para personalizar a recomendação quando existir
- Recomende somente produtos listados no catálogo disponível abaixo
- Se não houver produto compatível no catálogo, diga isso claramente e sugira ajustar medida, aro ou marca
- Não invente marcas, modelos, medidas, preços, estoque ou benefícios
- Não invente pneus que não estão no catálogo abaixo

Catálogo disponível:
${catalogoTexto}
${garagemTexto}
${historicoComprasTexto}
`.trim();

    // Monta histórico no formato do Gemini
    const contents = [
      ...historico.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      })),
      {
        role: 'user',
        parts: [{ text: mensagem }]
      }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: contexto,
        temperature: 0.3
      }
    });

    res.json({ resposta: response.text });

  } catch (err) {
    console.error('Erro chatbot:', err.message);
    res.status(500).json({
      resposta: 'Desculpe, tive um problema técnico. Tente novamente em instantes.'
    });
  }
});

module.exports = router;
