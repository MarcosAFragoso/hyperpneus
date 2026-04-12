// cypress/e2e/06_registro_pedido_sucesso.cy.js
// 6ª ENTREGA — Teste automatizado: Registro de pedido com sucesso

describe('UC03 — Registro de Pedido com Sucesso', () => {

  beforeEach(() => {
    // 1. Login via cy.session (mantém cookie entre testes)
    cy.loginCliente();

    // 2. Visita index para ativar cookie no browser
    cy.visit('/index.html');

    // 3. Salva dados do cliente no localStorage
    cy.request('/api/auth/perfil').then(res => {
      expect(res.status).to.eq(200);
      cy.window().then(win => {
        win.localStorage.setItem('cliente', JSON.stringify(res.body));
      });
    });

    // 4. Limpa carrinho
    cy.request({ method: 'GET', url: '/api/carrinho' }).then(res => {
      (res.body.itens || []).forEach(item => {
        cy.request({
          method: 'DELETE',
          url: `/api/carrinho/${item.id}`,
          failOnStatusCode: false
        });
      });
    });
  });

  it('Fluxo principal: adicionar pneu → checkout → pedido confirmado', () => {

    // 1. Clica no primeiro card de pneu
    cy.get('[data-cy="card-pneu"]', { timeout: 8000 }).first().click();

    // 2. Página de detalhe — adiciona ao carrinho
    cy.url().should('include', 'detalhe.html');
    cy.get('[data-cy="btn-adicionar"]', { timeout: 8000 })
      .should('not.be.disabled')
      .click();

    // 3. Aguarda confirmação visual
    cy.contains('Adicionado', { timeout: 6000 }).should('be.visible');

    // 4. Navega para checkout mantendo localStorage
    cy.visit('/checkout.html', {
      onBeforeLoad(win) {
        cy.request('/api/auth/perfil').then(res => {
          win.localStorage.setItem('cliente', JSON.stringify(res.body));
        });
      }
    });

    // 5. Aguarda endereços carregarem
    cy.get('#listaEnderecos .card-sel', { timeout: 12000 })
      .should('have.length.greaterThan', 0)
      .first().click();

    // 6. PAC já selecionado por padrão
    cy.get('#btnPAC').should('have.class', 'selecionado');

    // 7. Aguarda cartões carregarem
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 })
      .should('have.length.greaterThan', 0)
      .first().click();

    // 8. Finaliza o pedido
    cy.get('[data-cy="btn-finalizar"]').click();

    // 9. Confirma redirecionamento
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
    cy.url().should('include', 'pedido=');

    // 10. Confirma via API
    cy.request('/api/pedidos').then(res => {
      expect(res.status).to.eq(200);
      expect(res.body.length).to.be.greaterThan(0);
      expect(res.body[0].status).to.eq('EM_PROCESSAMENTO');
    });
  });

});