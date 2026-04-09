const Pedido = require('../models/pedidoModel');
const pool = require('../config/database');

// ── Tabela de frete por tipo (backend é a fonte da verdade) ───
const TABELA_FRETE = {
  PAC:      { percentual: 0.07, minimo: 15.00 },
  SEDEX:    { percentual: 0.10, minimo: 35.00 },
  RETIRADA: { percentual: 0,    minimo: 0     }
};

function calcularFrete(tipoFrete, subtotal) {
  const regra = TABELA_FRETE[tipoFrete?.toUpperCase()] || TABELA_FRETE['PAC'];
  return Math.max(regra.minimo, subtotal * regra.percentual);
}

module.exports = {

  async finalizar(req, res) {
    try {
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Faça login para finalizar a compra.' });

      const { endereco_id, cartoes, cupom_codigo, cupom_troca_codigo, tipo_frete } = req.body;

      if (!endereco_id) return res.status(400).json({ erro: 'Selecione um endereço de entrega.' });

      // Frete calculado no backend — valor do frontend é ignorado
      // O frontend envia tipo_frete, o backend calcula o valor correto
      const resultado = await Pedido.finalizar(clienteId, {
        enderecoId:       endereco_id,
        cartoes:          cartoes || [],
        cupomCodigo:      cupom_codigo      || null,
        cupomTrocaCodigo: cupom_troca_codigo || null,
        tipoFrete:        tipo_frete         || 'PAC'
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

      for (const item of itensParaTroca) {
        const { rows } = await client.query(
          'SELECT id FROM trocas WHERE pedido_id = $1 AND pneu_id = $2',
          [pedidoId, item.pneu_id]
        );
        if (rows.length > 0)
          throw new Error(`Este item (ID ${item.pneu_id}) já foi trocado neste pedido.`);
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

      for (const item of itensParaTroca) {
        await client.query(
          `INSERT INTO trocas (pedido_id, pneu_id, quantidade_trocada, cupom_id)
           VALUES ($1, $2, $3, $4)`,
          [pedidoId, item.pneu_id, item.qtd, cupomId]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ mensagem: 'Troca processada!', codigo: codigoCupom });

    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ erro: err.message });
    } finally {
      client.release();
    }
  }
};
