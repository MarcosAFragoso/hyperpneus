const Cliente = require('../models/clienteModel');
const bcrypt = require('bcryptjs');

module.exports = {
  async login(req, res) {
    try {
      const { email, senha } = req.body;

      if (!email || !senha)
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });

      const cliente = await Cliente.buscarPorEmail(email);

      if (!cliente)
        return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

      if (!cliente.ativo)
        return res.status(403).json({ erro: 'Conta inativa. Entre em contato com o suporte.' });

      const senhaValida = await bcrypt.compare(senha, cliente.senha);
      if (!senhaValida)
        return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

      req.session.cliente = {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email
      };

      res.json({
        mensagem: 'Login realizado com sucesso',
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          email: cliente.email
        }
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async logout(req, res) {
    req.session.destroy(() => {
      res.json({ mensagem: 'Logout realizado com sucesso' });
    });
  },

  async perfil(req, res) {
    if (!req.session.cliente)
      return res.status(401).json({ erro: 'Não autenticado' });
    res.json(req.session.cliente);
  }
};