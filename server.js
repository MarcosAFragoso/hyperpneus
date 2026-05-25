const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pg = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'chave_mestra_123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// ── Rotas ──────────────────────────────────────────────────
const clienteRoutes = require('./routes/clienteRoutes');
const pneuRoutes = require('./routes/pneuRoutes');
const authRoutes = require('./routes/authRoutes');
const veiculoRoutes = require('./routes/veiculoRoutes');
const cartaoRoutes = require('./routes/cartaoRoutes');
const enderecoRoutes = require('./routes/enderecoRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/pneus', pneuRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.use('/api/clientes/:clienteId/veiculos', veiculoRoutes);
app.use('/api/clientes/:clienteId/cartoes', cartaoRoutes);
app.use('/api/clientes/:clienteId/enderecos', enderecoRoutes);
app.use('/api/clientes', clienteRoutes);

app.use('/api/carrinho', carrinhoRoutes);
app.use('/api/pedidos', pedidoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✔ Servidor rodando na porta ${PORT}\x1b[0m`);
  console.log(`\x1b[36mℹ Modo: ${process.env.NODE_ENV || 'development'}\x1b[0m`);
});
