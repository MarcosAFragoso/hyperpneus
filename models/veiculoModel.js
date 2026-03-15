const pool = require('../config/database');

module.exports = {
  async criar(clienteId, dados) {
    if (dados.principal) {
      await pool.query(
        `UPDATE veiculos SET principal=FALSE WHERE cliente_id=$1`, [clienteId]
      );
    }
    const { rows } = await pool.query(
      `INSERT INTO veiculos (cliente_id, marca, modelo, ano, versao, principal)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clienteId, dados.marca, dados.modelo, dados.ano, dados.versao, dados.principal || false]
    );
    return rows[0];
  },

  async listarPorCliente(clienteId) {
    const { rows } = await pool.query(
      `SELECT * FROM veiculos WHERE cliente_id=$1 ORDER BY principal DESC, criado_em`,
      [clienteId]
    );
    return rows;
  },

  async buscarPorId(id) {
    const { rows } = await pool.query(
      `SELECT * FROM veiculos WHERE id=$1`, [id]
    );
    return rows[0];
  },

  async definirPrincipal(id, clienteId) {
    await pool.query(
      `UPDATE veiculos SET principal=FALSE WHERE cliente_id=$1`, [clienteId]
    );
    const { rows } = await pool.query(
      `UPDATE veiculos SET principal=TRUE WHERE id=$1 AND cliente_id=$2 RETURNING *`,
      [id, clienteId]
    );
    return rows[0];
  },

  async remover(id, clienteId) {
    await pool.query(
      `DELETE FROM veiculos WHERE id=$1 AND cliente_id=$2`, [id, clienteId]
    );
  }
};