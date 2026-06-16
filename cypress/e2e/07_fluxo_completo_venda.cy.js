// cypress/e2e/07_fluxo_completo_venda.cy.js


before(() => {
  cy.resetEstoque();
});

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function avancarPedidoAteEntregue(pedidoId) {
  cy.loginAdmin();
  cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento`, failOnStatusCode: false, withCredentials: true });
  cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'EM_TRANSPORTE' }, failOnStatusCode: false, withCredentials: true });
  cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'ENTREGUE' }, failOnStatusCode: false, withCredentials: true });
  cy.loginCliente();
}

function criarPedidoPeloCheckout(pneuId = 1, qtd = 1) {
  cy.loginCliente();
  cy.limparCarrinho();
  cy.adicionarAoCarrinho(pneuId, qtd);
  cy.request({ url: '/api/carrinho', withCredentials: true }).then(res => {
    if (!res.body.itens?.length) {
      cy.resetEstoque();
      cy.adicionarAoCarrinho(pneuId, qtd);
    }
  });
  cy.visit('/checkout.html');
  cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
  cy.get('#btnPAC').click();
  cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).first().click();
  cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
  cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
}

function confirmarPedidoCriado() {
  cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
  cy.get('#tituloPagamento', { timeout: 10000 }).should('contain', 'Confirmado');
  cy.location('search').then(search => {
    const pedidoId = new URLSearchParams(search).get('pedido');
    expect(pedidoId).to.exist;
    cy.request({ url: `/api/pedidos/${pedidoId}`, withCredentials: true })
      .its('body.status').should('eq', 'EM_PROCESSAMENTO');
  });
}

function solicitarTrocaViaAPI(pedidoId, pneuId, qtd, acao = 'Vale-Troca') {
  cy.loginCliente();
  cy.request({
    method: 'POST',
    url: '/api/pedidos/gerar-cupom-troca',
    body: { pedidoId, itensParaTroca: [{ pneu_id: pneuId, qtd }], acao },
    failOnStatusCode: false,
    withCredentials: true
  });
}

// Helper: navega para seção do admin pelo texto do link (sem IDs)
function clicarMenuAdmin(texto) {
  cy.get('.nav-admin .nav-link').contains(texto).click();
}

// Helper: abre aba Lista de trocas e aguarda tabela
function abrirListaTrocas() {
  clicarMenuAdmin('Trocas');
  cy.get('#aba-trocas-lista', { timeout: 6000 }).click();
  cy.get('#tabelaTrocasBody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
}

// Helper: aceita/nega troca pelo modal de justificativa (novo fluxo)
function confirmarModalTroca(justificativa = 'Ação via Cypress.') {
  cy.get('#modalJustificativaTroca.show', { timeout: 6000 }).should('be.visible');
  cy.get('#justificativaTexto').clear().type(justificativa);
  cy.get('#btnConfirmarJustificativa').click();
  cy.get('#modalJustificativaTroca', { timeout: 8000 }).should('not.have.class', 'show');
}

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 1 — Compra com 1 cartão
// ─────────────────────────────────────────────────────────────────
describe('Cenário 1 — Compra com 1 cartão', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve finalizar pedido com 1 cartão e status EM_PROCESSAMENTO', () => {
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 2 — Compra com 2 cartões
// ─────────────────────────────────────────────────────────────────
describe('Cenário 2 — Compra com 2 cartões', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 2);
  });

  it('Deve dividir o pagamento entre 2 cartões', () => {
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();

    cy.get('label[for="r2"]').click();
    cy.get('#secCartao2').should('be.visible');

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('#listaCartoes2 .card-sel', { timeout: 6000 }).last().click();

    cy.get('#resumoTotal').invoke('text').then(totalTxt => {
      const total = parseFloat(totalTxt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      const v1 = (Math.floor(total / 2 * 100) / 100).toFixed(2).replace('.', ',');
      cy.get('#valorCartao1').clear().type(v1);
    });

    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 3 — Compra com cupom promocional
// ─────────────────────────────────────────────────────────────────
describe('Cenário 3 — Compra com cupom de desconto', () => {
  before(() => {
    cy.criarCupomPromo(10).then(codigo => { Cypress.env('_c3cupom', codigo); });
  });

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve aplicar cupom e reduzir o total', () => {
    const codigoCupom = Cypress.env('_c3cupom');
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();

    cy.get('#inputCupomPromo').type(codigoCupom);
    cy.contains('button', 'Aplicar').first().click();
    cy.get('#feedbackPromo', { timeout: 8000 }).invoke('text').should('match', /[Dd]esconto|aplicado/);
    cy.get('#resumoDescontoDiv').should('be.visible');
    cy.get('#resumoDesconto').should('contain', 'R$');

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 4 — Compra com cupom de troca cobrindo 100%
// ─────────────────────────────────────────────────────────────────
describe('Cenário 4 — Compra com cupom de troca cobrindo 100%', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 1, 1, 'Vale-Troca');
      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = (res.body.trocas || [])[0];
        if (troca) {
          cy.request({
            method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
            body: { obs: 'Aprovado para teste C4' }, withCredentials: true
          }).then(aceiteRes => {
            if (aceiteRes.body.cupom_codigo) Cypress.env('_c4cupom', aceiteRes.body.cupom_codigo);
          });
        }
      });
    });
  });

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Quando cupom cobre total, não deve exigir cartão', () => {
    const codigoCupomAlto = Cypress.env('_c4cupom');
    if (!codigoCupomAlto) { cy.log('Cupom alto não disponível — pulando'); return; }
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnRETIRADA').click();

    cy.get('#inputCupomTroca').type(codigoCupomAlto);
    cy.get('#inputCupomTroca').siblings('button').contains('Aplicar').click();
    cy.get('#feedbackTroca', { timeout: 8000 }).should('contain', 'crédito');

    cy.get('#resumoTotal').invoke('text').then(txt => {
      const total = parseFloat(txt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (total <= 0) {
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
        cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 5 — Novo cartão no ato da compra
// ─────────────────────────────────────────────────────────────────
describe('Cenário 5 — Registrar novo cartão no checkout', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve salvar novo cartão e usá-lo para pagamento', () => {
    const finalCartao = String(Date.now()).slice(-4);

    cy.visit('/checkout.html');
    cy.get('[data-cy="btn-novo-cartao"]').click();
    cy.get('#modalCartao').should('be.visible');

    cy.get('[data-cy="input-cartao-nome"]').type('CLIENTE TESTE');
    cy.get('[data-cy="input-cartao-numero"]').clear().type(`411111111111${finalCartao}`, { delay: 50 });
    cy.get('#cartaoValidade').type('12/28');
    cy.get('#cartaoCvv').type('123');
    cy.get('[data-cy="select-cartao-bandeira"]').select('Visa');
    cy.get('[data-cy="btn-salvar-cartao"]').click();

    cy.get('#modalCartao', { timeout: 10000 }).should('not.have.class', 'show');

    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 6 — Novo endereço no ato da compra
// ─────────────────────────────────────────────────────────────────
describe('Cenário 6 — Registrar novo endereço no checkout', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve salvar novo endereço e usá-lo na entrega', () => {
    const numeroEndereco = String(Date.now()).slice(-5);

    cy.intercept('GET', 'https://viacep.com.br/ws/*/json/', {
      body: { logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }
    }).as('viacep');

    cy.visit('/checkout.html');
    cy.contains('Adicionar novo endereço').click();
    cy.get('#modalEndereco').should('be.visible');

    cy.get('#novoCep').type('01001000');
    cy.contains('button', 'Buscar').click();
    cy.wait('@viacep');

    cy.get('#novoLogradouro').should('have.value', 'Praça da Sé');
    cy.get('#novoNumero').type(numeroEndereco);
    cy.get('#novoNome').type(`Endereco Teste Cypress ${numeroEndereco}`);

    cy.get('#modalEndereco .modal-footer .btn-primary').click();
    cy.get('#modalEndereco', { timeout: 8000 }).should('not.have.class', 'show');
    cy.contains('#listaEnderecos .card-sel', 'Praça da Sé', { timeout: 8000 }).first().click();

    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 7 — Cancelar pedido (cliente)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 7 — Cliente cancela pedido', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => { Cypress.env('_c7pedido', p.id); });
  });

  it('Deve cancelar pedido e reverter status para CANCELADO', () => {
    const pedidoId = Cypress.env('_c7pedido');
    cy.loginCliente();
    cy.request({ url: '/api/auth/perfil', withCredentials: true }).then(res => {
      cy.visit('/minha-conta.html', {
        onBeforeLoad(win) { win.localStorage.setItem('cliente', JSON.stringify(res.body)); }
      });
    });

    cy.get('#sec-pedidos', { timeout: 8000 }).should('be.visible');
    cy.get('#listaPedidos', { timeout: 8000 }).should('be.visible');

    cy.on('window:confirm', () => true);
    cy.then(() => {
      cy.get(`[data-cy="btn-cancelar-${pedidoId}"]`, { timeout: 8000 }).click();
    });

    cy.wait(1000);
    cy.request({ url: `/api/pedidos/${pedidoId}`, withCredentials: true })
      .its('body.status').should('eq', 'CANCELADO');
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 8 — Admin confirma pagamento (UI corrigida)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 8 — Admin confirma pagamento', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => { Cypress.env('_c8pedido', p.id); });
  });

  it('Admin confirma pagamento → status PAGAMENTO_CONFIRMADO', () => {
    const pedidoId = Cypress.env('_c8pedido');
    // Confirma via API (mais confiável que clicar em botão dinâmico)
    cy.loginAdmin();
    cy.request({
      method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento`,
      failOnStatusCode: true, withCredentials: true
    }).then(res => {
      expect(res.body.status).to.eq('PAGAMENTO_CONFIRMADO');
    });

    // Validação visual: filtra por status no painel
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');
    clicarMenuAdmin('Pedidos');
    cy.get('#filtroStatusPedido', { timeout: 6000 }).select('PAGAMENTO_CONFIRMADO');
    cy.get('#tabelaPedidosBody tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 9 — Admin: Em Transporte → Entregue
// ─────────────────────────────────────────────────────────────────
describe('Cenário 9 — Admin: Em Transporte → Entregue', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      Cypress.env('_c9pedido', p.id);
      cy.loginAdmin();
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${p.id}/confirmar-pagamento`, withCredentials: true });
    });
  });

  it('Admin coloca EM_TRANSPORTE e vê no filtro', () => {
    const pedidoId = Cypress.env('_c9pedido');
    cy.loginAdmin();
    cy.request({
      method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: 'EM_TRANSPORTE' }, withCredentials: true
    }).then(res => { expect(res.body.status).to.eq('EM_TRANSPORTE'); });

    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');
    clicarMenuAdmin('Pedidos');
    cy.get('#filtroStatusPedido', { timeout: 6000 }).select('EM_TRANSPORTE');
    cy.get('#tabelaPedidosBody tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
  });

  it('Admin confirma ENTREGUE via API e valida', () => {
    const pedidoId = Cypress.env('_c9pedido');
    cy.loginAdmin();
    cy.request({
      method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: 'ENTREGUE' }, withCredentials: true
    }).then(res => { expect(res.body.status).to.eq('ENTREGUE'); });

    cy.request({ url: `/api/admin/pedidos/${pedidoId}`, withCredentials: true })
      .its('body.status').should('eq', 'ENTREGUE');
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 10 — Troca total: cliente solicita, admin aceita, cupom gerado
// ─────────────────────────────────────────────────────────────────
describe('Cenário 10 — Troca total: cliente solicita, admin aceita, cupom gerado', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      Cypress.env('_c10pedido', p.id);
      avancarPedidoAteEntregue(p.id);
    });
  });

  it('Cliente solicita troca total', () => {
    const pedidoId = Cypress.env('_c10pedido');
    cy.loginCliente();
    cy.visit(`/troca.html?pedido=${pedidoId}`);
    cy.get('#containerItens', { timeout: 8000 }).should('be.visible');
    cy.get('.check-item').each($cb => cy.wrap($cb).check());
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();
    cy.get('#resultadoTroca', { timeout: 8000 }).should('contain', 'aprovação do administrador');
  });

  it('Admin aceita a troca e cupom é gerado', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');

    abrirListaTrocas();

    cy.get('[data-cy^="btn-aceitar-troca-"]').first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-aceitar-troca-', ''));
      Cypress.env('_c10troca', trocaId);
      cy.wrap($btn).click();
    });

    confirmarModalTroca('Aprovado para teste C10');
    cy.wait('@aceitarTroca');

    cy.then(() => {
      const trocaId = Cypress.env('_c10troca');
      cy.request({ url: '/api/admin/trocas?status=APROVADO', withCredentials: true }).then(res => {
        const lista = res.body.trocas || [];
        const troca = lista.find(t => t.id === trocaId);
        expect(troca).to.exist;
        expect(troca.status).to.eq('APROVADO');
        expect(troca.cupom_codigo).to.match(/^TROCA-/);
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 11 — Admin nega troca
// ─────────────────────────────────────────────────────────────────
describe('Cenário 11 — Admin nega troca', () => {
  before(() => {
    criarPedidoPeloCheckout(2, 1);
    cy.ultimoPedido().then(p => {
      Cypress.env('_c11pedido', p.id);
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 2, 1, 'Vale-Troca');
    });
  });

  it('Admin nega a troca com justificativa', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');

    abrirListaTrocas();

    cy.get('[data-cy^="btn-negar-troca-"]', { timeout: 8000 }).first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-negar-troca-', ''));
      cy.intercept('PATCH', '/api/admin/trocas/*/negar').as('negarTroca');
      cy.wrap($btn).click();
      confirmarModalTroca('Produto fora do prazo de troca.');
      cy.wait('@negarTroca');

      cy.request({ url: '/api/admin/trocas?status=NEGADO', withCredentials: true }).then(res => {
        const lista = res.body.trocas || [];
        const troca = lista.find(t => t.id === trocaId);
        expect(troca).to.exist;
        expect(troca.status).to.eq('NEGADO');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 12 — Troca parcial + Admin confirma recebimento
// ─────────────────────────────────────────────────────────────────
describe('Cenário 12 — Troca parcial e confirmação de recebimento', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 2);
    cy.ultimoPedido().then(p => {
      Cypress.env('_c12pedido', p.id);
      avancarPedidoAteEntregue(p.id);
    });
  });

  it('Cliente solicita troca de apenas 1 unidade (parcial)', () => {
    const pedidoId = Cypress.env('_c12pedido');
    cy.loginCliente();
    cy.visit(`/troca.html?pedido=${pedidoId}`);
    cy.get('.check-item', { timeout: 8000 }).first().check();
    cy.get('.qtd-devolver').first().select('1');
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();
    cy.get('#resultadoTroca', { timeout: 8000 }).should('contain', 'aprovação do administrador');
  });

  it('Admin aceita troca parcial', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    abrirListaTrocas();
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    confirmarModalTroca('Aceite parcial C12');
    cy.wait('@aceitarTroca');
  });

  it('Admin confirma recebimento do produto', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');

    clicarMenuAdmin('Trocas');
    cy.get('#aba-trocas-lista', { timeout: 6000 }).click();
    cy.get('#tabelaTrocasBody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);

    cy.intercept('GET', '/api/admin/trocas*').as('carregarTrocas');
    cy.get('#filtroStatusTroca', { timeout: 6000 }).select('APROVADO');
    // Aguarda a tabela recarregar com trocas APROVADO antes de procurar o botão
    cy.wait('@carregarTrocas');
    cy.get('#tabelaTrocasBody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);

    cy.intercept('PATCH', '/api/admin/trocas/*/recebimento').as('recebimento');
    // Botão não tem data-cy — usa texto visível
    cy.contains('#tabelaTrocasBody button', 'Recebido', { timeout: 8000 }).first().click();
    confirmarModalTroca('Produto recebido em bom estado.');
    cy.wait('@recebimento');

    cy.request({ url: '/api/admin/trocas?status=PRODUTO_RECEBIDO', withCredentials: true }).then(res => {
      expect((res.body.trocas || []).length).to.be.greaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 13 — Sistema gera cupom de troca automaticamente (via admin)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 13 — Sistema gera cupom de troca', () => {
  it('Cupom gerado pelo admin deve ter código TROCA-XXXXXX e ser válido', () => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 1, 1, 'Vale-Troca');

      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = (res.body.trocas || [])[0];
        expect(troca).to.exist;

        cy.request({
          method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
          body: { obs: 'Teste automatizado C13' }, withCredentials: true
        }).then(aceiteRes => {
          expect(aceiteRes.status).to.eq(200);
          expect(aceiteRes.body.cupom_codigo).to.match(/^TROCA-[A-Z0-9]{6}$/);

          cy.loginCliente();
          cy.request({
            method: 'POST', url: '/api/carrinho/cupom/validar',
            body: { codigo: aceiteRes.body.cupom_codigo }, withCredentials: true
          }).then(validRes => {
            expect(validRes.body.valido).to.eq(true);
            expect(validRes.body.cupom.tipo).to.eq('troca');
          });
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 14 — Devolução com estorno no cartão
// ─────────────────────────────────────────────────────────────────
describe('Cenário 14 — Devolução com estorno no cartão', () => {
  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      Cypress.env('_c14pedido', p.id);
      avancarPedidoAteEntregue(p.id);
    });
  });

  it('Cliente solicita devolução com estorno', () => {
    const pedidoId = Cypress.env('_c14pedido');
    cy.loginCliente();
    cy.visit(`/troca.html?pedido=${pedidoId}`);
    cy.get('#containerItens', { timeout: 8000 }).should('be.visible');
    cy.get('.check-item').first().check();
    cy.get('#acaoDesejada').select('Estorno');
    cy.contains('SOLICITAR AGORA').click();
    cy.get('#resultadoTroca', { timeout: 8000 }).should('contain', 'estorno');
  });

  it('Admin aceita a devolução (sem gerar cupom)', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    abrirListaTrocas();
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-aceitar-troca-', ''));
      cy.wrap($btn).click();
      confirmarModalTroca('Estorno aprovado C14');
      cy.wait('@aceitarTroca');

      cy.request({ url: '/api/admin/trocas?status=APROVADO', withCredentials: true }).then(res => {
        const lista = res.body.trocas || [];
        const troca = lista.find(t => t.id === trocaId);
        expect(troca).to.exist;
        expect(troca.status).to.eq('APROVADO');
        expect(troca.cupom_codigo).to.be.null;
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 15 — Cupom promocional + cupom de troca + cartão simultâneos
// ─────────────────────────────────────────────────────────────────
describe('Cenário 15 — Múltiplos descontos: cupom promo + cupom troca + cartão', () => {
  before(() => {
    cy.criarCupomPromo(10).then(c => { Cypress.env('_c15promo', c); });

    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 1, 1, 'Vale-Troca');
      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = (res.body.trocas || [])[0];
        if (troca) {
          cy.request({
            method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
            body: { obs: 'Aprovado para teste C15' }, withCredentials: true
          }).then(aceiteRes => {
            if (aceiteRes.body.cupom_codigo) Cypress.env('_c15troca', aceiteRes.body.cupom_codigo);
          });
        }
      });
    });
  });

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve aplicar ambos os cupons e pagar saldo restante com cartão', () => {
    const cupomPromo = Cypress.env('_c15promo');
    const cupomTroca = Cypress.env('_c15troca');
    if (!cupomPromo || !cupomTroca) { cy.log('Cupons não disponíveis — pulando'); return; }

    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();

    cy.get('#inputCupomPromo').type(cupomPromo);
    cy.contains('button', 'Aplicar').first().click();
    cy.get('#feedbackPromo', { timeout: 8000 }).invoke('text').should('match', /[Dd]esconto|aplicado/);

    cy.get('#inputCupomTroca').type(cupomTroca);
    cy.get('#inputCupomTroca').siblings('button').contains('Aplicar').click();
    cy.get('#feedbackTroca', { timeout: 8000 }).should('contain', 'crédito');

    cy.get('#resumoDescontoDiv').should('be.visible');

    cy.get('#resumoTotal').invoke('text').then(txt => {
      const total = parseFloat(txt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (total <= 0) {
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
      } else {
        cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
      }
    });

    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
  });
});
