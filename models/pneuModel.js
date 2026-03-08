const pool = require('../config/database');

module.exports = {
  async criar(dados) {
    const { rows } = await pool.query(
      `INSERT INTO pneus 
        (marca, modelo, largura, perfil, aro, indice_carga, indice_velocidade, 
         tipo_desenho, dot, preco_custo, preco_venda, estoque, sku, ean,
         inmetro_consumo, inmetro_aderencia, inmetro_ruido)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        dados.marca, dados.modelo, dados.largura, dados.perfil, dados.aro,
        dados.indice_carga, dados.indice_velocidade, dados.tipo_desenho,
        dados.dot, dados.preco_custo, dados.preco_venda,
        dados.estoque || 0, dados.sku, dados.ean,
        dados.inmetro_consumo, dados.inmetro_aderencia, dados.inmetro_ruido
      ]
    );
    return rows[0];
  },

  async listar(filtros = {}) {
    let query = `SELECT * FROM pneus WHERE 1=1`;
    const params = [];
    let i = 1;

    if (filtros.largura) { query += ` AND largura = $${i++}`; params.push(filtros.largura); }
    if (filtros.perfil)  { query += ` AND perfil = $${i++}`;  params.push(filtros.perfil); }
    if (filtros.aro)     { query += ` AND aro = $${i++}`;     params.push(filtros.aro); }
    if (filtros.marca)   { query += ` AND LOWER(marca) LIKE $${i++}`; params.push(`%${filtros.marca.toLowerCase()}%`); }
    if (filtros.ativo !== undefined) { query += ` AND ativo = $${i++}`; params.push(filtros.ativo); }

    query += ` ORDER BY marca, modelo`;
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async buscarPorId(id) {
    const { rows } = await pool.query(`SELECT * FROM pneus WHERE id = $1`, [id]);
    return rows[0];
  },

  async atualizar(id, dados) {
    const { rows } = await pool.query(
      `UPDATE pneus SET 
        marca=$1, modelo=$2, largura=$3, perfil=$4, aro=$5,
        indice_carga=$6, indice_velocidade=$7, tipo_desenho=$8,
        preco_custo=$9, preco_venda=$10, estoque=$11,
        inmetro_consumo=$12, inmetro_aderencia=$13, inmetro_ruido=$14
       WHERE id=$15 RETURNING *`,
      [
        dados.marca, dados.modelo, dados.largura, dados.perfil, dados.aro,
        dados.indice_carga, dados.indice_velocidade, dados.tipo_desenho,
        dados.preco_custo, dados.preco_venda, dados.estoque,
        dados.inmetro_consumo, dados.inmetro_aderencia, dados.inmetro_ruido,
        id
      ]
    );
    return rows[0];
  },

  async inativar(id) {
    await pool.query(`UPDATE pneus SET ativo=FALSE WHERE id=$1`, [id]);
  },

  async ativar(id) {
    await pool.query(`UPDATE pneus SET ativo=TRUE WHERE id=$1`, [id]);
  },

  async atualizarEstoque(id, quantidade) {
    const { rows } = await pool.query(
      `UPDATE pneus SET estoque = estoque + $1 WHERE id = $2 RETURNING estoque`,
      [quantidade, id]
    );
    return rows[0];
  }
};