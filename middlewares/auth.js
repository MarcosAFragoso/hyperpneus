module.exports = {
  exigirLogin(req, res, next) {
    if (!req.session.cliente)
      return res.status(401).json({ erro: 'Acesso negado. Faça login.' });
    next();
  },

  exigirAdmin(req, res, next) {
    if (!req.session.admin)
      return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    next();
  }
};