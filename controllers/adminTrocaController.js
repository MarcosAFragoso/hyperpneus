const pool = require('../config/database');

module.exports = {

  async listar(req, res) {
    try {
      const { status = 'PENDENTE' } = req.query;
      const { rows } = await pool.query(
        `SELECT t.id, t.pedido_id, t.pneu_id, t.quantidade_trocada,
                t.status, t.admin_obs, t.atualizado_em,
                pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro,
                c.nome || ' ' || c.sobrenome AS cliente_nome,
                cp.codigo AS cupom_codigo, cp.valor AS cupom_valor,
                -- Extrai a ação desejada pelo cliente do campo admin_obs
                CASE
                  WHEN t.admin_obs LIKE 'ACAO_CLIENTE:%'
                  THEN REPLACE(t.admin_obs, 'ACAO_CLIENTE:', '')
                  ELSE NULL
                END AS acao_cliente
         FROM trocas t
         JOIN pneus pn ON pn.id = t.pneu_id
         JOIN pedidos p ON p.id = t.pedido_id
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN cupons cp ON cp.id = t.cupom_id
         WHERE t.status = $1
         ORDER BY t.id DESC`,
        [status]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── ACEITAR: agora é aqui que o cupom é gerado ──────────────
  async aceitar(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { obs } = req.body;

      const { rows: [troca] } = await client.query(
        `SELECT t.*, p.cliente_id FROM trocas t
         JOIN pedidos p ON p.id = t.pedido_id
         WHERE t.id = $1 FOR UPDATE`, [id]
      );
      if (!troca) throw new Error('Troca não encontrada.');
      if (troca.status !== 'PENDENTE')
        throw new Error(`Troca já foi processada (status: ${troca.status}).`);

      // Determina a ação que o cliente desejou
      // Formato salvo: "ACAO_CLIENTE:Vale-Troca" ou "ACAO_CLIENTE:Estorno"
      const acaoCliente = troca.admin_obs?.startsWith('ACAO_CLIENTE:')
        ? troca.admin_obs.replace('ACAO_CLIENTE:', '')
        : 'Vale-Troca'; // padrão se não informado

      // Devolve estoque independente da ação
      await client.query(
        'UPDATE pneus SET estoque = estoque + $1 WHERE id = $2',
        [troca.quantidade_trocada, troca.pneu_id]
      );

      let cupomId = null;
      let cupomCodigo = null;

      if (acaoCliente === 'Vale-Troca') {
        // Gera cupom AGORA — só após aprovação do admin
        const { rows: [item] } = await client.query(
          `SELECT preco_unitario FROM itens_pedido
           WHERE pedido_id = $1 AND pneu_id = $2`,
          [troca.pedido_id, troca.pneu_id]
        );
        const valor = parseFloat(item?.preco_unitario || 0) * troca.quantidade_trocada;
        cupomCodigo = 'TROCA-' + Math.random().toString(36).substr(2, 6).toUpperCase();

        const { rows: [cupom] } = await client.query(
          `INSERT INTO cupons (codigo, cliente_id, valor, tipo, usado, validade)
           VALUES ($1, $2, $3, 'troca', FALSE, NULL) RETURNING id`,
          [cupomCodigo, troca.cliente_id, valor]
        );
        cupomId = cupom.id;
      }

      // obs do admin sobrescreve o campo — salva a justificativa real
      const obsFinal = obs || (acaoCliente === 'Estorno' ? 'Estorno aprovado' : null);

      await client.query(
        `UPDATE trocas
         SET status = 'APROVADO',
             cupom_id = $1,
             admin_obs = $2,
             atualizado_em = now()
         WHERE id = $3`,
        [cupomId, obsFinal, id]
      );

      await client.query('COMMIT');

      const resposta = {
        mensagem: acaoCliente === 'Estorno'
          ? 'Devolução aceita. Estorno será processado.'
          : 'Troca aceita e cupom gerado.',
        cupom_id: cupomId,
        cupom_codigo: cupomCodigo,
        acao: acaoCliente
      };
      res.json(resposta);

    } catch (err) {
      await client.query('ROLLBACK');
      res.status(400).json({ erro: err.message });
    } finally {
      client.release();
    }
  },

  async negar(req, res) {
    try {
      const { id } = req.params;
      const { obs } = req.body;

      const { rows: [troca] } = await pool.query(
        'SELECT status FROM trocas WHERE id = $1', [id]
      );
      if (!troca) return res.status(404).json({ erro: 'Troca não encontrada.' });
      if (troca.status !== 'PENDENTE')
        return res.status(400).json({
          erro: `Troca já foi processada (status: ${troca.status}).`
        });

      await pool.query(
        `UPDATE trocas SET status = 'NEGADO', admin_obs = $1, atualizado_em = now()
         WHERE id = $2`,
        [obs || null, id]
      );
      res.json({ mensagem: 'Troca negada.' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async confirmarRecebimento(req, res) {
    try {
      const { id } = req.params;
      const { obs } = req.body;

      const { rows: [troca] } = await pool.query(
        'SELECT status, cupom_id FROM trocas WHERE id = $1', [id]
      );
      if (!troca) return res.status(404).json({ erro: 'Troca não encontrada.' });
      if (troca.status !== 'APROVADO')
        return res.status(400).json({
          erro: 'Troca precisa estar APROVADA para confirmar recebimento.'
        });

      await pool.query(
        `UPDATE trocas SET status = 'PRODUTO_RECEBIDO', admin_obs = $1, atualizado_em = now()
         WHERE id = $2`,
        [obs || null, id]
      );

      res.json({
        mensagem: 'Recebimento do produto confirmado.',
        cupom_id: troca.cupom_id
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};
