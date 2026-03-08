const Cliente = require('../models/clienteModel');

module.exports = {
  async listar(req, res) {
    try {
      const clientes = await Cliente.listar();
      res.json(clientes);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async buscar(req, res) {
    try {
      const cliente = await Cliente.buscarPorId(req.params.id);
      if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
      res.json(cliente);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const cliente = await Cliente.criar(req.body);
      res.status(201).json(cliente);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ erro: 'CPF ou e-mail já cadastrado' });
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      const cliente = await Cliente.atualizar(req.params.id, req.body);
      res.json(cliente);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async inativar(req, res) {
    try {
      await Cliente.inativar(req.params.id);
      res.json({ mensagem: 'Cliente inativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async ativar(req, res) {
    try {
      await Cliente.ativar(req.params.id);
      res.json({ mensagem: 'Cliente ativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};