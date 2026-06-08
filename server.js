const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pg = require('pg');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ── Validação de variáveis obrigatórias ────────────────────────
if (!process.env.SESSION_SECRET) {
  console.error('\x1b[31m✖ SESSION_SECRET não definido no .env — servidor encerrado.\x1b[0m');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('\x1b[31m✖ DATABASE_URL não definido no .env — servidor encerrado.\x1b[0m');
  process.exit(1);
}

const app = express();

app.set('trust proxy', 1);

// ── Segurança: headers HTTP ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // desabilitado até auditoria completa do frontend
}));

// ── CORS ───────────────────────────────────────────────────────
const origemPermitida = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: origemPermitida,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate limiting ──────────────────────────────────────────────
// Auth: 20 req / 15 min (brute-force de login)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' }
}));

// Admin login: 10 req / 15 min
app.use('/api/admin/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login admin. Aguarde 15 minutos.' }
}));

// API geral: 120 req / min
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de requisições atingido. Tente novamente em instantes.' }
}));

// ── Body parsers e arquivos estáticos ─────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ── Sessão persistida no PostgreSQL ───────────────────────────
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// ── Rotas ──────────────────────────────────────────────────────
const clienteRoutes  = require('./routes/clienteRoutes');
const pneuRoutes     = require('./routes/pneuRoutes');
const authRoutes     = require('./routes/authRoutes');
const veiculoRoutes  = require('./routes/veiculoRoutes');
const cartaoRoutes   = require('./routes/cartaoRoutes');
const enderecoRoutes = require('./routes/enderecoRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes');
const pedidoRoutes   = require('./routes/pedidoRoutes');
const adminRoutes    = require('./routes/adminRoutes');
const chatbotRoutes  = require('./routes/chatbotRoutes');
const carrosRoutes   = require('./routes/carrosRoutes');

app.use('/api/auth',    authRoutes);
app.use('/api/pneus',   pneuRoutes);
app.use('/api/carros',  carrosRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.use('/api/clientes/:clienteId/veiculos',  veiculoRoutes);
app.use('/api/clientes/:clienteId/cartoes',   cartaoRoutes);
app.use('/api/clientes/:clienteId/enderecos', enderecoRoutes);
app.use('/api/clientes',  clienteRoutes);

app.use('/api/carrinho', carrinhoRoutes);
app.use('/api/pedidos',  pedidoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✔ Servidor rodando na porta ${PORT}\x1b[0m`);
  console.log(`\x1b[36mℹ Modo: ${process.env.NODE_ENV || 'development'}\x1b[0m`);
  console.log(`\x1b[36mℹ CORS permitido para: ${origemPermitida}\x1b[0m`);
});
