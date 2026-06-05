const pool = require('../config/database');

// Status válidos e transições permitidas
const TRANSICOES = {
  'AGUARDANDO_PAGAMENTO': ['EM_PROCESSAMENTO', 'CANCELADO'],
  'EM_PROCESSAMENTO': ['PAGAMENTO_CONFIRMADO', 'CANCELADO'],
  'PAGAMENTO_CONFIRMADO': ['EM_TRANSPORTE'],
  'EM_TRANSPORTE': ['ENTREGUE'],
  'ENTREGUE': [],   // terminal — trocas tratadas separado
  'CANCELADO': []    // terminal
};

module.exports = {

  async resumoDashboard(req, res) {
    try {
      const { rows: [resumo] } = await pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'AGUARDANDO_PAGAMENTO')::int AS aguardando_pagamento,
           COUNT(*) FILTER (WHERE status = 'EM_TRANSPORTE')::int AS em_transporte,
           COALESCE(SUM(total), 0)::numeric(12,2) AS faturamento_total
         FROM pedidos`
      );

      res.json(resumo);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // Lista todos os pedidos com dados do cliente
  async listar(req, res) {
    try {
      const { status } = req.query;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const offset = (page - 1) * limit;
      const comPaginacao = req.query.comPaginacao === 'true';
      const params = [];
      let where = '';

      if (status) {
        params.push(status);
        where = `WHERE p.status = $${params.length}`;
      }

      params.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT p.id, p.status, p.frete, p.total, p.criado_em, p.atualizado_em,
                c.nome || ' ' || c.sobrenome AS cliente_nome, c.email,
                COUNT(ip.id) AS qtd_itens
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
         ${where}
         GROUP BY p.id, c.nome, c.sobrenome, c.email
         ORDER BY p.criado_em DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      if (!comPaginacao) return res.json(rows);

      const paramsCount = [];
      let whereCount = '';
      if (status) {
        paramsCount.push(status);
        whereCount = `WHERE p.status = $${paramsCount.length}`;
      }

      const { rows: [countRow] } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM pedidos p
         ${whereCount}`,
        paramsCount
      );

      const total = countRow?.total || 0;
      res.json({
        dados: rows,
        paginacao: {
          page,
          limit,
          total,
          totalPaginas: Math.max(Math.ceil(total / limit), 1)
        }
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // Detalhe completo de um pedido
  async buscar(req, res) {
    try {
      const { id } = req.params;

      const { rows: [pedido] } = await pool.query(
        `SELECT p.*, c.nome || ' ' || c.sobrenome AS cliente_nome, c.email,
                e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN enderecos e ON e.id = p.endereco_id
         WHERE p.id = $1`, [id]
      );
      if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

      const { rows: itens } = await pool.query(
        `SELECT ip.*, pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro, pn.imagem_url
         FROM itens_pedido ip JOIN pneus pn ON pn.id = ip.pneu_id
         WHERE ip.pedido_id = $1`, [id]
      );

      const { rows: pagamentos } = await pool.query(
        `SELECT pp.*, ct.bandeira, ct.numero_final, ct.nome_impresso
         FROM pagamentos_pedido pp JOIN cartoes ct ON ct.id = pp.cartao_id
         WHERE pp.pedido_id = $1`, [id]
      );

      const { rows: trocas } = await pool.query(
        `SELECT t.*, pn.marca, pn.modelo, cp.codigo AS cupom_codigo
         FROM trocas t
         JOIN pneus pn ON pn.id = t.pneu_id
         LEFT JOIN cupons cp ON cp.id = t.cupom_id
         WHERE t.pedido_id = $1`, [id]
      );

      res.json({ ...pedido, itens, pagamentos, trocas });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // Avançar status do pedido (admin)
  async atualizarStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const { rows: [pedido] } = await pool.query(
        'SELECT status FROM pedidos WHERE id = $1', [id]
      );
      if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

      const permitidos = TRANSICOES[pedido.status] || [];
      if (!permitidos.includes(status))
        return res.status(400).json({
          erro: `Transição inválida: ${pedido.status} → ${status}. Permitido: [${permitidos.join(', ')}]`
        });

      await pool.query(
        'UPDATE pedidos SET status = $1, atualizado_em = now() WHERE id = $2',
        [status, id]
      );
      res.json({ mensagem: `Status atualizado para ${status}.`, status });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // Confirmar pagamento (EM_PROCESSAMENTO → PAGAMENTO_CONFIRMADO)
  async confirmarPagamento(req, res) {
    try {
      const { id } = req.params;

      const { rows: [pedido] } = await pool.query(
        'SELECT status FROM pedidos WHERE id = $1', [id]
      );
      if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
      if (pedido.status !== 'EM_PROCESSAMENTO')
        return res.status(400).json({ erro: `Pedido não está EM_PROCESSAMENTO (status atual: ${pedido.status}).` });

      // Marca pagamentos como APROVADO e avança o pedido
      await pool.query(
        `UPDATE pagamentos_pedido SET status = 'APROVADO' WHERE pedido_id = $1`, [id]
      );
      await pool.query(
        `UPDATE pedidos SET status = 'PAGAMENTO_CONFIRMADO', atualizado_em = now() WHERE id = $1`, [id]
      );

      res.json({ mensagem: 'Pagamento confirmado.', status: 'PAGAMENTO_CONFIRMADO' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async vendasPorCategoria(req, res) {
    try {
      const fimPadrao = new Date();
      const inicioPadrao = new Date(fimPadrao.getFullYear(), fimPadrao.getMonth() - 12, 1);
      const inicio = req.query.inicio || inicioPadrao.toISOString().slice(0, 10);
      const fim = req.query.fim || fimPadrao.toISOString().slice(0, 10);
      const categoriasSelecionadas = String(req.query.categorias || '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      const { rows: categoriasRows } = await pool.query(
        `SELECT DISTINCT marca AS categoria
         FROM pneus
         WHERE marca IS NOT NULL AND marca <> ''
         ORDER BY marca`
      );

      const params = [inicio, fim];
      let filtroCategorias = '';
      if (categoriasSelecionadas.length) {
        params.push(categoriasSelecionadas);
        filtroCategorias = `AND pn.marca = ANY($${params.length})`;
      }

      const { rows } = await pool.query(
        `SELECT to_char(date_trunc('month', p.criado_em), 'YYYY-MM') AS mes,
          UPPER(TRIM(pn.marca)) AS categoria,
          SUM(ip.quantidade)::int AS quantidade,
          ROUND(SUM(ip.quantidade * ip.preco_unitario)::numeric, 2) AS valor
   FROM pedidos p
   JOIN itens_pedido ip ON ip.pedido_id = p.id
   JOIN pneus pn ON pn.id = ip.pneu_id
   WHERE p.criado_em::date BETWEEN $1::date AND $2::date
     AND p.status <> 'CANCELADO'
     ${filtroCategorias}
   GROUP BY mes, UPPER(TRIM(pn.marca))
   ORDER BY mes, UPPER(TRIM(pn.marca))`,
        params
      );

      res.json({
        inicio,
        fim,
        categoriasDisponiveis: categoriasRows.map(r => r.categoria),
        dados: rows
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};
