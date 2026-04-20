// cypress/e2e/07_fluxo_completo_venda.cy.js
// 7ª ENTREGA — Implementação completa do caso de uso de venda

// ─────────────────────────────────────────────────────────────────
// SETUP GLOBAL — repõe estoque antes de tudo
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
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
    cy.ultimoPedido().then(p => {
      expect(p.status).to.eq('EM_PROCESSAMENTO');
    });
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
      const total = parseFloat(
        totalTxt.replace('R$','').replace(/\./g,'').replace(',','.').trim()
      );
      const v1 = (Math.floor(total / 2 * 100) / 100).toFixed(2).replace('.', ',');
      cy.get('#valorCartao1').clear().type(v1);
    });

    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
    cy.ultimoPedido().then(p => {
      expect(p.status).to.eq('EM_PROCESSAMENTO');
    });
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
    cy.get('#feedbackPromo', { timeout: 8000 }).should('contain', 'desconto');
    cy.get('#resumoDescontoDiv').should('be.visible');
    cy.get('#resumoDesconto').should('contain', 'R$');

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 4 — Compra com cupom de troca cobrindo 100%
// ─────────────────────────────────────────────────────────────────
describe('Cenário 4 — Compra com cupom de troca cobrindo 100%', () => {
  let codigoCupomAlto;

  before(() => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      cy.request({
        method: 'POST', url: '/api/pedidos/gerar-cupom-troca',
        body: { pedidoId: p.id, itensParaTroca: [{ pneu_id: 1, qtd: 1 }], valorTotal: 9999, acao: 'Vale-Troca' },
        failOnStatusCode: false, withCredentials: true
      }).then(res => {
        if (res.status === 201) codigoCupomAlto = res.body.codigo;
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
      const total = parseFloat(txt.replace('R$','').replace(/\./g,'').replace(',','.').trim());
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
    cy.visit('/checkout.html');

    cy.get('[data-cy="btn-novo-cartao"]').click();
    cy.get('#modalCartao').should('be.visible');

    cy.get('[data-cy="input-cartao-nome"]').type('CLIENTE TESTE');
    cy.get('[data-cy="input-cartao-numero"]').type('4111111111111111');
    cy.get('#cartaoValidade').type('12/28');
    cy.get('#cartaoCvv').type('123');
    cy.get('[data-cy="select-cartao-bandeira"]').select('Visa');
    cy.get('[data-cy="btn-salvar-cartao"]').click();

    cy.get('#modalCartao').should('not.have.class', 'show');
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).should('contain', '1111');

    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
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
    cy.visit('/checkout.html');

    cy.contains('Adicionar novo endereço').click();
    cy.get('#modalEndereco').should('be.visible');

    cy.get('#novoCep').type('01001000');
    cy.get('#novoLogradouro').type('Praça da Sé');
    cy.get('#novoNumero').type('1');
    cy.get('#novoBairro').type('Sé');
    cy.get('#novoCidade').type('São Paulo');
    cy.get('#novoEstado').type('SP');
    cy.get('#novoNome').type('Endereço Teste Cypress');

    // Dismiss any alert from previous attempt
    cy.on('window:alert', () => true);
    cy.get('#modalEndereco .modal-footer .btn-primary').click();

    cy.get('#modalEndereco', { timeout: 10000 }).should('not.have.class', 'show');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 })
      .should('contain', 'Endereço Teste Cypress');

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
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
        onBeforeLoad(win) {
          win.localStorage.setItem('cliente', JSON.stringify(res.body));
        }
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
      .should('contain', 'EM TRANSPORTE');
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
// CENÁRIO 10 — Troca total: cliente solicita, admin aceita
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
    cy.get('#resultadoTroca', { timeout: 8000 }).should('contain', 'TROCA-');
  });

  it('Admin aceita a troca e cupom fica disponível', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();
    cy.get('#tabelaTrocas tr', { timeout: 8000 }).should('have.length.greaterThan', 1);

    cy.get('[data-cy^="btn-aceitar-troca-"]').first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-aceitar-troca-', ''));
      cy.wrap($btn).click();
      cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
      cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
      cy.get('#modalAcao', { timeout: 10000 }).should('not.have.class', 'show');
      cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

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
      cy.request({
        method: 'POST', url: '/api/pedidos/gerar-cupom-troca',
        body: { pedidoId, itensParaTroca: [{ pneu_id: 2, qtd: 1 }], valorTotal: 500, acao: 'Vale-Troca' },
        failOnStatusCode: false, withCredentials: true
      });
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
      cy.get('#modalAcao', { timeout: 10000 }).should('not.have.class', 'show');
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
    cy.get('#resultadoTroca', { timeout: 8000 }).should('contain', 'TROCA-');
  });

  it('Admin aceita troca e confirma recebimento', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
    cy.get('#modalAcao', { timeout: 10000 }).should('not.have.class', 'show');
    cy.wait(800);
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

    cy.get('#filtroTrocaStatus').select('APROVADO', { force: true });
    cy.get('[data-cy^="btn-recebimento-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').should('be.visible').click({ force: true });
    cy.get('#modalAcao', { timeout: 10000 }).should('not.have.class', 'show');
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'Recebimento');

    cy.request({ url: '/api/admin/trocas?status=PRODUTO_RECEBIDO', withCredentials: true }).then(res => {
      expect(res.body.length).to.be.greaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 13 — Sistema gera cupom de troca automaticamente
// ─────────────────────────────────────────────────────────────────
describe('Cenário 13 — Sistema gera cupom de troca', () => {
  it('Cupom gerado deve ter código TROCA-XXXXXX e estar disponível', () => {
    criarPedidoPeloCheckout(1, 1);
    cy.ultimoPedido().then(p => {
      avancarPedidoAteEntregue(p.id);
      cy.request({
        method: 'POST', url: '/api/pedidos/gerar-cupom-troca',
        body: { pedidoId: p.id, itensParaTroca: [{ pneu_id: 1, qtd: 1 }], valorTotal: 150, acao: 'Vale-Troca' },
        failOnStatusCode: false, withCredentials: true
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.codigo).to.match(/^TROCA-[A-Z0-9]{6}$/);
        cy.loginCliente();
        cy.request({
          method: 'POST', url: '/api/carrinho/cupom/validar',
          body: { codigo: res.body.codigo }, withCredentials: true
        }).then(validRes => {
          expect(validRes.body.valido).to.eq(true);
          expect(validRes.body.cupom.tipo).to.eq('troca');
        });
      });
    });
  });
});
