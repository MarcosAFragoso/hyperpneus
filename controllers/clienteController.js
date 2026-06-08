const Cliente = require('../models/clienteModel');

// ── Helper: Validação de CPF (algoritmo oficial) ──────────────
function validarCPF(cpf) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

module.exports = {

  async listar(req, res) {
    try {
      const page  = Math.max(parseInt(req.query.page)  || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const busca = req.query.busca?.trim() || '';
      const { clientes, total } = await Cliente.listar({ page, limit, busca });
      res.json({ clientes, total, pages: Math.max(Math.ceil(total / limit), 1), page });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async buscar(req, res) {
    try {
      // Clientes só podem ver o próprio perfil; admin pode ver qualquer um
      const isAdmin = !!req.session.admin;
      const isSelf  = String(req.session.cliente?.id) === String(req.params.id);
      if (!isAdmin && !isSelf)
        return res.status(403).json({ erro: 'Acesso negado.' });

      const cliente = await Cliente.buscarPorId(req.params.id);
      if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
      res.json(cliente);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criar(req, res) {
    try {
      const { nome, sobrenome, cpf, email, senha } = req.body;

      // Validações básicas de presença
      if (!nome || !sobrenome || !cpf || !email || !senha)
        return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });

      if (senha.length < 8)
        return res.status(400).json({ erro: 'A senha deve ter no mínimo 8 caracteres.' });

      // Validação de CPF no backend
      if (!validarCPF(cpf))
        return res.status(400).json({ erro: 'CPF inválido. Verifique os dígitos informados.' });

      const cliente = await Cliente.criar(req.body);
      res.status(201).json(cliente);

    } catch (err) {
      // Erro 23505 = violação de unique constraint no PostgreSQL
      if (err.code === '23505') {
        // Identifica qual campo causou o conflito pelo nome da constraint
        if (err.constraint?.includes('cpf'))
          return res.status(400).json({ erro: 'Este CPF já está cadastrado.' });
        if (err.constraint?.includes('email'))
          return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
        return res.status(400).json({ erro: 'CPF ou e-mail já cadastrado.' });
      }
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizar(req, res) {
    try {
      // Apenas o próprio cliente pode atualizar seus dados
      if (String(req.session.cliente?.id) !== String(req.params.id))
        return res.status(403).json({ erro: 'Acesso negado.' });

      const cliente = await Cliente.atualizar(req.params.id, req.body);
      res.json(cliente);
    } catch (err) {
      if (err.code === '23505' && err.constraint?.includes('email'))
        return res.status(400).json({ erro: 'Este e-mail já está em uso.' });
      res.status(500).json({ erro: err.message });
    }
  },

  async inativar(req, res) {
    try {
      await Cliente.inativar(req.params.id);
      res.json({ mensagem: 'Cliente inativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async ativar(req, res) {
    try {
      await Cliente.ativar(req.params.id);
      res.json({ mensagem: 'Cliente ativado' });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
};
