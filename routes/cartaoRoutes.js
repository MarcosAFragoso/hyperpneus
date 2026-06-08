const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/cartaoController');
const { exigirLogin } = require('../middlewares/auth');

router.use(exigirLogin); // todas as rotas de cartão exigem login

router.get('/',                controller.listar);
router.post('/',               controller.criar);
router.put('/:id',             controller.atualizar);
router.patch('/:id/principal', controller.definirPrincipal);
router.delete('/:id',          controller.remover);

module.exports = router;