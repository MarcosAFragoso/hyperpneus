const Pedido = require('../models/pedidoModel');
const pool = require('../config/database');

module.exports = {

  async finalizar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Faça login para finalizar a compra.' });

      const {
        endereco_id,
        cartoes,
        cupom_codigo,
        cupom_troca_codigo,
        frete,
        tipo_frete
      } = req.body;

      if (!endereco_id) return res.status(400).json({ erro: 'Selecione um endereço de entrega.' });

      // AJUSTE 1: Lógica do Frete
      // Se for retirada, o valor é 0. Caso contrário, usa o valor enviado ou 0 como fallback (não 15.00)
      const valorFinalFrete = (tipo_frete === 'RETIRADA') ? 0.00 : (frete ?? 0.00);

      // AJUSTE 2: Validação de Cartões Dinâmica
      // Calculamos o total esperado para saber se o cartão é realmente obrigatório
      // (Essa verificação também é feita no Model, mas aqui evitamos o erro 400 prematuro)
      // Se não houver cartões E o total visual não for zero, o Model lançará o erro apropriado.

      const resultado = await Pedido.finalizar(clienteId, {
        enderecoId: endereco_id,
        cartoes: cartoes || [], // Envia array vazio se não houver cartões
        cupomCodigo: cupom_codigo || null,
        cupomTrocaCodigo: cupom_troca_codigo || null,
        freteValor: valorFinalFrete
      });

      res.status(201).json(resultado);
    } catch (err) {
      // Aqui capturamos erros como "Valor mínimo por cartão" ou "Soma não cobre o total"
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

      const { rows: trocas } = await pool.query(
        `SELECT t.pneu_id, t.quantidade_trocada, t.status, c.codigo
       FROM trocas t
       LEFT JOIN cupons c ON t.cupom_id = c.id
       WHERE t.pedido_id = $1`,
        [req.params.id]
      );

      res.json({ ...pedido, trocasFeitas: trocas });
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

      for (let item of itensParaTroca) {
        const { rows } = await client.query(
          'SELECT id FROM trocas WHERE pedido_id = $1 AND pneu_id = $2',
          [pedidoId, item.pneu_id]
        );
        if (rows.length > 0) throw new Error(`Este item (ID ${item.pneu_id}) já foi trocado neste pedido.`);
      }

      let cupomId = null;
      let codigoCupom = 'ESTORNO';

      if (acao === 'Vale-Troca') {
        codigoCupom = 'TROCA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const { rows: [cupom] } = await client.query(
          `INSERT INTO cupons (codigo, cliente_id, valor, tipo, usado, validade)
           VALUES ($1, $2, $3, 'troca', FALSE, NULL) RETURNING id`,
          [codigoCupom, clienteId, valorTotal]
        );
        cupomId = cupom.id;
      }

      for (let item of itensParaTroca) {
        await client.query(
          `INSERT INTO trocas (pedido_id, pneu_id, quantidade_trocada, cupom_id) 
           VALUES ($1, $2, $3, $4)`,
          [pedidoId, item.pneu_id, item.qtd, cupomId]
        );
      }

      await client.query('COMMIT');

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