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
    }

    const contexto = `
Você é o HyperBot, assistente virtual do e-commerce HyperPneus.
Ajude o cliente a encontrar o pneu ideal de forma objetiva e amigável.

Regras:
- Só vende pneus para carros, motos, caminhonetes e caminhões
- Não vende pneus para bicicletas, tratores, aviões ou carrinhos de mão
- Carrinho reserva estoque por 30 minutos
- Troca gera cupom de crédito após aprovação do administrador
- Responda em português do Brasil, de forma curta e direta
- Se o cliente mencionar o veículo dele, sugira pneus compatíveis do catálogo
- Não invente pneus que não estão no catálogo abaixo

Catálogo disponível:
${catalogoTexto}
${garagemTexto}
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
