const Pneu = require('../models/pneuModel');
const pool = require('../config/database');

module.exports = {

  async listar(req, res) {
    try {
      const { carro, ...filtros } = req.query;

      // Se buscou por carro, consulta tabela carros e filtra por medida
      if (carro && carro.trim().length >= 2) {
        const termo = `%${carro.toLowerCase()}%`;
        const { rows: carros } = await pool.query(
          `SELECT largura, perfil, aro, marca, modelo
           FROM carros
           WHERE LOWER(marca)  LIKE $1
              OR LOWER(modelo) LIKE $1
              OR LOWER(id)     LIKE $1
           ORDER BY marca, modelo
           LIMIT 1`,
          [termo]
        );

        if (!carros.length) {
          return res.json([]); // carro não encontrado na base
        }

        const { largura, perfil, aro } = carros[0];
        const pneus = await Pneu.listar({ largura, perfil, aro, ativo: true });
        return res.json(pneus);
      }

      // Busca normal por medidas/marca
      const pneus = await Pneu.listar(filtros);
      res.json(pneus);

    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async buscar(req, res) {
    try {
      const pneu = await Pneu.buscarPorId(req.params.id);
      if (!pneu) return res.status(404).json({ erro: 'Pneu não encontrado' });
      res.json(pneu);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const pneu = await Pneu.criar(req.body);
      res.status(201).json(pneu);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ erro: 'SKU ou EAN já cadastrado' });
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      const pneu = await Pneu.atualizar(req.params.id, req.body);
      res.json(pneu);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async inativar(req, res) {
    try {
      await Pneu.inativar(req.params.id);
      res.json({ mensagem: 'Pneu inativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async ativar(req, res) {
    try {
      await Pneu.ativar(req.params.id);
      res.json({ mensagem: 'Pneu ativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarEstoque(req, res) {
    try {
      const resultado = await Pneu.atualizarEstoque(req.params.id, req.body.quantidade);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};
