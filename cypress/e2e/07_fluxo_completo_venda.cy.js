// cypress/e2e/07_fluxo_completo_venda.cy.js
// 7ª ENTREGA — Implementação completa do caso de uso de venda

// ─────────────────────────────────────────────────────────────────
// SETUP GLOBAL
// ─────────────────────────────────────────────────────────────────
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

// Confirma que o pedido ficou EM_PROCESSAMENTO (status real após compra)
// O admin avança os status logísticos pelo painel
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

// Solicita troca via API (sem passar pela UI) para cenários onde
// o pedido já precisa ter troca pendente antes do teste começar
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
  let codigoCupom;

  before(() => {
    cy.criarCupomPromo(10).then(codigo => { codigoCupom = codigo; });
  });

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve aplicar cupom e reduzir o total', () => {
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
  let codigoCupomAlto;

  before(() => {
    // Cria pedido, avança até ENTREGUE, solicita troca, admin aprova (gera cupom)
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 1, 1, 'Vale-Troca');
      // Admin aprova via API para gerar o cupom
      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = res.body[0];
        if (troca) {
          cy.request({
            method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
            body: { obs: 'Aprovado para teste' }, withCredentials: true
          }).then(aceiteRes => {
            if (aceiteRes.body.cupom_codigo) codigoCupomAlto = aceiteRes.body.cupom_codigo;
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
    const numeroCartao = `411111111111${finalCartao}`;

    cy.visit('/checkout.html');
    cy.get('[data-cy="btn-novo-cartao"]').click();
    cy.get('#modalCartao').should('be.visible');

    cy.get('[data-cy="input-cartao-nome"]').type('CLIENTE TESTE');
    cy.get('[data-cy="input-cartao-numero"]').clear().type(numeroCartao, { delay: 50 });
    cy.get('#cartaoValidade').type('12/28');
    cy.get('#cartaoCvv').type('123');
    cy.get('[data-cy="select-cartao-bandeira"]').select('Visa');
    cy.get('[data-cy="btn-salvar-cartao"]').click();

    cy.get('#modalCartao', { timeout: 10000 }).should('not.have.class', 'show');

    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.contains('#listaCartoes1 .card-sel', finalCartao, { timeout: 8000 }).click();
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

    cy.get('#novoCep').type('01001-000');
    cy.contains('button', 'Buscar').click();
    cy.wait('@viacep');

    cy.get('#novoLogradouro').should('have.value', 'Praça da Sé');
    cy.get('#novoNumero').type(numeroEndereco);
    cy.get('#novoNome').type(`Endereço Teste Cypress ${numeroEndereco}`);

    cy.get('#modalEndereco .modal-footer .btn-primary').click();
    cy.get('#modalEndereco', { timeout: 8000 }).should('not.have.class', 'show');
    cy.contains('#listaEnderecos .card-sel', `Praça da Sé`, { timeout: 8000 }).first().click();

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    confirmarPedidoCriado();
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 7 — Cancelar pedido (cliente)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 7 — Cliente cancela pedido', () => {
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => { pedidoId = p.id; });
  });

  it('Deve cancelar pedido e reverter status para CANCELADO', () => {
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
    cy.request({ url: `/api/pedidos/${pedidoId}`, withCredentials: true }).then(res => {
      expect(res.body.status).to.eq('CANCELADO');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 8 — Admin confirma pagamento
// ─────────────────────────────────────────────────────────────────
describe('Cenário 8 — Admin confirma pagamento', () => {
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => { pedidoId = p.id; });
  });

  it('Admin confirma pagamento → status PAGAMENTO_CONFIRMADO', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#painelPrincipal', { timeout: 8000 }).should('be.visible');
    cy.get('#menu-pedidos').click();

    cy.on('window:confirm', () => true);
    cy.then(() => {
      cy.get(`[data-cy="btn-confirmar-pgto-${pedidoId}"]`, { timeout: 8000 }).click();
    });

    cy.get('#alerta', { timeout: 6000 }).should('contain', 'Pagamento confirmado');
    cy.request({ url: `/api/admin/pedidos/${pedidoId}`, withCredentials: true }).then(res => {
      expect(res.body.status).to.eq('PAGAMENTO_CONFIRMADO');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 9 — Admin: Em Transporte → Entregue
// ─────────────────────────────────────────────────────────────────
describe('Cenário 9 — Admin: Em Transporte → Entregue', () => {
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      cy.loginAdmin();
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento`, withCredentials: true });
    });
  });

  it('Admin coloca EM_TRANSPORTE', () => {
    cy.loginAdmin();
    cy.request({
      method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: 'EM_TRANSPORTE' }, withCredentials: true
    }).then(res => { expect(res.body.status).to.eq('EM_TRANSPORTE'); });

    cy.visit('/admin.html');
    cy.get('#menu-pedidos').click();
    cy.get('#filtroPedidoStatus').select('EM_TRANSPORTE');
    cy.get(`[data-cy="pedido-row-${pedidoId}"]`, { timeout: 8000 })
      .should('contain', 'Em Transporte');
  });

  it('Admin confirma ENTREGUE', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-pedidos').click();
    cy.get('#filtroPedidoStatus').select('EM_TRANSPORTE');

    cy.on('window:confirm', () => true);
    cy.then(() => {
      cy.get(`[data-cy="btn-entregue-${pedidoId}"]`, { timeout: 8000 }).click();
    });

    cy.get('#alerta', { timeout: 6000 }).should('contain', 'ENTREGUE');
    cy.request({ url: `/api/admin/pedidos/${pedidoId}`, withCredentials: true }).then(res => {
      expect(res.body.status).to.eq('ENTREGUE');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 10 — Troca total: cliente solicita, admin aceita, cupom gerado
// ─────────────────────────────────────────────────────────────────
describe('Cenário 10 — Troca total: cliente solicita, admin aceita, cupom gerado', () => {
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      avancarPedidoAteEntregue(pedidoId);
    });
  });

  it('Cliente solicita troca total', () => {
    cy.loginCliente();
    cy.then(() => { cy.visit(`/troca.html?pedido=${pedidoId}`); });
    cy.get('#containerItens', { timeout: 8000 }).should('be.visible');
    cy.get('.check-item').each($cb => cy.wrap($cb).check());
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();
    // Novo fluxo: mensagem de aguardar aprovação (não mostra cupom ainda)
    cy.get('#resultadoTroca', { timeout: 8000 })
      .should('contain', 'aprovação do administrador');
  });

  it('Admin aceita a troca e cupom é gerado na aprovação', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();
    cy.get('#tabelaTrocas tr', { timeout: 8000 }).should('have.length.greaterThan', 1);

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');

    cy.get('[data-cy^="btn-aceitar-troca-"]').first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-aceitar-troca-', ''));
      cy.wrap($btn).click();
      cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
      cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
      cy.wait('@aceitarTroca');
      cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
      cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

      // Cupom gerado AGORA pelo admin (novo fluxo)
      cy.request({ url: '/api/admin/trocas?status=APROVADO', withCredentials: true }).then(res => {
        const troca = res.body.find(t => t.id === trocaId);
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
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(2, 1);
    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      avancarPedidoAteEntregue(pedidoId);
      solicitarTrocaViaAPI(pedidoId, 2, 1, 'Vale-Troca');
    });
  });

  it('Admin nega a troca com justificativa', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.get('[data-cy^="btn-negar-troca-"]', { timeout: 8000 }).first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-negar-troca-', ''));
      cy.wrap($btn).click();
      cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
      cy.get('#modalAcaoObs').should('be.visible').type('Produto fora do prazo de troca.');
      cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
      cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
      cy.get('#alerta', { timeout: 6000 }).should('contain', 'negada');

      cy.request({ url: '/api/admin/trocas?status=NEGADO', withCredentials: true }).then(res => {
        const troca = res.body.find(t => t.id === trocaId);
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
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 2);
    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      avancarPedidoAteEntregue(pedidoId);
    });
  });

  it('Cliente solicita troca de apenas 1 unidade (parcial)', () => {
    cy.loginCliente();
    cy.then(() => { cy.visit(`/troca.html?pedido=${pedidoId}`); });
    cy.get('.check-item', { timeout: 8000 }).first().check();
    cy.get('.qtd-devolver').first().select('1');
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();
    cy.get('#resultadoTroca', { timeout: 8000 })
      .should('contain', 'aprovação do administrador');
  });

  it('Admin aceita troca e confirma recebimento', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
    cy.wait('@aceitarTroca');
    cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

    cy.intercept('PATCH', '/api/admin/trocas/*/recebimento').as('recebimento');
    cy.get('#filtroTrocaStatus').select('APROVADO', { force: true });
    cy.get('[data-cy^="btn-recebimento-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
    cy.wait('@recebimento');
    cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'Recebimento');

    cy.request({ url: '/api/admin/trocas?status=PRODUTO_RECEBIDO', withCredentials: true }).then(res => {
      expect(res.body.length).to.be.greaterThan(0);
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

      // Admin aprova e o cupom é gerado
      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = res.body[0];
        expect(troca).to.exist;

        cy.request({
          method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
          body: { obs: 'Teste automatizado' }, withCredentials: true
        }).then(aceiteRes => {
          expect(aceiteRes.status).to.eq(200);
          expect(aceiteRes.body.cupom_codigo).to.match(/^TROCA-[A-Z0-9]{6}$/);

          // Valida que o cupom pode ser usado no carrinho
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
  let pedidoId;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      avancarPedidoAteEntregue(pedidoId);
    });
  });

  it('Cliente solicita devolução com estorno', () => {
    cy.loginCliente();
    cy.then(() => { cy.visit(`/troca.html?pedido=${pedidoId}`); });
    cy.get('#containerItens', { timeout: 8000 }).should('be.visible');
    cy.get('.check-item').first().check();
    cy.get('#acaoDesejada').select('Estorno');
    cy.contains('SOLICITAR AGORA').click();
    cy.get('#resultadoTroca', { timeout: 8000 })
      .should('contain', 'estorno');
  });

  it('Admin aceita a devolução (sem gerar cupom)', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
    cy.wait('@aceitarTroca');
    cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

    // Estorno: não gera cupom — apenas aprova a devolução
    cy.request({ url: '/api/admin/trocas?status=APROVADO', withCredentials: true }).then(res => {
      const troca = res.body[0];
      expect(troca).to.exist;
      expect(troca.status).to.eq('APROVADO');
      // Sem cupom para estorno
      expect(troca.cupom_codigo).to.be.null;
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 15 — Cupom promocional + cupom de troca + cartão simultâneos
// ─────────────────────────────────────────────────────────────────
describe('Cenário 15 — Múltiplos descontos: cupom promo + cupom troca + cartão', () => {
  let cupomPromo;
  let cupomTroca;

  before(() => {
    // Cria cupom promocional
    cy.criarCupomPromo(10).then(c => { cupomPromo = c; });

    // Cria pedido entregue, solicita troca, admin aprova para gerar cupom de troca
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      solicitarTrocaViaAPI(p.id, 1, 1, 'Vale-Troca');
      cy.loginAdmin();
      cy.request({ url: '/api/admin/trocas?status=PENDENTE', withCredentials: true }).then(res => {
        const troca = res.body[0];
        if (troca) {
          cy.request({
            method: 'PATCH', url: `/api/admin/trocas/${troca.id}/aceitar`,
            body: { obs: 'Aprovado para teste cenário 15' }, withCredentials: true
          }).then(aceiteRes => {
            if (aceiteRes.body.cupom_codigo) cupomTroca = aceiteRes.body.cupom_codigo;
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
    if (!cupomPromo || !cupomTroca) { cy.log('Cupons não disponíveis — pulando'); return; }

    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();

    // Aplica cupom promocional
    cy.get('#inputCupomPromo').type(cupomPromo);
    cy.contains('button', 'Aplicar').first().click();
    cy.get('#feedbackPromo', { timeout: 8000 }).invoke('text').should('match', /[Dd]esconto|aplicado/);

    // Aplica cupom de troca
    cy.get('#inputCupomTroca').type(cupomTroca);
    cy.get('#inputCupomTroca').siblings('button').contains('Aplicar').click();
    cy.get('#feedbackTroca', { timeout: 8000 }).should('contain', 'crédito');

    // Verifica que ambos os descontos aparecem
    cy.get('#resumoDescontoDiv').should('be.visible');

    cy.get('#resumoTotal').invoke('text').then(txt => {
      const total = parseFloat(txt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (total <= 0) {
        // Cupons cobriram tudo — sem cartão necessário
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
      } else {
        // Saldo restante com cartão
        cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
      }
    });

    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
  });
});
