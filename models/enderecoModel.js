const pool = require('../config/database');

module.exports = {
  async criar(clienteId, dados) {
    const { rows } = await pool.query(
      `INSERT INTO enderecos 
        (cliente_id, nome_destinatario, tipo, logradouro, numero, complemento, bairro, cidade, estado, cep)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        clienteId, dados.nome_destinatario, dados.tipo || 'entrega',
        dados.logradouro, dados.numero, dados.complemento,
        dados.bairro, dados.cidade, dados.estado, dados.cep
      ]
    );
    return rows[0];
  },

  async listarPorCliente(clienteId) {
    const { rows } = await pool.query(
      `SELECT * FROM enderecos WHERE cliente_id=$1 ORDER BY id`,
      [clienteId]
    );
    return rows;
  },

  async atualizar(id, clienteId, dados) {
    const { rows } = await pool.query(
      `UPDATE enderecos SET 
        nome_destinatario=$1, tipo=$2, logradouro=$3, numero=$4,
        complemento=$5, bairro=$6, cidade=$7, estado=$8, cep=$9
       WHERE id=$10 AND cliente_id=$11 RETURNING *`,
      [
        dados.nome_destinatario, dados.tipo, dados.logradouro,
        dados.numero, dados.complemento, dados.bairro,
        dados.cidade, dados.estado, dados.cep, id, clienteId
      ]
    );
    return rows[0];
  },

  async remover(id, clienteId) {
    await pool.query(
      `DELETE FROM enderecos WHERE id=$1 AND cliente_id=$2`, [id, clienteId]
    );
  }
};