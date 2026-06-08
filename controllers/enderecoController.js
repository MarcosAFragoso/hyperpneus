const Endereco = require('../models/enderecoModel');

function verificarProprietario(req, res) {
  if (String(req.session.cliente?.id) !== String(req.params.clienteId)) {
    res.status(403).json({ erro: 'Acesso negado.' });
    return false;
  }
  return true;
}

module.exports = {
  async listar(req, res) {
    try {
      if (!verificarProprietario(req, res)) return;
      const enderecos = await Endereco.listarPorCliente(req.params.clienteId);
      res.json(enderecos);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      if (!verificarProprietario(req, res)) return;
      const endereco = await Endereco.criar(req.params.clienteId, req.body);
      res.status(201).json(endereco);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      if (!verificarProprietario(req, res)) return;
      const endereco = await Endereco.atualizar(req.params.id, req.params.clienteId, req.body);
      if (!endereco) return res.status(404).json({ erro: 'Endereço não encontrado' });
      res.json(endereco);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async remover(req, res) {
    try {
      if (!verificarProprietario(req, res)) return;
      await Endereco.remover(req.params.id, req.params.clienteId);
      res.json({ mensagem: 'Endereço removido' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};