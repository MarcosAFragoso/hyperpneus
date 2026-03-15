const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/cartaoController');

router.get('/', controller.listar);
router.post('/', controller.criar);
router.patch('/:id/principal', controller.definirPrincipal);
router.delete('/:id', controller.remover);

module.exports = router;