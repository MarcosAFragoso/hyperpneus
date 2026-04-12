# HyperPneus — Guia de Instalação e Testes (6ª e 7ª Entrega)

## 1. Executar a Migration no Neon DB

No **Neon Database Studio → SQL Editor**, execute o arquivo `migration_v2.sql`.

Depois gere o hash da senha admin e atualize:
```bash
node -e "const b=require('bcryptjs'); b.hash('admin123',10).then(console.log)"
```
```sql
UPDATE admins SET senha='<hash_gerado>' WHERE usuario='admin';
```

---

## 2. Arquivos novos/alterados no projeto

### Backend
| Arquivo | O que faz |
|---|---|
| `middleware/auth.js` | Sem mudança — já tinha `exigirAdmin` |
| `controllers/adminAuthController.js` | Login/logout admin |
| `controllers/adminPedidoController.js` | Listar, detalhar, confirmar pagamento, transições de status |
| `controllers/adminTrocaController.js` | Aceitar, negar, confirmar recebimento |
| `controllers/pedidoController.js` | Atualizado — novo endpoint `PATCH /:id/cancelar` |
| `routes/adminRoutes.js` | Todas as rotas `/api/admin/...` |
| `routes/pedidoRoutes.js` | Adicionado `PATCH /:id/cancelar` |
| `server.js` | Registrado `/api/admin` |

### Frontend (views/)
| Arquivo | O que mudou |
|---|---|
| `admin.html` | Reescrito — login, dashboard, pedidos, trocas, clientes |
| `minha-conta.html` | Botão "Cancelar" nos pedidos canceláveis + novos status |
| `checkout.html` | Modal "Novo Cartão" inline + botão adicionar cartão |
| `confirmacao.html` | Adicionado `id="animacaoProcessando"` para Cypress |
| `index.html` | Adicionado `data-cy="card-pneu"` |
| `detalhe.html` | Adicionado `data-cy="btn-adicionar"` |

---

## 3. Novas rotas da API

### Admin Auth
```
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/perfil
```

### Admin Pedidos
```
GET    /api/admin/pedidos?status=EM_PROCESSAMENTO
GET    /api/admin/pedidos/:id
PATCH  /api/admin/pedidos/:id/confirmar-pagamento
PATCH  /api/admin/pedidos/:id/status   body: { status: "EM_TRANSPORTE" }
```

### Admin Trocas
```
GET    /api/admin/trocas?status=PENDENTE
PATCH  /api/admin/trocas/:id/aceitar        body: { obs: "..." }
PATCH  /api/admin/trocas/:id/negar          body: { obs: "..." }
PATCH  /api/admin/trocas/:id/recebimento    body: { obs: "..." }
```

### Pedido (cliente)
```
PATCH  /api/pedidos/:id/cancelar   (novo — só para AGUARDANDO_PAGAMENTO e EM_PROCESSAMENTO)
```

### Transições de status permitidas
```
AGUARDANDO_PAGAMENTO → EM_PROCESSAMENTO → PAGAMENTO_CONFIRMADO → EM_TRANSPORTE → ENTREGUE
AGUARDANDO_PAGAMENTO → CANCELADO
EM_PROCESSAMENTO     → CANCELADO
```

---

## 4. Instalar e rodar Cypress

```bash
npm install --save-dev cypress
```

### Configurar variáveis de ambiente

No arquivo `cypress.config.json`, as variáveis já estão definidas:
- `clienteEmail`: e-mail do cliente de teste
- `clienteSenha`: senha do cliente de teste
- `adminUsuario`: `admin`
- `adminSenha`: `admin123`

> Crie o cliente de teste no banco antes de rodar:
> ```bash
> curl -X POST http://localhost:3000/api/clientes \
>   -H "Content-Type: application/json" \
>   -d '{"nome":"Cliente","sobrenome":"Teste","cpf":"529.982.247-25","email":"teste@hyperpneus.com","senha":"teste1234"}'
> ```
> Certifique-se de que o cliente tem ao menos 1 endereço e 1 cartão cadastrados.

### Rodar os testes

```bash
# Modo interativo (abre o browser — use para apresentação)
npx cypress open

# Modo headless (CI)
npx cypress run

# Só a 6ª entrega
npx cypress run --spec "cypress/e2e/06_registro_pedido_sucesso.cy.js"

# Só a 7ª entrega
npx cypress run --spec "cypress/e2e/07_fluxo_completo_venda.cy.js"
```

---

## 5. Cenários cobertos pelos testes (7ª Entrega)

| # | Cenário | Arquivo |
|---|---|---|
| 1 | Compra com 1 cartão | `07_fluxo_completo_venda.cy.js` |
| 2 | Compra com 2 cartões | idem |
| 3 | Compra com cupom promocional | idem |
| 4 | Compra com cupom de troca cobrindo 100% | idem |
| 5 | Novo cartão no ato da compra | idem |
| 6 | Novo endereço no ato da compra | idem |
| 7 | Cliente cancela pedido | idem |
| 8 | Admin confirma pagamento | idem |
| 9 | Admin coloca EM TRANSPORTE e confirma ENTREGUE | idem |
| 10 | Troca total — cliente solicita, admin aceita, cupom gerado | idem |
| 11 | Admin nega troca | idem |
| 12 | Troca parcial + admin confirma recebimento | idem |
| 13 | Sistema gera cupom TROCA-XXXXXX válido | idem |
