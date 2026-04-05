const pool = require('../config/database');

module.exports = {
  async criar(clienteId, dados) {
    if (dados.principal) {
      await pool.query(
        `UPDATE cartoes SET principal=FALSE WHERE cliente_id=$1`, [clienteId]
      );
    }
    const { rows } = await pool.query(
      `INSERT INTO cartoes (cliente_id, bandeira, nome_impresso, numero_final, token, principal)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, bandeira, nome_impresso, numero_final, principal`,
      [clienteId, dados.bandeira, dados.nome_impresso, dados.numero_final, dados.token, dados.principal || false]
    );
    return rows[0];
  },

  async listarPorCliente(clienteId) {
    const { rows } = await pool.query(
      `SELECT id, bandeira, nome_impresso, numero_final, principal, criado_em
       FROM cartoes WHERE cliente_id=$1 ORDER BY principal DESC, criado_em`,
      [clienteId]
    );
    return rows;
  },

  async definirPrincipal(id, clienteId) {
    await pool.query(
      `UPDATE cartoes SET principal=FALSE WHERE cliente_id=$1`, [clienteId]
    );
    const { rows } = await pool.query(
      `UPDATE cartoes SET principal=TRUE WHERE id=$1 AND cliente_id=$2 RETURNING id, bandeira, numero_final, principal`,
      [id, clienteId]
    );
    return rows[0];
  },

  async atualizar(id, clienteId, dados) {
  if (dados.principal) {
    await pool.query(
      `UPDATE cartoes SET principal=FALSE WHERE cliente_id=$1`,
      [clienteId]
    );
  }

  const { rows } = await pool.query(
    `UPDATE cartoes 
     SET bandeira=$1, nome_impresso=$2, numero_final=$3, principal=$4
     WHERE id=$5 AND cliente_id=$6
     RETURNING id, bandeira, nome_impresso, numero_final, principal`,
    [
      dados.bandeira,
      dados.nome_impresso,
      dados.numero_final,
      dados.principal || false,
      id,
      clienteId
    ]
  );

  return rows[0];
},

  async remover(id, clienteId) {
    await pool.query(
      `DELETE FROM cartoes WHERE id=$1 AND cliente_id=$2`, [id, clienteId]
    );
  }
};