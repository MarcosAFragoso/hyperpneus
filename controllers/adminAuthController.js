const pool = require('../config/database');
const bcrypt = require('bcryptjs');

module.exports = {

  async login(req, res) {
    try {
      const { usuario, senha } = req.body;
      if (!usuario || !senha)
        return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });

      const { rows: [admin] } = await pool.query(
        'SELECT * FROM admins WHERE usuario = $1', [usuario]
      );
      if (!admin)
        return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

      const ok = await bcrypt.compare(senha, admin.senha);
      if (!ok)
        return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

      req.session.admin = { id: admin.id, usuario: admin.usuario };

      req.session.save(err => {
        if (err) return res.status(500).json({ erro: 'Erro ao criar sessão.' });
        res.json({ mensagem: 'Login admin realizado.', admin: req.session.admin });
      });

    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async logout(req, res) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ mensagem: 'Logout realizado.' });
    });
  },

  async perfil(req, res) {
    if (req.session?.admin)
      return res.json(req.session.admin);
    res.status(401).json({ erro: 'Não autenticado como admin.' });
  }
};
