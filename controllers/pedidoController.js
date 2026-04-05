const Pedido = require('../models/pedidoModel');
const pool = require('../config/database');

module.exports = {

  async finalizar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Faça login para finalizar a compra.' });

      const { endereco_id, cartoes, cupom_codigo, cupom_troca_codigo, frete } = req.body;
      if (!endereco_id) return res.status(400).json({ erro: 'Selecione um endereço de entrega.' });
      if (!cartoes?.length) return res.status(400).json({ erro: 'Informe ao menos um cartão.' });

      const resultado = await Pedido.finalizar(clienteId, {
        enderecoId: endereco_id,
        cartoes,
        cupomCodigo: cupom_codigo || null,
        cupomTrocaCodigo: cupom_troca_codigo || null,
        freteValor: frete ?? 15.00
      });

      res.status(201).json(resultado);
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async listar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const pedidos = await Pedido.listar(clienteId);
      res.json(pedidos);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async buscar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const pedido = await Pedido.buscar(clienteId, req.params.id);
      res.json(pedido);
    } catch (err) {
      res.status(404).json({ erro: err.message });
    }
  },

  async migrarCarrinho(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const { itens } = req.body;
      if (!itens?.length) return res.json({ mensagem: 'Nenhum item para migrar.' });
      await Pedido.migrarCarrinhoAnonimo(clienteId, itens);
      res.json({ mensagem: 'Carrinho migrado com sucesso.' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await Pedido.atualizarStatus(id, status);
      res.json({ mensagem: 'Status atualizado com sucesso.' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async gerarCupomTroca(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });

      const { pedidoId, valor, acao } = req.body;

      // Verifica se já existe uma troca para este pedido
      const { rows: jaExiste } = await pool.query(
        'SELECT id FROM cupons WHERE pedido_origem_id = $1', [pedidoId]
      );
      if (jaExiste.length > 0) return res.status(400).json({ erro: 'Troca já solicitada para este pedido.' });

      // Se for estorno, apenas valida e finaliza
      if (acao === 'Estorno') {
        return res.status(201).json({ mensagem: 'Solicitação de estorno enviada para análise.' });
      }

      // Se for Vale-Troca, gera o cupom
      const codigo = 'TROCA-' + Math.random().toString(36).substr(2, 6).toUpperCase();

      await pool.query(
        `INSERT INTO cupons (codigo, cliente_id, valor, tipo, usado, validade, pedido_origem_id)
         VALUES ($1, $2, $3, 'troca', FALSE, NULL, $4)`,
        [codigo, clienteId, valor, pedidoId]
      );

      res.status(201).json({ mensagem: 'Cupom gerado!', codigo: codigo });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};