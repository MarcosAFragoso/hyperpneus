const express = require('express');
const router = express.Router();
const controller = require('../controllers/pneuController');

router.get('/', controller.listar);
router.get('/:id', controller.buscar);
router.post('/', controller.criar);
router.put('/:id', controller.atualizar);
router.patch('/:id/inativar', controller.inativar);
router.patch('/:id/ativar', controller.ativar);
router.patch('/:id/estoque', controller.atualizarEstoque);

module.exports = router;