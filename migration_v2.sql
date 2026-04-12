-- ============================================================
-- HyperPneus — Migration v2
-- Executar UMA VEZ no Neon DB (Database Studio → SQL Editor)
-- ============================================================

-- 1. Novos status de pedido
-- Já existia: ENTREGUE, EM_PROCESSAMENTO, AGUARDANDO_PAGAMENTO
-- Adicionando os que faltam para o fluxo admin completo
ALTER TABLE pedidos
  ALTER COLUMN status TYPE varchar(30);

-- 2. Coluna atualizado_em em pedidos (para rastrear mudanças de status)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS atualizado_em timestamp DEFAULT now();

-- 3. Tabela trocas: status já existe (varchar 20) com APROVADO
-- Precisamos ampliar e garantir os valores necessários
ALTER TABLE trocas
  ALTER COLUMN status TYPE varchar(30);

-- Atualizar registros existentes sem status
UPDATE trocas SET status = 'PENDENTE' WHERE status IS NULL;

-- 4. Coluna admin_obs em trocas (justificativa de aceite/negação)
ALTER TABLE trocas
  ADD COLUMN IF NOT EXISTS admin_obs text;

-- 5. Coluna atualizado_em em trocas
ALTER TABLE trocas
  ADD COLUMN IF NOT EXISTS atualizado_em timestamp DEFAULT now();

-- 6. Tabela admins (login simples para o painel)
CREATE TABLE IF NOT EXISTS admins (
  id      serial PRIMARY KEY,
  usuario varchar(50) UNIQUE NOT NULL,
  senha   varchar(255) NOT NULL  -- bcrypt hash
);

-- Admin padrão: usuario=admin senha=admin123
-- Hash gerado com bcrypt rounds=10
INSERT INTO admins (usuario, senha)
VALUES ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (usuario) DO NOTHING;

-- Nota: a senha acima é 'password' (hash de exemplo do bcrypt)
-- Troque por um hash real rodando:
--   node -e "const b=require('bcryptjs');b.hash('admin123',10).then(console.log)"
-- e atualize com: UPDATE admins SET senha='<novo_hash>' WHERE usuario='admin';
