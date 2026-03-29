const pool = require('../config/database');

module.exports = {

  async adicionar(clienteId, pneuId, quantidade) {
    // Busca o pneu e verifica estoque
    const { rows: [pneu] } = await pool.query(
      `SELECT id, preco_venda, estoque FROM pneus WHERE id = $1 AND ativo = TRUE`,
      [pneuId]
    );
    if (!pneu) throw new Error('Pneu não encontrado ou inativo.');
    if (pneu.estoque < quantidade) throw new Error('Estoque insuficiente.');

    // Verifica se já existe no carrinho desse cliente
    const { rows: [existente] } = await pool.query(
      `SELECT id, quantidade FROM itens_carrinho WHERE cliente_id = $1 AND pneu_id = $2`,
      [clienteId, pneuId]
    );

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    if (existente) {
      // Atualiza quantidade e renova expiração
      const novaQtd = existente.quantidade + quantidade;
      if (pneu.estoque < novaQtd) throw new Error('Estoque insuficiente para a quantidade total.');
      const { rows: [atualizado] } = await pool.query(
        `UPDATE itens_carrinho SET quantidade = $1, expira_em = $2
         WHERE id = $3 RETURNING *`,
        [novaQtd, expiraEm, existente.id]
      );
      return atualizado;
    }

    // Insere novo item
    const { rows: [item] } = await pool.query(
      `INSERT INTO itens_carrinho (cliente_id, pneu_id, quantidade, preco_unitario, expira_em)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clienteId, pneuId, quantidade, pneu.preco_venda, expiraEm]
    );
    return item;
  },

  async listar(clienteId) {
    // Remove itens expirados antes de listar
    await pool.query(
      `DELETE FROM itens_carrinho WHERE cliente_id = $1 AND expira_em < NOW()`,
      [clienteId]
    );

    const { rows } = await pool.query(
      `SELECT ic.id, ic.quantidade, ic.preco_unitario, ic.expira_em,
              p.id AS pneu_id, p.marca, p.modelo, p.largura, p.perfil, p.aro,
              p.imagem_url, p.estoque
       FROM itens_carrinho ic
       JOIN pneus p ON p.id = ic.pneu_id
       WHERE ic.cliente_id = $1
       ORDER BY ic.id`,
      [clienteId]
    );
    return rows;
  },

  async remover(clienteId, itemId) {
    const { rowCount } = await pool.query(
      `DELETE FROM itens_carrinho WHERE id = $1 AND cliente_id = $2`,
      [itemId, clienteId]
    );
    if (!rowCount) throw new Error('Item não encontrado no carrinho.');
  },

  async atualizarQuantidade(clienteId, itemId, quantidade) {
    if (quantidade < 1) throw new Error('Quantidade mínima é 1.');

    // Verifica estoque do pneu
    const { rows: [item] } = await pool.query(
      `SELECT ic.pneu_id, p.estoque FROM itens_carrinho ic
       JOIN pneus p ON p.id = ic.pneu_id
       WHERE ic.id = $1 AND ic.cliente_id = $2`,
      [itemId, clienteId]
    );
    if (!item) throw new Error('Item não encontrado.');
    if (item.estoque < quantidade) throw new Error('Estoque insuficiente.');

    const { rows: [atualizado] } = await pool.query(
      `UPDATE itens_carrinho SET quantidade = $1, expira_em = $2
       WHERE id = $3 AND cliente_id = $4 RETURNING *`,
      [quantidade, new Date(Date.now() + 30 * 60 * 1000), itemId, clienteId]
    );
    return atualizado;
  },

  async limpar(clienteId) {
    await pool.query(
      `DELETE FROM itens_carrinho WHERE cliente_id = $1`,
      [clienteId]
    );
  },

  async validarCupom(codigo, clienteId) {
    const { rows: [cupom] } = await pool.query(
      `SELECT * FROM cupons
       WHERE codigo = $1
         AND usado = FALSE
         AND (validade IS NULL OR validade > NOW())
         AND (cliente_id IS NULL OR cliente_id = $2)`,
      [codigo, clienteId]
    );
    if (!cupom) throw new Error('Cupom inválido, expirado ou já utilizado.');
    return cupom;
  }
};