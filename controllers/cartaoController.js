const Cartao = require('../models/cartaoModel');

module.exports = {
  async listar(req, res) {
    try {
      const cartoes = await Cartao.listarPorCliente(req.params.clienteId);
      res.json(cartoes);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const cartao = await Cartao.criar(req.params.clienteId, req.body);
      res.status(201).json(cartao);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      const cartao = await Cartao.atualizar(
        req.params.id,
        req.params.clienteId,
        req.body
      );

      if (!cartao) {
        return res.status(404).json({ erro: 'Cartão não encontrado' });
      }

      res.json(cartao);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async definirPrincipal(req, res) {
    try {
      const cartao = await Cartao.definirPrincipal(
        req.params.id,
        req.params.clienteId
      );

      if (!cartao) {
        return res.status(404).json({ erro: 'Cartão não encontrado' });
      }

      res.json(cartao);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async remover(req, res) {
    try {
      await Cartao.remover(req.params.id, req.params.clienteId);
      res.json({ mensagem: 'Cartão removido' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};