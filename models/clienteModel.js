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

  async listar() {
    const { rows } = await pool.query(
      `SELECT id, nome, sobrenome, cpf, email, ativo, criado_em FROM clientes ORDER BY nome`
    );
    return rows;
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