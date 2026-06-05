const express = require('express');
const router = express.Router();
const { exigirAdmin } = require('../middlewares/auth');
const authCtrl = require('../controllers/adminAuthController');
const pedidoCtrl = require('../controllers/adminPedidoController');
const trocaCtrl = require('../controllers/adminTrocaController');
const pool = require('../config/database');

// ── Autenticação Admin ─────────────────────────────────────
router.post('/login', authCtrl.login);
router.post('/logout', authCtrl.logout);
router.get('/perfil', authCtrl.perfil);

// ── Pedidos (MANTIDO EXATAMENTE COMO ERA ORIGINALMENTE) ────
router.get('/dashboard/resumo', exigirAdmin, pedidoCtrl.resumoDashboard);
router.get('/pedidos', exigirAdmin, pedidoCtrl.listar);
router.get('/analise/vendas-categorias', exigirAdmin, pedidoCtrl.vendasPorCategoria);
router.get('/pedidos/:id', exigirAdmin, pedidoCtrl.buscar);
router.patch('/pedidos/:id/status', exigirAdmin, pedidoCtrl.atualizarStatus);
router.patch('/pedidos/:id/confirmar-pagamento', exigirAdmin, pedidoCtrl.confirmarPagamento);

// ── Trocas ─────────────────────────────────────────────────
router.get('/trocas', exigirAdmin, trocaCtrl.listar);
router.patch('/trocas/:id/aceitar', exigirAdmin, trocaCtrl.aceitar);
router.patch('/trocas/:id/negar', exigirAdmin, trocaCtrl.negar);
router.patch('/trocas/:id/recebimento', exigirAdmin, trocaCtrl.confirmarRecebimento);

// Nova rota isolada para o gráfico de trocas (sem mexer nas anteriores)
router.get('/trocas/volume-por-marca', exigirAdmin, trocaCtrl.volumePorMarca);

// ── Utilitários de teste ───────────────────────────────────
router.post('/cupons/teste', exigirAdmin, async (req, res) => {
  try {
    const valor = parseFloat(req.body.valor) || 10.00;
    const codigo = 'PROMO-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const { rows: [cupom] } = await pool.query(
      `INSERT INTO cupons (codigo, cliente_id, valor, tipo, usado, validade)
       VALUES ($1, NULL, $2, 'promocional', FALSE, NULL) RETURNING *`,
      [codigo, valor]
    );
    res.status(201).json(cupom);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/estoque/reset', exigirAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE pneus SET estoque = 50 WHERE ativo = TRUE');
    res.json({ mensagem: 'Estoque resetado com sucesso para 50 unidades.' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;