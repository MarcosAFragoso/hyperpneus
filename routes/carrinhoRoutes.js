const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/carrinhoController');
const { exigirLogin } = require('../middlewares/auth');

router.get('/',               ctrl.listar);          // retorna vazio para anônimos — ok
router.post('/',              ctrl.adicionar);        // suporta anônimo — ok
router.delete('/:itemId',     exigirLogin, ctrl.remover);
router.patch('/:itemId',      exigirLogin, ctrl.atualizar);
router.post('/cupom/validar', exigirLogin, ctrl.validarCupom);

module.exports = router;