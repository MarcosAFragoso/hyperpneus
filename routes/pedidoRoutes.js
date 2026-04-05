const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/pedidoController');

router.post('/finalizar', ctrl.finalizar);
router.post('/migrar-carrinho', ctrl.migrarCarrinho);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.buscar);
router.patch('/:id/status', ctrl.atualizarStatus);
router.post('/gerar-cupom-troca', ctrl.gerarCupomTroca);

module.exports = router;