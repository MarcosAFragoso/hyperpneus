const express = require('express');
const router = express.Router();
const controller = require('../controllers/clienteController');
const { exigirLogin, exigirAdmin } = require('../middlewares/auth');

router.get('/',              exigirAdmin, controller.listar);    // listagem só para admin
router.get('/:id',           exigirLogin, controller.buscar);
router.post('/',             controller.criar);                  // cadastro é público
router.put('/:id',           exigirLogin, controller.atualizar);
router.patch('/:id/inativar', exigirAdmin, controller.inativar); // inativar/ativar só admin
router.patch('/:id/ativar',   exigirAdmin, controller.ativar);

module.exports = router;