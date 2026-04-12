const express = require('express');
const router = express.Router();
const { exigirAdmin } = require('../middlewares/auth');
const authCtrl = require('../controllers/adminAuthController');
const pedidoCtrl = require('../controllers/adminPedidoController');
const trocaCtrl = require('../controllers/adminTrocaController');

// ── Autenticação Admin ─────────────────────────────────────
router.post('/login', authCtrl.login);
router.post('/logout', authCtrl.logout);
router.get('/perfil', authCtrl.perfil);

// ── Pedidos (protegido) ────────────────────────────────────
router.get('/pedidos', exigirAdmin, pedidoCtrl.listar);
router.get('/pedidos/:id', exigirAdmin, pedidoCtrl.buscar);
router.patch('/pedidos/:id/status', exigirAdmin, pedidoCtrl.atualizarStatus);
router.patch('/pedidos/:id/confirmar-pagamento', exigirAdmin, pedidoCtrl.confirmarPagamento);

// ── Trocas (protegido) ─────────────────────────────────────
router.get('/trocas', exigirAdmin, trocaCtrl.listar);
router.patch('/trocas/:id/aceitar', exigirAdmin, trocaCtrl.aceitar);
router.patch('/trocas/:id/negar', exigirAdmin, trocaCtrl.negar);
router.patch('/trocas/:id/recebimento', exigirAdmin, trocaCtrl.confirmarRecebimento);

module.exports = router;
