const Cliente = require('../models/clienteModel');
const bcrypt = require('bcryptjs');

module.exports = {
  /**
   * Realiza a autenticação do cliente e cria a sessão persistente no banco de dados.
   */
  async login(req, res) {
    try {
      const { email, senha } = req.body;

      // Validação básica de campos
      if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });
      }

      // Busca o cliente pelo e-mail
      const cliente = await Cliente.buscarPorEmail(email);

      // Verifica se o cliente existe
      if (!cliente) {
        return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
      }

      // Verifica se a conta está ativa (Regra de Negócio)
      if (!cliente.ativo) {
        return res.status(403).json({ erro: 'Conta inativa. Entre em contato com o suporte.' });
      }

      // Compara a senha enviada com o hash salvo no banco
      const senhaValida = await bcrypt.compare(senha, cliente.senha);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
      }

      // 1. Armazena os dados básicos do cliente na sessão (REQ.SESSION)
      // Nota: Não salvamos a senha aqui por segurança.
      req.session.cliente = {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email
      };

      /**
       * 2. FORÇAR O SALVAMENTO NO BANCO (CRUCIAL)
       * Como usamos o 'connect-pg-simple', o salvamento no banco de dados Neon é assíncrono.
       * Usamos o callback do .save() para garantir que o servidor só responda ao cliente
       * DEPOIS que a "chave" (cookie) estiver garantida no banco de dados.
       */
      req.session.save((err) => {
        if (err) {
          console.error("Erro ao persistir sessão no Neon DB:", err);
          return res.status(500).json({ erro: 'Erro interno ao processar login' });
        }
        
        // Retorno de sucesso com os dados do cliente para o Frontend
        res.json({
          mensagem: 'Login realizado com sucesso',
          cliente: req.session.cliente
        });
      });

    } catch (err) {
      console.error("Erro no processo de login:", err);
      res.status(500).json({ erro: 'Erro no servidor: ' + err.message });
    }
  },

  /**
   * Encerra a sessão do cliente e remove os dados do banco e do navegador.
   */
  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ erro: 'Erro ao processar logout' });
      }
      // Limpa o cookie de identificação no lado do cliente (Navegador/Thunder Client)
      res.clearCookie('connect.sid'); 
      res.json({ mensagem: 'Logout realizado com sucesso' });
    });
  },

  /**
   * Retorna os dados do cliente logado atualmente.
   * Utilizado pelo Frontend para verificar se o usuário ainda está autenticado.
   */
  async perfil(req, res) {
    // Se a sessão existir e tiver um cliente, ele está autenticado
    if (req.session && req.session.cliente) {
      return res.json(req.session.cliente);
    }
    
    // Caso contrário, retorna erro de não autenticado (401)
    res.status(401).json({ erro: 'Não autenticado' });
  }
};