// cypress/support/commands.js

Cypress.Commands.add('loginCliente', (email, senha) => {
  const e = email || Cypress.env('clienteEmail');
  const s = senha || Cypress.env('clienteSenha');

  cy.session([e, s], () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: e, senha: s },
      failOnStatusCode: false
    }).then(res => {
      if (res.status !== 200) {
        throw new Error(`Login falhou: ${JSON.stringify(res.body)}`);
      }
      window.localStorage.setItem('cliente', JSON.stringify(res.body.cliente));
    });
  }, {
    cacheAcrossSpecs: true
  });
});

Cypress.Commands.add('loginAdmin', (usuario, senha) => {
  const u = usuario || Cypress.env('adminUsuario');
  const s = senha || Cypress.env('adminSenha');

  cy.session(['admin', u, s], () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/login',
      body: { usuario: u, senha: s },
      failOnStatusCode: false
    }).then(res => {
      if (res.status !== 200) {
        throw new Error(`Login admin falhou: ${JSON.stringify(res.body)}`);
      }
    });
  }, {
    cacheAcrossSpecs: true
  });
});

Cypress.Commands.add('logoutCliente', () => {
  cy.request({ method: 'POST', url: '/api/auth/logout', failOnStatusCode: false });
  cy.clearLocalStorage();
});

Cypress.Commands.add('adicionarAoCarrinho', (pneuId = 1, quantidade = 1) => {
  cy.request({
    method: 'POST',
    url: '/api/carrinho',
    body: { pneu_id: pneuId, quantidade },
    failOnStatusCode: false
  });
});

Cypress.Commands.add('limparCarrinho', () => {
  cy.request({
    method: 'GET',
    url: '/api/carrinho',
    failOnStatusCode: false
  }).then(res => {
    const itens = res.body?.itens || [];
    itens.forEach(item => {
      cy.request({
        method: 'DELETE',
        url: `/api/carrinho/${item.id}`,
        failOnStatusCode: false
      });
    });
  });
});

Cypress.Commands.add('ultimoPedido', () => {
  return cy.request({
    url: '/api/pedidos',
    failOnStatusCode: false
  }).then(res => {
    const pedidos = res.body;
    expect(Array.isArray(pedidos)).to.eq(true);
    expect(pedidos.length).to.be.greaterThan(0);
    return pedidos[0];
  });
});