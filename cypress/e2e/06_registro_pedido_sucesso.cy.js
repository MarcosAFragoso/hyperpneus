describe('UC03 — Registro de Pedido com Sucesso', () => {

  beforeEach(() => {
    cy.loginCliente();

    // Visita uma página para o cookie de sessão ser enviado ao servidor
    cy.visit('/index.html');

    // Confirma sessão ativa e seta localStorage
    cy.request('/api/auth/perfil').then(res => {
      expect(res.status).to.eq(200);
      cy.window().then(win => {
        win.localStorage.setItem('cliente', JSON.stringify(res.body));
      });
    });

    // Limpa carrinho
    cy.limparCarrinho();

    // Adiciona item — agora com sessão garantida
    cy.adicionarAoCarrinho(1, 1);

    // Pequena espera para o banco processar
    cy.wait(500);

    // Confirma que o item está no carrinho
    cy.request('/api/carrinho').then(res => {
      expect(res.body.itens.length).to.be.greaterThan(0);
    });
  });

  it('Fluxo principal: adicionar pneu → checkout → pedido confirmado', () => {

    // Vai direto para o checkout (já tem item no carrinho)
    cy.visit('/checkout.html');

    // Espera a página carregar completamente
    cy.get('#listaEnderecos', { timeout: 8000 }).should('be.visible');

    // Verifica endereço carregado
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 })
      .should('have.length.greaterThan', 0)
      .first()
      .click();

    // Seleciona PAC
    cy.get('#btnPAC').click();

    // Verifica cartão
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 })
      .should('have.length.greaterThan', 0)
      .first()
      .click();

    // Finaliza
    cy.get('[data-cy="btn-finalizar"]').click();

    // Confirma redirecionamento
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
    cy.url().should('include', 'pedido=');

    // Confirma via API
    cy.ultimoPedido().then(pedido => {
      expect(pedido.status).to.eq('EM_PROCESSAMENTO');
      expect(parseFloat(pedido.total)).to.be.greaterThan(0);
    });
  });

});