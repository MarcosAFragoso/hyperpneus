const pool = require('../config/database');
const Carrinho = require('../models/carrinhoModel');

module.exports = {

  async listar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (clienteId) {
        const itens = await Carrinho.listar(clienteId);
        const total = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
        return res.json({ itens, total: parseFloat(total.toFixed(2)) });
      }
      res.json({ itens: [], total: 0, anonimo: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async adicionar(req, res) {
    try {
      const { pneu_id, quantidade = 1 } = req.body;
      if (!pneu_id) return res.status(400).json({ erro: 'pneu_id é obrigatório.' });

      const clienteId = req.session.cliente?.id;

      if (clienteId) {
        const item = await Carrinho.adicionar(clienteId, pneu_id, quantidade);
        return res.status(201).json(item);
      }

      const { rows: [pneu] } = await pool.query(
        `SELECT id, marca, modelo, largura, perfil, aro,
                preco_venda, estoque, imagem_url
         FROM pneus WHERE id = $1 AND ativo = TRUE`,
        [pneu_id]
      );
      if (!pneu) return res.status(404).json({ erro: 'Pneu não encontrado.' });
      if (pneu.estoque < quantidade) return res.status(400).json({ erro: 'Estoque insuficiente.' });

      res.status(200).json({
        anonimo: true,
        item: {
          pneu_id: pneu.id,
          marca: pneu.marca,
          modelo: pneu.modelo,
          largura: pneu.largura,
          perfil: pneu.perfil,
          aro: pneu.aro,
          preco_unitario: pneu.preco_venda,
          imagem_url: pneu.imagem_url,
          quantidade
        }
      });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async remover(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      await Carrinho.remover(clienteId, req.params.itemId);
      res.json({ mensagem: 'Item removido.' });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const { quantidade } = req.body;
      const item = await Carrinho.atualizarQuantidade(clienteId, req.params.itemId, quantidade);
      res.json(item);
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async validarCupom(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const { codigo } = req.body;
      const cupom = await Carrinho.validarCupom(codigo, clienteId);
      res.json({ valido: true, cupom });
    } catch (err) {
      res.status(400).json({ valido: false, erro: err.message });
    }
  }
};