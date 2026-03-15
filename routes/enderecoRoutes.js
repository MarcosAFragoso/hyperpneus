const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/enderecoController');

router.get('/', controller.listar);
router.post('/', controller.criar);
router.put('/:id', controller.atualizar);
router.delete('/:id', controller.remover);

module.exports = router;