const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/carrinhoController');

router.get('/',                    ctrl.listar);
router.post('/',                   ctrl.adicionar);
router.delete('/:itemId',          ctrl.remover);
router.patch('/:itemId',           ctrl.atualizar);
router.post('/cupom/validar',      ctrl.validarCupom);

module.exports = router;