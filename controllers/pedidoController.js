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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clienteId = req.session.cliente?.id;
      if (!clienteId) throw new Error('Não autenticado.');

      const { pedidoId, itensParaTroca, acao, valorTotal } = req.body;

      // 1. Verifica duplicidade
      for (let item of itensParaTroca) {
        const { rows } = await client.query(
          'SELECT id FROM trocas WHERE pedido_id = $1 AND pneu_id = $2',
          [pedidoId, item.pneu_id]
        );
        if (rows.length > 0) throw new Error(`O item ${item.pneu_id} já foi trocado.`);
      }

      // 2. Prepara Cupom se for Vale-Troca
      let cupomId = null;
      let codigoCupom = 'ESTORNO'; // Padrão se for estorno

      if (acao === 'Vale-Troca') {
        codigoCupom = 'TROCA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const { rows: [cupom] } = await client.query(
          `INSERT INTO cupons (codigo, cliente_id, valor, tipo, usado, validade)
           VALUES ($1, $2, $3, 'troca', FALSE, NULL) RETURNING id`,
          [codigoCupom, clienteId, valorTotal]
        );
        cupomId = cupom.id;
      }

      // 3. Registra cada item na tabela 'trocas' (AGORA ISSO ACONTECE SEMPRE)
      for (let item of itensParaTroca) {
        await client.query(
          `INSERT INTO trocas (pedido_id, pneu_id, quantidade_trocada, cupom_id) 
           VALUES ($1, $2, $3, $4)`,
          [pedidoId, item.pneu_id, item.qtd, cupomId]
        );
      }

      await client.query('COMMIT');

      // 4. Resposta única no final
      res.status(201).json({
        mensagem: 'Troca processada!',
        codigo: codigoCupom
      });

    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ erro: err.message });
    } finally {
      client.release();
    }
  }
};