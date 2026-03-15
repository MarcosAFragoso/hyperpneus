const Veiculo = require('../models/veiculoModel');

module.exports = {
  async listar(req, res) {
    try {
      const veiculos = await Veiculo.listarPorCliente(req.params.clienteId);
      res.json(veiculos);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const veiculo = await Veiculo.criar(req.params.clienteId, req.body);
      res.status(201).json(veiculo);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async definirPrincipal(req, res) {
    try {
      const veiculo = await Veiculo.definirPrincipal(req.params.id, req.params.clienteId);
      if (!veiculo) return res.status(404).json({ erro: 'Veículo não encontrado' });
      res.json(veiculo);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async remover(req, res) {
    try {
      await Veiculo.remover(req.params.id, req.params.clienteId);
      res.json({ mensagem: 'Veículo removido' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};