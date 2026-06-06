const pool = require('../config/database');
const bcrypt = require('bcryptjs');

module.exports = {
  async criar(dados) {
    const hash = await bcrypt.hash(dados.senha, 10);
    const { rows } = await pool.query(
      `INSERT INTO clientes (nome, sobrenome, cpf, email, senha)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email`,
      [dados.nome, dados.sobrenome, dados.cpf, dados.email, hash]
    );
    return rows[0];
  },

  async listar({ page = 1, limit = 10, busca = '' } = {}) {
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (busca) {
      params.push(`%${busca}%`);
      where = `WHERE (nome ILIKE $1 OR sobrenome ILIKE $1 OR email ILIKE $1)`;
    }

    const { rows } = await pool.query(
      `SELECT id, nome, sobrenome, cpf, email, ativo, criado_em
       FROM clientes
       ${where}
       ORDER BY nome
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: [countRow] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM clientes ${where}`,
      params
    );

    return { clientes: rows, total: countRow.total };
  },

  async buscarPorId(id) {
    const { rows } = await pool.query(
      `SELECT id, nome, sobrenome, cpf, email, ativo FROM clientes WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  async atualizar(id, dados) {
    const { rows } = await pool.query(
      `UPDATE clientes SET nome=$1, sobrenome=$2, email=$3 WHERE id=$4 
       RETURNING id, nome, sobrenome, cpf, email, ativo, criado_em`,
      [dados.nome, dados.sobrenome, dados.email, id]
    );
    return rows[0];
  },

  async inativar(id) {
    await pool.query(`UPDATE clientes SET ativo=FALSE WHERE id=$1`, [id]);
  },

  async ativar(id) {
    await pool.query(`UPDATE clientes SET ativo=TRUE WHERE id=$1`, [id]);
  },

  async buscarPorEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM clientes WHERE email = $1`, [email]
    );
    return rows[0];
  }
};