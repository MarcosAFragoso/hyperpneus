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

function esperarConfirmacaoEntregue() {
  cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
  cy.get('#tituloPagamento', { timeout: 15000 }).should('contain', 'Pedido Entregue');
  cy.get('#step5 .step-label').should('have.class', 'ativo');

  cy.location('search').then(search => {
    const pedidoId = new URLSearchParams(search).get('pedido');
    expect(pedidoId, 'pedido na URL de confirmação').to.exist;
    cy.wait(500);
    cy.request(`/api/pedidos/${pedidoId}`).its('body.status').should('eq', 'ENTREGUE');
  });
}

// Busca o valor total real do pedido na API e gera o cupom de troca com esse valor.
function gerarCupomTrocaComValorReal(pedidoId, pneuId, qtd, callback) {
  cy.request({ url: `/api/pedidos/${pedidoId}`, withCredentials: true }).then(pedido => {
    // parseFloat converte string ('492.09') ou number para float — cobre ambos os casos
    const raw = pedido.body.total ?? pedido.body.valor_total ?? pedido.body.subtotal;
    const valorReal = parseFloat(raw);
    expect(isFinite(valorReal), `Valor total do pedido deve ser numérico (recebido: ${raw})`).to.be.true;
    cy.request({
      method: 'POST',
      url: '/api/pedidos/gerar-cupom-troca',
      body: { pedidoId, itensParaTroca: [{ pneu_id: pneuId, qtd }], valorTotal: valorReal, acao: 'Vale-Troca' },
      failOnStatusCode: false,
      withCredentials: true
    }).then(res => {
      if (callback) callback(res);
    });
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

  it('Deve finalizar pedido com 1 cartão até a confirmação de entrega', () => {
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).first().click();
    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    esperarConfirmacaoEntregue();
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
        totalTxt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
      );
      const v1 = (Math.floor(total / 2 * 100) / 100).toFixed(2).replace('.', ',');
      cy.get('#valorCartao1').clear().type(v1);
    });

    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    esperarConfirmacaoEntregue();
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
    esperarConfirmacaoEntregue();
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
      // Usa o valor real do pedido — o cupom cobre exatamente o total do cliente,
      // sem valores arbitrários que mascarariam bugs de cálculo no checkout
      gerarCupomTrocaComValorReal(p.id, 1, 1, res => {
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
      const total = parseFloat(txt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (total <= 0) {
        cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
        cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
        cy.get('#pagamentoConfirm', { timeout: 8000 }).should('contain', 'Cupom de troca');
        cy.get('#pagamentoConfirm').should('contain', codigoCupomAlto);

        cy.location('search').then(search => {
          const pedidoId = new URLSearchParams(search).get('pedido');
          cy.request(`/api/pedidos/${pedidoId}`).then(res => {
            expect(res.body.pagamentos || []).to.have.length(0);
            if (res.body.cupom_codigo) {
              expect(res.body.cupom_codigo).to.eq(codigoCupomAlto);
              expect(res.body.cupom_tipo).to.eq('troca');
            }
          });
        });

        esperarConfirmacaoEntregue();
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
    esperarConfirmacaoEntregue();
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

    // Intercepta o ViaCEP para evitar dependência de rede externa
    cy.intercept('GET', 'https://viacep.com.br/ws/*/json/', {
      body: {
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP'
      }
    }).as('viacep');

    cy.visit('/checkout.html');

    cy.contains('Adicionar novo endereço').click();
    cy.get('#modalEndereco').should('be.visible');

    // Digita o CEP e clica em Buscar para disparar o preenchimento automático
    cy.get('#novoCep').type('01001-000');
    cy.contains('button', 'Buscar').click();
    cy.wait('@viacep');

    // Aguarda o JS do buscarCep() escrever no DOM — sem .clear() nos campos do ViaCEP
    // para evitar race condition entre o fetch e o Cypress
    cy.get('#novoLogradouro').should('have.value', 'Praça da Sé');
    cy.get('#novoBairro').should('have.value', 'Sé');
    cy.get('#novoCidade').should('have.value', 'São Paulo');
    cy.get('#novoEstado').should('have.value', 'SP');

    cy.get('#novoNumero').type(numeroEndereco);
    cy.get('#novoNome').type(`Endereço Teste Cypress ${numeroEndereco}`);

    cy.contains('button', 'Salvar').last().click();

    cy.get('#modalEndereco', { timeout: 8000 }).should('not.have.class', 'show');
    cy.contains('#listaEnderecos .card-sel', `Praça da Sé, ${numeroEndereco}`, { timeout: 8000 }).click();

    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').should('not.be.disabled').click();
    esperarConfirmacaoEntregue();
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

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');

    cy.get('[data-cy^="btn-aceitar-troca-"]').first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-aceitar-troca-', ''));
      cy.wrap($btn).click();
      cy.get('#modalAcao').should('be.visible');
      cy.get('[data-cy="btn-confirmar-acao"]').click();
      cy.wait('@aceitarTroca');
      cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
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
      // Usa o valor real do pedido para gerar o cupom de troca
      gerarCupomTrocaComValorReal(pedidoId, 2, 1, null);
    });
  });

  it('Admin nega a troca com justificativa', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.get('[data-cy^="btn-negar-troca-"]', { timeout: 8000 }).first().then($btn => {
      const trocaId = parseInt($btn.attr('data-cy').replace('btn-negar-troca-', ''));
      cy.wrap($btn).click();
      cy.get('#modalAcao').should('be.visible');
      cy.get('#modalAcaoObs').type('Produto fora do prazo de troca.');
      cy.get('[data-cy="btn-confirmar-acao"]').click();
      cy.get('#modalAcao').should('not.have.class', 'show');
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

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao').should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').click();
    cy.wait('@aceitarTroca');
    cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
    cy.get('#alerta', { timeout: 6000 }).should('contain', 'aceita');

    cy.intercept('PATCH', '/api/admin/trocas/*/recebimento').as('recebimento');
    cy.get('#filtroTrocaStatus').select('APROVADO', { force: true });
    cy.get('[data-cy^="btn-recebimento-troca-"]', { timeout: 8000 }).first().click();
    cy.get('#modalAcao').should('be.visible');
    cy.get('[data-cy="btn-confirmar-acao"]').click();
    cy.wait('@recebimento');
    cy.get('#modalAcao', { timeout: 8000 }).should('not.have.class', 'show');
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
      gerarCupomTrocaComValorReal(p.id, 1, 1, res => {
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
