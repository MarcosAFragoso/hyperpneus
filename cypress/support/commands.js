// cypress/support/commands.js

function salvarCookie(res) {
  const cookie = res.headers['set-cookie'];
  if (cookie) {
    const match = cookie.toString().match(/connect\.sid=([^;]+)/);
    if (match) {
      cy.setCookie('connect.sid', decodeURIComponent(match[1]), {
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false
      });
    }
  }
}

Cypress.Commands.add('loginCliente', (email, senha) => {
  const e = email || Cypress.env('clienteEmail');
  const s = senha  || Cypress.env('clienteSenha');
  cy.request({
    method: 'POST', url: '/api/auth/login',
    body: { email: e, senha: s },
    failOnStatusCode: true, withCredentials: true
  }).then(res => { salvarCookie(res); });
});

Cypress.Commands.add('loginAdmin', (usuario, senha) => {
  const u = usuario || Cypress.env('adminUsuario');
  const s = senha   || Cypress.env('adminSenha');
  cy.request({
    method: 'POST', url: '/api/admin/login',
    body: { usuario: u, senha: s },
    failOnStatusCode: true, withCredentials: true
  }).then(res => { salvarCookie(res); });
});

Cypress.Commands.add('limparCarrinho', () => {
  cy.request({ method: 'GET', url: '/api/carrinho', failOnStatusCode: false, withCredentials: true })
    .then(res => {
      (res.body?.itens || []).forEach(item => {
        cy.request({ method: 'DELETE', url: `/api/carrinho/${item.id}`, failOnStatusCode: false, withCredentials: true });
      });
    });
});

Cypress.Commands.add('adicionarAoCarrinho', (pneuId = 1, quantidade = 1) => {
  cy.request({
    method: 'POST', url: '/api/carrinho',
    body: { pneu_id: pneuId, quantidade },
    failOnStatusCode: false, withCredentials: true
  }).then(res => {
    if (res.status !== 201) cy.log('Aviso carrinho:', res.body?.erro);
  });
});

Cypress.Commands.add('ultimoPedido', () => {
  return cy.request({ url: '/api/pedidos', failOnStatusCode: false, withCredentials: true })
    .then(res => {
      expect(res.body.length).to.be.greaterThan(0);
      return res.body[0];
    });
});

Cypress.Commands.add('resetEstoque', () => {
  cy.loginAdmin();
  cy.request({ method: 'POST', url: '/api/admin/estoque/reset', withCredentials: true, failOnStatusCode: false });
  cy.loginCliente();
});

// FIX: não usa getCookie (mistura sync/async) — apenas faz login admin, cria cupom e restaura cliente
Cypress.Commands.add('criarCupomPromo', (valor = 10) => {
  cy.loginAdmin();
  cy.request({
    method: 'POST', url: '/api/admin/cupons/teste',
    body: { valor }, withCredentials: true, failOnStatusCode: true
  }).then(res => {
    // Salva o código numa variável acessível
    Cypress.env('_cupomTemp', res.body.codigo);
  });
  cy.loginCliente();
  // Retorna o código salvo
  return cy.wrap(null).then(() => Cypress.env('_cupomTemp'));
});
