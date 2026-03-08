const Pneu = require('../models/pneuModel');

module.exports = {
  async listar(req, res) {
    try {
      const pneus = await Pneu.listar(req.query);
      res.json(pneus);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async buscar(req, res) {
    try {
      const pneu = await Pneu.buscarPorId(req.params.id);
      if (!pneu) return res.status(404).json({ erro: 'Pneu não encontrado' });
      res.json(pneu);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const pneu = await Pneu.criar(req.body);
      res.status(201).json(pneu);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ erro: 'SKU ou EAN já cadastrado' });
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      const pneu = await Pneu.atualizar(req.params.id, req.body);
      res.json(pneu);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async inativar(req, res) {
    try {
      await Pneu.inativar(req.params.id);
      res.json({ mensagem: 'Pneu inativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async ativar(req, res) {
    try {
      await Pneu.ativar(req.params.id);
      res.json({ mensagem: 'Pneu ativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarEstoque(req, res) {
    try {
      const resultado = await Pneu.atualizarEstoque(req.params.id, req.body.quantidade);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};