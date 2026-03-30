const pool = require('../config/database');

module.exports = {

  async finalizar(clienteId, { endereco_id, cartoes, cupomCodigo, freteValor }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Busca itens do carrinho
      const { rows: itens } = await client.query(
        `SELECT ic.pneu_id, ic.quantidade, ic.preco_unitario, p.estoque
         FROM itens_carrinho ic
         JOIN pneus p ON p.id = ic.pneu_id
         WHERE ic.cliente_id = $1 AND ic.expira_em > NOW()`,[clienteId]
      );
      if (!itens.length) throw new Error('Carrinho vazio ou expirado.');

      // 2. Verifica estoque de cada item
      for (const item of itens) {
        if (item.estoque < item.quantidade)
          throw new Error(`Estoque insuficiente para o pneu ${item.pneu_id}.`);
      }

      // 3. Calcula subtotal
      const subtotal = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);

      // 4. Calcula frete (vem do frontend/checkout)
      const valorFrete = parseFloat(freteValor) || 15.00;

      // 5. Aplica cupom se informado
      let cupomId = null;
    let desconto = 0;

    const aplicarCupom = async (codigo) => {
        if (!codigo) return 0;
        const { rows: [cupom] } = await client.query(
            `SELECT * FROM cupons
             WHERE codigo = $1 AND usado = FALSE
               AND (validade IS NULL OR validade > NOW())
               AND (cliente_id IS NULL OR cliente_id = $2)
             FOR UPDATE`,
            [codigo, clienteId]
        );
        if (!cupom) throw new Error(`Cupom "${codigo}" inválido ou expirado.`);
        await client.query(`UPDATE cupons SET usado = TRUE WHERE id = $1`, [cupom.id]);
        if (!cupomId) cupomId = cupom.id; // salva o primeiro no pedido
        return parseFloat(cupom.valor);
    };

    desconto += await aplicarCupom(cupomCodigo);
    desconto += await aplicarCupom(cupomTrocaCodigo);
    
      // 6. Total final
      const total = Math.max(0, subtotal + valorFrete - desconto);

      // 7. Valida pagamento — soma dos cartões deve cobrir o total
      if (!cartoes || !cartoes.length) throw new Error('Informe ao menos um cartão.');
      if (cartoes.length > 2) throw new Error('Máximo de 2 cartões por pedido.');
      const somaCartoes = cartoes.reduce((s, c) => s + parseFloat(c.valor), 0);
      if (Math.abs(somaCartoes - total) > 0.01)
        throw new Error(`Soma dos cartões (R$${somaCartoes.toFixed(2)}) não cobre o total (R$${total.toFixed(2)}).`);
      for (const c of cartoes) {
        if (c.valor < 10) throw new Error('Valor mínimo por cartão é R$10,00.');
      }

      // 8. Cria o pedido
      const { rows: [pedido] } = await client.query(
        `INSERT INTO pedidos (cliente_id, endereco_id, status, frete, total, cupom_id)
         VALUES ($1, $2, 'AGUARDANDO_PAGAMENTO', $3, $4, $5)
         RETURNING *`,[clienteId, endereco_id, valorFrete, total, cupomId]
      );

      // 9. Insere itens do pedido e baixa estoque
      for (const item of itens) {
        await client.query(
          `INSERT INTO itens_pedido (pedido_id, pneu_id, quantidade, preco_unitario)
           VALUES ($1, $2, $3, $4)`,[pedido.id, item.pneu_id, item.quantidade, item.preco_unitario]
        );
        await client.query(
          `UPDATE pneus SET estoque = estoque - $1 WHERE id = $2`,[item.quantidade, item.pneu_id]
        );
      }

      // 10. Registra pagamentos
      for (const c of cartoes) {
        await client.query(
          `INSERT INTO pagamentos_pedido (pedido_id, cartao_id, valor, status)
           VALUES ($1, $2, $3, 'APROVADO')`,[pedido.id, c.cartao_id, c.valor]
        );
      }

      // 11. Atualiza status para processando
      await client.query(
        `UPDATE pedidos SET status = 'EM_PROCESSAMENTO' WHERE id = $1`,
        [pedido.id]
      );

      // 12. Limpa carrinho
      await client.query(
        `DELETE FROM itens_carrinho WHERE cliente_id = $1`,
        [clienteId]
      );

      await client.query('COMMIT');

      return {
        pedido_id: pedido.id,
        status: 'EM_PROCESSAMENTO',
        subtotal: parseFloat(subtotal.toFixed(2)),
        frete: valorFrete,
        desconto: parseFloat(desconto.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        itens: itens.length
      };

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listar(clienteId) {
    const { rows } = await pool.query(
      `SELECT p.id, p.status, p.frete, p.total, p.criado_em,
              e.logradouro, e.numero, e.bairro, e.cidade, e.estado,
              COUNT(ip.id) AS qtd_itens
       FROM pedidos p
       LEFT JOIN enderecos e ON e.id = p.endereco_id
       LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
       WHERE p.cliente_id = $1
       GROUP BY p.id, e.logradouro, e.numero, e.bairro, e.cidade, e.estado
       ORDER BY p.criado_em DESC`,
      [clienteId]
    );
    return rows;
  },

  async buscar(clienteId, pedidoId) {
    const { rows: [pedido] } = await pool.query(
      `SELECT p.*, e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep
       FROM pedidos p
       LEFT JOIN enderecos e ON e.id = p.endereco_id
       WHERE p.id = $1 AND p.cliente_id = $2`,
      [pedidoId, clienteId]
    );
    if (!pedido) throw new Error('Pedido não encontrado.');

    const { rows: itens } = await pool.query(
      `SELECT ip.*, pn.marca, pn.modelo, pn.largura, pn.perfil, pn.aro, pn.imagem_url
       FROM itens_pedido ip
       JOIN pneus pn ON pn.id = ip.pneu_id
       WHERE ip.pedido_id = $1`,
      [pedidoId]
    );

    const { rows: pagamentos } = await pool.query(
      `SELECT pp.valor, pp.status, c.bandeira, c.numero_final
       FROM pagamentos_pedido pp
       JOIN cartoes c ON c.id = pp.cartao_id
       WHERE pp.pedido_id = $1`,
      [pedidoId]
    );

    return { ...pedido, itens, pagamentos };
  },

  async migrarCarrinhoAnonimo(clienteId, itensLocais) {
    for (const item of itensLocais) {
      try {
        const expiraEm = new Date(Date.now() + 30 * 60 * 1000);
        await pool.query(
          `INSERT INTO itens_carrinho (cliente_id, pneu_id, quantidade, preco_unitario, expira_em)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,[clienteId, item.pneu_id, item.quantidade, item.preco_unitario, expiraEm]
        );
      } catch (e) { /* ignora itens inválidos */ }
    }
  }
};