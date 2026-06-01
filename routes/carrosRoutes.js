const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/carros/buscar?termo=civic
// Busca na tabela carros por marca, modelo 
// Retorna largura, perfil e aro para filtrar pneus compatíveis
router.get('/buscar', async (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo || termo.trim().length < 2)
      return res.status(400).json({ erro: 'Digite ao menos 2 caracteres.' });

    const t = `%${termo.toLowerCase()}%`;

    const { rows } = await pool.query(
      `SELECT id, marca, modelo, periodo, categoria,
              medida_original, largura, perfil, aro
       FROM carros
       WHERE LOWER(marca)  LIKE $1
          OR LOWER(modelo) LIKE $1
          OR LOWER(id)     LIKE $1
       ORDER BY marca, modelo
       LIMIT 10`,
      [t]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/carros — lista todos para autocomplete
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, marca, modelo, periodo, categoria, medida_original, largura, perfil, aro
       FROM carros ORDER BY marca, modelo`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
