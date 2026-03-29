const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pg = require('pg');
const cors = require('cors'); 
const path = require('path');
require('dotenv').config();

const app = express();

// --- 1. CONFIGURAÇÃO DO BANCO DE DADOS (POOL) ---
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

// --- 2. CONFIGURAÇÃO DO CORS (PARA O FRONTEND) ---
app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true,               
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- 3. MIDDLEWARES BÁSICOS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// --- 4. CONFIGURAÇÃO DA SESSÃO PERSISTENTE ---
app.use(session({
  store: new pgSession({
    pool : pgPool,                
    tableName : 'session',        
    createTableIfMissing: false   
  }),
  secret: process.env.SESSION_SECRET || 'chave_mestra_para_projeto_faculdade_123', 
  resave: false,               
  saveUninitialized: false,     
  proxy: true,                  
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, 
    secure: false,                   
    httpOnly: true,                
    sameSite: 'lax'                
  }
}));

// --- 5. DEFINIÇÃO DAS ROTAS ---
const clienteRoutes = require('./routes/clienteRoutes');
const pneuRoutes = require('./routes/pneuRoutes');
const authRoutes = require('./routes/authRoutes');
const veiculoRoutes = require('./routes/veiculoRoutes');
const cartaoRoutes = require('./routes/cartaoRoutes');
const enderecoRoutes = require('./routes/enderecoRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');

// Rotas de Autenticação e Produtos
app.use('/api/auth', authRoutes);
app.use('/api/pneus', pneuRoutes);

// Rotas vinculadas a Clientes (Endereços, Cartões, Veículos)
app.use('/api/clientes', clienteRoutes);
app.use('/api/clientes/:clienteId/veiculos', veiculoRoutes);
app.use('/api/clientes/:clienteId/cartoes', cartaoRoutes);
app.use('/api/clientes/:clienteId/enderecos', enderecoRoutes);

// Rotas de Pedidos e Carrinho (Essas usam o ID da sessão automaticamente)
app.use('/api/carrinho', carrinhoRoutes);
app.use('/api/pedidos', pedidoRoutes);

// --- 6. INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\x1b[32m%s\x1b[0m`, `✔ Servidor rodando na porta ${PORT}`);
    console.log(`\x1b[36m%s\x1b[0m`, `ℹ Sessões persistentes ativadas via banco de dados Neon.`);
});