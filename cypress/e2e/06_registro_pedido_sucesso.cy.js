// cypress/e2e/06_registro_pedido_sucesso.cy.js
// 6ª ENTREGA — Teste automatizado: Registro de pedido com sucesso

describe('UC03 — Registro de Pedido com Sucesso', () => {

  beforeEach(() => {
    cy.loginCliente();
    cy.visit('/index.html');
    cy.limparCarrinho();
  });

  it('Fluxo principal: adicionar pneu → checkout → pedido confirmado', () => {

    cy.request('/api/auth/perfil').then(perfil => {
      const clienteData = perfil.body;

      // 1. Abre o checkout — estabelece contexto e cookie no browser
      cy.visit('/checkout.html', {
        onBeforeLoad(win) {
          win.localStorage.setItem('cliente', JSON.stringify(clienteData));
        }
      });
    });

    // 2. Espera a página carregar completamente (perfil e endereços já foram buscados)
    cy.get('#listaEnderecos', { timeout: 15000 }).should('exist');

    // 3. Adiciona o item via fetch do browser (mesmo cookie, sem reload)
    cy.window().then(win => {
      return win.fetch('/api/carrinho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pneu_id: 1, quantidade: 1 })
      })
      .then(r => r.json())
      .then(data => {
        // 4. Dispara carregarCarrinho() direto na função da página
        return win.carregarCarrinho();
      });
    });

    // 5. Aguarda subtotal atualizar
    cy.get('#resumoSubtotal', { timeout: 20000 })
      .invoke('text')
      .should('not.eq', 'R$ 0,00')
      .and('not.eq', '');

    // 6. Seleciona endereço
    cy.get('#listaEnderecos .card-sel', { timeout: 12000 })
      .should('have.length.greaterThan', 0)
      .first().click();

    // 7. PAC já vem selecionado
    cy.get('#btnPAC').should('have.class', 'selecionado');

    // 8. Seleciona cartão
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 })
      .should('have.length.greaterThan', 0)
      .first().click();

    // 9. Finaliza
    cy.get('[data-cy="btn-finalizar"]')
      .should('not.be.disabled')
      .click();

    // 10. Confirma redirecionamento
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');

    // 11. Verifica status do pedido
    cy.request('/api/pedidos').then(res => {
      expect(res.body[0].status).to.eq('EM_PROCESSAMENTO');
    });
  });
});
