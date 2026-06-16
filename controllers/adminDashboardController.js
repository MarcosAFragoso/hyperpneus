const pool = require('../config/database');

// ─── GET /api/admin/dashboard/resumo ──────────────────────────────────────────
// Retorna: { total, faturamento_total }
// O front usa esses dois campos para preencher os cards "Total de Pedidos"
// e "Faturamento Total" na seção Dashboard.
// Considera apenas pedidos que não estão CANCELADO para o faturamento,
// mas conta todos para o total — ajuste a cláusula WHERE se preferir diferente.
async function resumoDashboard(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                              AS total,
        COALESCE(SUM(CASE WHEN status <> 'CANCELADO' THEN total ELSE 0 END), 0)
                                                             AS faturamento_total
      FROM pedidos
    `);

    const linha = rows[0];
    res.json({
      total:             parseInt(linha.total, 10),
      faturamento_total: parseFloat(linha.faturamento_total)
    });
  } catch (err) {
    console.error('[adminDashboardController] resumoDashboard:', err);
    res.status(500).json({ erro: err.message });
  }
}

// ─── GET /api/admin/analise/vendas-categorias ──────────────────────────────────
// Query params: inicio (YYYY-MM-DD), fim (YYYY-MM-DD)  — ambos opcionais.
// Quando omitidos, assume os últimos 6 meses completos.
//
// Retorna: { inicio, fim, dados: [ { mes, categoria, quantidade, valor } ] }
//   • mes       → "YYYY-MM"
//   • categoria → pneus.marca  (ex.: "Michelin", "Pirelli" …)
//   • quantidade→ soma de itens_pedido.quantidade no mês
//   • valor     → faturamento (subtotal sem frete) do mês para a marca
//
// O front reconstrói o range de meses via dados.inicio / dados.fim para
// garantir que o eixo X do Chart.js cubra todo o período, mesmo sem vendas.
async function vendasPorCategoria(req, res) {
  try {
    // ── Normaliza o período ──────────────────────────────────────────────────
    let { inicio, fim } = req.query;

    // Padrão: primeiro dia de 6 meses atrás → hoje
    if (!inicio) {
      const d = new Date();
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      inicio = d.toISOString().slice(0, 10);  // YYYY-MM-DD
    }
    if (!fim) {
      fim = new Date().toISOString().slice(0, 10);
    }

    // ── Query principal ──────────────────────────────────────────────────────
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', pe.criado_em), 'YYYY-MM') AS mes,
        COALESCE(NULLIF(TRIM(pn.marca), ''), 'OUTROS')    AS categoria,
        SUM(ip.quantidade)                                     AS quantidade,
        SUM(ip.quantidade * ip.preco_unitario)                 AS valor
      FROM pedidos        pe
      JOIN itens_pedido   ip ON ip.pedido_id  = pe.id
      JOIN pneus          pn ON pn.id         = ip.pneu_id
      WHERE pe.status    <> 'CANCELADO'
        AND pe.criado_em >= $1::date
        AND pe.criado_em <  ($2::date + INTERVAL '1 day')
      GROUP BY
        DATE_TRUNC('month', pe.criado_em),
        COALESCE(NULLIF(TRIM(pn.marca), ''), 'OUTROS')
      ORDER BY mes, categoria
    `, [inicio, fim]);

    res.json({
      inicio,
      fim,
      dados: rows.map(r => ({
        mes:        r.mes,
        categoria:  r.categoria,
        quantidade: parseInt(r.quantidade, 10),
        valor:      parseFloat(r.valor)
      }))
    });
  } catch (err) {
    console.error('[adminDashboardController] vendasPorCategoria:', err);
    res.status(500).json({ erro: err.message });
  }
}

module.exports = { resumoDashboard, vendasPorCategoria };
