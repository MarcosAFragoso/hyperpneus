// cypress/support/commands.js
// Comandos reutilizáveis para todos os testes HyperPneus

// ── Login como cliente via API (não passa pela tela, mais rápido) ──
Cypress.Commands.add('loginCliente', (email, senha) => {
  const e = email || Cypress.env('clienteEmail');
  const s = senha || Cypress.env('clienteSenha');

  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: e, senha: s }
  }).then(res => {
    expect(res.status).to.eq(200);
    window.localStorage.setItem('cliente', JSON.stringify(res.body.cliente));
  });
});

// ── Login como admin via API ──────────────────────────────────────
Cypress.Commands.add('loginAdmin', (usuario, senha) => {
  const u = usuario || Cypress.env('adminUsuario');
  const s = senha   || Cypress.env('adminSenha');

  cy.request({
    method: 'POST',
    url: '/api/admin/login',
    body: { usuario: u, senha: s }
  }).then(res => {
    expect(res.status).to.eq(200);
  });
});

// ── Logout cliente ────────────────────────────────────────────────
Cypress.Commands.add('logoutCliente', () => {
  cy.request({ method: 'POST', url: '/api/auth/logout', failOnStatusCode: false });
  cy.clearLocalStorage();
});

// ── Adicionar pneu ao carrinho via API ────────────────────────────
Cypress.Commands.add('adicionarAoCarrinho', (pneuId = 1, quantidade = 1) => {
  cy.request({
    method: 'POST',
    url: '/api/carrinho',
    body: { pneu_id: pneuId, quantidade }
  });
});

// ── Limpar carrinho via API ───────────────────────────────────────
Cypress.Commands.add('limparCarrinho', () => {
  cy.request({ method: 'GET', url: '/api/carrinho' }).then(res => {
    const itens = res.body.itens || [];
    itens.forEach(item => {
      cy.request({ method: 'DELETE', url: `/api/carrinho/${item.id}`, failOnStatusCode: false });
    });
  });
});

// ── Buscar pedido mais recente do cliente ─────────────────────────
Cypress.Commands.add('ultimoPedido', () => {
  return cy.request('/api/pedidos').then(res => {
    const pedidos = res.body;
    expect(pedidos.length).to.be.greaterThan(0);
    return pedidos[0]; // Ordenado por criado_em DESC
  });
});
