const pool = require('../config/database');

module.exports = {

  async listar(req, res) {
    try {
      const { status = 'PENDENTE' } = req.query;
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit) || 10, 1);
      const offset = (page - 1) * limit;

      // 1. Query para contar o total de registros com base no filtro de status
      const { rows: [countRow] } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM trocas WHERE status = $1`,
        [status]
      );
      const total = countRow?.total || 0;
      const pages = Math.ceil(total / limit);

      // 2. Query paginada trazendo os dados necessários
      const { rows: trocas } = await pool.query(
        `SELECT t.id, t.pedido_id, t.pneu_id, t.quantidade_trocada,
                t.status, t.admin_obs, t.atualizado_em,
                pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro,
                c.nome || ' ' || c.sobrenome AS cliente_nome,
                cp.codigo AS cupom_codigo, cp.valor AS cupom_valor,
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
         ORDER BY t.id DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      // Retorna no mesmo padrão estruturado do adminPedidoController
      res.json({
        trocas,
        total,
        pages,
        page
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async volumePorMarca(req, res) {
    try {
      const fimPadrao    = new Date();
      const inicioPadrao = new Date(fimPadrao.getFullYear(), fimPadrao.getMonth() - 12, 1);
      const inicio = req.query.inicio || inicioPadrao.toISOString().slice(0, 10);
      const fim    = req.query.fim    || fimPadrao.toISOString().slice(0, 10);

      // Todas as marcas cadastradas
      const { rows: marcasRows } = await pool.query(
        `SELECT DISTINCT UPPER(TRIM(marca)) AS marca
         FROM pneus WHERE marca IS NOT NULL AND marca <> ''
         ORDER BY marca`
      );

      // Dados do gráfico agrupados por mês+marca
      const { rows } = await pool.query(
        `SELECT
           to_char(date_trunc('month', t.atualizado_em), 'YYYY-MM') AS mes,
           UPPER(TRIM(pn.marca)) AS marca,
           SUM(t.quantidade_trocada)::int AS quantidade
         FROM trocas t
         JOIN pneus pn ON pn.id = t.pneu_id
         WHERE (t.status = 'PRODUTO_RECEBIDO' OR t.status = 'APROVADO')
           AND t.atualizado_em::date BETWEEN $1::date AND $2::date
         GROUP BY mes, UPPER(TRIM(pn.marca))
         ORDER BY mes, UPPER(TRIM(pn.marca))`,
        [inicio, fim]
      );

      // Totais por status no período para os cards
      const { rows: totais } = await pool.query(
        `SELECT status, COUNT(*)::int AS total
         FROM trocas
         WHERE status IN ('APROVADO', 'NEGADO', 'PRODUTO_RECEBIDO')
           AND atualizado_em::date BETWEEN $1::date AND $2::date
         GROUP BY status`,
        [inicio, fim]
      );

      const totaisPeriodo = { aprovado: 0, negado: 0, recebido: 0 };
      totais.forEach(r => {
        if (r.status === 'APROVADO')          totaisPeriodo.aprovado = r.total;
        if (r.status === 'NEGADO')            totaisPeriodo.negado   = r.total;
        if (r.status === 'PRODUTO_RECEBIDO')  totaisPeriodo.recebido = r.total;
      });

      // Resumo por marca no período (para os cards)
      const { rows: resumo } = await pool.query(
        `SELECT UPPER(TRIM(pn.marca)) AS marca,
                SUM(t.quantidade_trocada)::int AS quantidade
         FROM trocas t
         JOIN pneus pn ON pn.id = t.pneu_id
         WHERE (t.status = 'PRODUTO_RECEBIDO' OR t.status = 'APROVADO')
           AND t.atualizado_em::date BETWEEN $1::date AND $2::date
         GROUP BY UPPER(TRIM(pn.marca))
         ORDER BY quantidade DESC`,
        [inicio, fim]
      );

      res.json({
        inicio,
        fim,
        marcasDisponiveis: marcasRows.map(r => r.marca),
        totaisPeriodo,
        resumoPorMarca: resumo,
        dados: rows
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── ACEITAR: Mantido perfeitamente intacto para o Cypress ──────────────
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

      const acaoCliente = troca.admin_obs?.startsWith('ACAO_CLIENTE:')
        ? troca.admin_obs.replace('ACAO_CLIENTE:', '')
        : 'Vale-Troca';

      await client.query(
        'UPDATE pneus SET estoque = estoque + $1 WHERE id = $2',
        [troca.quantidade_trocada, troca.pneu_id]
      );

      let cupomId = null;
      let cupomCodigo = null;

      if (acaoCliente === 'Vale-Troca') {
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

      res.json({
        mensagem: acaoCliente === 'Estorno'
          ? 'Devolução aceita. Estorno será processado.'
          : 'Troca aceita e cupom gerado.',
        cupom_id: cupomId,
        cupom_codigo: cupomCodigo,
        acao: acaoCliente
      });

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