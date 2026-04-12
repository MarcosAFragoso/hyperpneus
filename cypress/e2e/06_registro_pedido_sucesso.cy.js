// cypress/e2e/06_registro_pedido_sucesso.cy.js
// 6ª ENTREGA — Teste automatizado: Registro de pedido com sucesso

describe('UC03 — Registro de Pedido com Sucesso', () => {

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
  });

  it('Fluxo principal: adicionar pneu → checkout → pedido confirmado', () => {

    // 1. Acessa catálogo e vai ao detalhe do primeiro pneu
    cy.visit('/');
    cy.get('[data-cy="card-pneu"]').first().click();

    // 2. Na página de detalhe, adiciona ao carrinho
    cy.url().should('include', 'detalhe.html');
    cy.get('[data-cy="btn-adicionar"]', { timeout: 6000 })
      .should('not.be.disabled')
      .click();
    cy.contains('Adicionado ao Carrinho').should('be.visible');

    // 3. Vai para o carrinho
    cy.visit('/carrinho.html');
    cy.get('#carrinhoConteudo').should('be.visible');
    cy.get('#tabelaItens tr').should('have.length.greaterThan', 0);

    // 4. Avança para checkout
    cy.contains('FECHAR PEDIDO').click();
    cy.url().should('include', 'checkout.html');

    // 5. Verifica que endereço está selecionado
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 })
      .first()
      .should('be.visible');

    // 6. PAC já vem selecionado por padrão
    cy.get('#btnPAC').should('have.class', 'selecionado');

    // 7. Verifica cartão disponível
    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 })
      .first()
      .should('be.visible');

    // 8. Finaliza o pedido
    cy.get('[data-cy="btn-finalizar"]').click();

    // 9. Deve redirecionar para confirmação
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
    cy.url().should('include', 'pedido=');

    // 10. Verifica animação de processamento
    cy.get('#animacaoProcessando', { timeout: 8000 }).should('be.visible');

    // 11. Confirma via API que o pedido foi criado
    cy.ultimoPedido().then(pedido => {
      expect(pedido.status).to.eq('EM_PROCESSAMENTO');
      expect(parseFloat(pedido.total)).to.be.greaterThan(0);
    });
  });

});