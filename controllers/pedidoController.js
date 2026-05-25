const Pedido = require('../models/pedidoModel');
const pool = require('../config/database');

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
      const resultado = await Pedido.finalizar(clienteId, {
        enderecoId:       endereco_id,
        cartoes:          cartoes || [],
        cupomCodigo:      cupom_codigo       || null,
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

  async cancelar(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clienteId = req.session.cliente?.id;
      if (!clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
      const { rows: [pedido] } = await client.query(
        'SELECT id, status, cliente_id FROM pedidos WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!pedido) throw new Error('Pedido não encontrado.');
      if (pedido.cliente_id !== clienteId)
        throw new Error('Você não tem permissão para cancelar este pedido.');
      const cancelaveis = ['AGUARDANDO_PAGAMENTO', 'EM_PROCESSAMENTO'];
      if (!cancelaveis.includes(pedido.status))
        throw new Error(`Não é possível cancelar um pedido com status "${pedido.status}".`);
      const { rows: itens } = await client.query(
        'SELECT pneu_id, quantidade FROM itens_pedido WHERE pedido_id = $1',
        [pedido.id]
      );
      for (const item of itens) {
        await client.query(
          'UPDATE pneus SET estoque = estoque + $1 WHERE id = $2',
          [item.quantidade, item.pneu_id]
        );
      }
      await client.query(
        `UPDATE pedidos SET status = 'CANCELADO', atualizado_em = now() WHERE id = $1`,
        [pedido.id]
      );
      await client.query('COMMIT');
      res.json({ mensagem: 'Pedido cancelado com sucesso.' });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(400).json({ erro: err.message });
    } finally {
      client.release();
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

  // ── BLOQUEADO para cliente — status logístico só via admin ──
  async atualizarStatus(req, res) {
    return res.status(403).json({
      erro: 'Atualização de status só pode ser feita pelo administrador.'
    });
  },

  // ── NOVA LÓGICA: cliente solicita troca SEM gerar cupom ──────
  // Cupom só é gerado quando o admin aceitar (adminTrocaController.aceitar)
  async gerarCupomTroca(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clienteId = req.session.cliente?.id;
      if (!clienteId) throw new Error('Não autenticado.');

      const { pedidoId, itensParaTroca, acao } = req.body;

      // Valida que o pedido pertence ao cliente
      const { rows: [pedido] } = await client.query(
        'SELECT id, cliente_id, status FROM pedidos WHERE id = $1',
        [pedidoId]
      );
      if (!pedido) throw new Error('Pedido não encontrado.');
      if (pedido.cliente_id !== clienteId)
        throw new Error('Você não tem permissão para solicitar troca neste pedido.');
      if (pedido.status !== 'ENTREGUE')
        throw new Error('Só é possível solicitar troca de pedidos com status ENTREGUE.');

      // Verifica se algum item já foi trocado
      for (const item of itensParaTroca) {
        const { rows } = await client.query(
          'SELECT id FROM trocas WHERE pedido_id = $1 AND pneu_id = $2',
          [pedidoId, item.pneu_id]
        );
        if (rows.length > 0)
          throw new Error(`Este item já possui uma solicitação de troca ativa neste pedido.`);
      }

      // Insere trocas como PENDENTE — SEM cupom por enquanto
      // O admin gera o cupom ao aceitar (adminTrocaController.aceitar)
      for (const item of itensParaTroca) {
        await client.query(
          `INSERT INTO trocas (pedido_id, pneu_id, quantidade_trocada, cupom_id, status)
           VALUES ($1, $2, $3, NULL, 'PENDENTE')`,
          [pedidoId, item.pneu_id, item.qtd]
        );
      }

      // Salva a ação desejada no banco para o admin saber o que o cliente quer
      // (Vale-Troca ou Estorno) — usamos admin_obs como campo transitório
      await client.query(
        `UPDATE trocas SET admin_obs = $1
         WHERE pedido_id = $2 AND status = 'PENDENTE' AND cupom_id IS NULL`,
        [`ACAO_CLIENTE:${acao}`, pedidoId]
      );

      await client.query('COMMIT');

      // Mensagem diferente por ação — sem revelar cupom ainda
      const mensagem = acao === 'Estorno'
        ? 'Solicitação de estorno enviada! Aguarde a análise do administrador.'
        : 'Solicitação de troca enviada! O cupom será gerado após aprovação do administrador.';

      res.status(201).json({ mensagem, codigo: null, pendente: true });

    } catch (err) {
      await client.query('ROLLBACK');
      res.status(400).json({ erro: err.message });
    } finally {
      client.release();
    }
  }
};
