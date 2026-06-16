const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/pedidoController');
const { exigirLogin } = require('../middlewares/auth');

router.post('/finalizar', exigirLogin, ctrl.finalizar);
router.post('/migrar-carrinho', ctrl.migrarCarrinho);
router.get('/', exigirLogin, ctrl.listar);
router.get('/:id', exigirLogin, ctrl.buscar);
router.patch('/:id/cancelar', exigirLogin, ctrl.cancelar);
router.post('/gerar-cupom-troca', exigirLogin, ctrl.gerarCupomTroca);



module.exports = router;
