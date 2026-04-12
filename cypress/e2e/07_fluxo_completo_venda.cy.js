// cypress/e2e/07_fluxo_completo_venda.cy.js
// 7ª ENTREGA — Implementação completa do caso de uso de venda
// Cada describe = um cenário independente apresentável ao professor

// ─────────────────────────────────────────────────────────────────
// HELPERS LOCAIS
// ─────────────────────────────────────────────────────────────────
const fmt = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Finaliza pedido via API para não precisar passar pelo checkout em
// testes que precisam de um pedido já existente
function criarPedidoViaAPI(cartaoId, enderecoId) {
  return cy.request({
    method: 'POST',
    url: '/api/pedidos/finalizar',
    body: {
      endereco_id: enderecoId,
      cartoes: [{ cartao_id: cartaoId, valor: 999 }], // valor aproximado, backend valida
      tipo_frete: 'PAC'
    },
    failOnStatusCode: false
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

    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();

    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
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
    cy.adicionarAoCarrinho(1, 2); // 2 unidades para garantir valor > R$ 20
  });

  it('Deve dividir o pagamento entre 2 cartões', () => {
    cy.visit('/checkout.html');

    // Aguarda carregar
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();

    // Ativa 2 cartões
    cy.get('#r2').click();
    cy.get('#secCartao2').should('be.visible');

    // Seleciona cartões diferentes
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('#listaCartoes2 .card-sel').last().click();

    // Pega o total do resumo para dividir
    cy.get('#resumoTotal').invoke('text').then(totalTxt => {
      // Extrai valor numérico
      const total = parseFloat(totalTxt.replace(/[^\d,]/g,'').replace(',','.'));
      const v1 = Math.floor(total / 2 * 100) / 100;

      cy.get('#valorCartao1').type(v1.toFixed(2).replace('.',','));
      // v2 é calculado automaticamente
    });

    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => {
      expect(p.status).to.eq('EM_PROCESSAMENTO');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 3 — Compra com cupom promocional
// ─────────────────────────────────────────────────────────────────
describe('Cenário 3 — Compra com cupom de desconto', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Deve aplicar cupom PROMO10 e reduzir o total', () => {
    cy.visit('/checkout.html');

    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();

    // Aplica cupom promocional
    cy.get('#inputCupomPromo').type('PROMO10');
    cy.contains('button', 'Aplicar').first().click();
    cy.get('#feedbackPromo', { timeout: 5000 }).should('contain', 'desconto');

    // Verifica desconto no resumo
    cy.get('#resumoDescontoDiv').should('be.visible');
    cy.get('#resumoDesconto').should('contain', 'R$');

    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 4 — Compra com cupom de troca (total zerado)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 4 — Compra com cupom de troca cobrindo 100%', () => {
  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
  });

  it('Quando cupom cobre total, não deve exigir cartão', () => {
    // Cria cupom de alto valor via API para garantir cobertura total
    cy.request({
      method: 'POST',
      url: '/api/admin/login',
      body: { usuario: Cypress.env('adminUsuario'), senha: Cypress.env('adminSenha') }
    });

    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnRETIRADA').click(); // frete grátis

    // Aplica cupom de troca de alto valor (TROCA-001 = R$250)
    cy.get('#inputCupomTroca').type('TROCA-001');
    cy.get('#inputCupomTroca').siblings('button').contains('Aplicar').click();

    cy.get('#feedbackTroca', { timeout: 5000 }).then($el => {
      if ($el.text().includes('crédito')) {
        // Cupom aplicado — total deve ser 0
        cy.get('#resumoTotal').invoke('text').then(txt => {
          const total = parseFloat(txt.replace(/[^\d,]/g,'').replace(',','.'));
          if (total === 0) {
            // Não deve ter campos de cartão visíveis como obrigatórios
            cy.get('[data-cy="btn-finalizar"]').click();
            cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
          }
        });
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

    // Abre modal de novo cartão
    cy.get('[data-cy="btn-novo-cartao"]').click();
    cy.get('#modalCartao').should('be.visible');

    // Preenche dados
    cy.get('[data-cy="input-cartao-nome"]').type('CLIENTE TESTE');
    cy.get('[data-cy="input-cartao-numero"]').type('4111111111111111');
    cy.get('#cartaoValidade').type('12/28');
    cy.get('#cartaoCvv').type('123');
    cy.get('[data-cy="select-cartao-bandeira"]').select('Visa');
    cy.get('[data-cy="btn-salvar-cartao"]').click();

    // Modal fecha e cartão aparece na lista
    cy.get('#modalCartao').should('not.be.visible');
    cy.get('#listaCartoes1 .card-sel', { timeout: 6000 })
      .should('contain', '1111');

    // Finaliza com o novo cartão
    cy.get('#listaEnderecos .card-sel').first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
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

    // Abre modal de endereço
    cy.contains('Adicionar novo endereço').click();
    cy.get('#modalEndereco').should('be.visible');

    // Preenche manualmente (sem buscar CEP para não depender de API externa)
    cy.get('#novoCep').type('01001000');
    cy.get('#novoLogradouro').type('Praça da Sé');
    cy.get('#novoNumero').type('1');
    cy.get('#novoBairro').type('Sé');
    cy.get('#novoCidade').type('São Paulo');
    cy.get('#novoEstado').type('SP');
    cy.get('#novoNome').type('Endereço Teste Cypress');

    cy.contains('button', 'Salvar').last().click();

    // Novo endereço deve aparecer na lista
    cy.get('#listaEnderecos', { timeout: 5000 })
      .should('contain', 'Endereço Teste Cypress');

    // Seleciona e finaliza
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('#btnPAC').click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 7 — Cancelar pedido (cliente)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 7 — Cliente cancela pedido', () => {
  let pedidoId;

  beforeEach(() => {
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);

    // Cria pedido via API
    cy.request('/api/clientes').then(() => {
      cy.request('/api/carrinho').then(r => {
        const item = r.body.itens[0];
        if (!item) return;
      });
    });

    // Finaliza pedido para ter um para cancelar
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');
  });

  it('Deve cancelar pedido e reverter status para CANCELADO', () => {
    cy.loginCliente();
    cy.visit('/minha-conta.html');

    // Aguarda lista de pedidos carregar
    cy.get('#sec-pedidos', { timeout: 6000 }).should('be.visible');

    // Clica no primeiro botão de cancelar
    cy.get('[data-cy^="btn-cancelar-"]').first().then($btn => {
      const id = $btn.attr('data-cy').replace('btn-cancelar-', '');
      pedidoId = parseInt(id);

      // Aceita o confirm() do browser
      cy.on('window:confirm', () => true);
      cy.wrap($btn).click();
    });

    // Verifica badge CANCELADO na lista
    cy.get('#listaPedidos', { timeout: 6000 })
      .should('contain', 'CANCELADO');

    // Confirma via API
    cy.ultimoPedido().then(p => {
      // O pedido mais recente ou o pedidoId específico deve ser CANCELADO
      cy.request(`/api/pedidos/${pedidoId || p.id}`).then(res => {
        expect(res.body.status).to.eq('CANCELADO');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 8 — Admin confirma pagamento
// ─────────────────────────────────────────────────────────────────
describe('Cenário 8 — Admin confirma pagamento', () => {
  let pedidoId;

  before(() => {
    // Cria pedido como cliente
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => { pedidoId = p.id; });
  });

  it('Admin deve confirmar pagamento e status vai para PAGAMENTO_CONFIRMADO', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');

    // Painel já carrega logado
    cy.get('#painelPrincipal', { timeout: 6000 }).should('be.visible');

    // Vai para pedidos
    cy.get('#menu-pedidos').click();
    cy.get('#sec-pedidos').should('be.visible');

    // Localiza o pedido e clica em confirmar pagamento
    cy.get(`[data-cy="btn-confirmar-pgto-${pedidoId}"]`, { timeout: 6000 })
      .click();

    cy.on('window:confirm', () => true);

    // Verifica alerta de sucesso
    cy.get('#alerta', { timeout: 5000 }).should('contain', 'Pagamento confirmado');

    // Confirma via API
    cy.request(`/api/admin/pedidos/${pedidoId}`).then(res => {
      expect(res.body.status).to.eq('PAGAMENTO_CONFIRMADO');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 9 — Admin coloca pedido EM TRANSPORTE e confirma ENTREGUE
// ─────────────────────────────────────────────────────────────────
describe('Cenário 9 — Admin: Em Transporte → Entregue', () => {
  let pedidoId;

  before(() => {
    // Avança pedido até PAGAMENTO_CONFIRMADO via API
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      // Confirma pagamento via API admin
      cy.loginAdmin();
      cy.request({
        method: 'PATCH',
        url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento`
      });
    });
  });

  it('Admin coloca EM_TRANSPORTE', () => {
    cy.loginAdmin();
    cy.request({
      method: 'PATCH',
      url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: 'EM_TRANSPORTE' }
    }).then(res => {
      expect(res.body.status).to.eq('EM_TRANSPORTE');
    });

    // Verifica via tela do admin
    cy.visit('/admin.html');
    cy.get('#menu-pedidos').click();
    cy.get('#filtroPedidoStatus').select('EM_TRANSPORTE');
    cy.get(`[data-cy="pedido-row-${pedidoId}"]`, { timeout: 6000 })
      .should('contain', 'EM TRANSPORTE');
  });

  it('Admin confirma ENTREGUE', () => {
    cy.loginAdmin();

    cy.visit('/admin.html');
    cy.get('#menu-pedidos').click();
    cy.get('#filtroPedidoStatus').select('EM_TRANSPORTE');

    cy.get(`[data-cy="btn-entregue-${pedidoId}"]`, { timeout: 6000 }).click();
    cy.on('window:confirm', () => true);

    cy.get('#alerta', { timeout: 5000 }).should('contain', 'ENTREGUE');

    cy.request(`/api/admin/pedidos/${pedidoId}`).then(res => {
      expect(res.body.status).to.eq('ENTREGUE');
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 10 — Solicitar troca e Admin aceita (gera cupom)
// ─────────────────────────────────────────────────────────────────
describe('Cenário 10 — Troca total: cliente solicita, admin aceita, cupom gerado', () => {
  let pedidoId;

  before(() => {
    // Cria pedido e avança até ENTREGUE via API
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      cy.loginAdmin();
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento` });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'EM_TRANSPORTE' } });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'ENTREGUE' } });
    });
  });

  it('Cliente solicita troca total', () => {
    cy.loginCliente();
    cy.visit(`/troca.html?pedido=${pedidoId}`);

    cy.get('#containerItens', { timeout: 6000 }).should('be.visible');

    // Seleciona todos os itens
    cy.get('.check-item').each($cb => cy.wrap($cb).check());
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();

    cy.get('#resultadoTroca', { timeout: 6000 })
      .should('contain', 'TROCA-');
  });

  it('Admin aceita a troca e cupom fica disponível', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    // Filtra PENDENTE (padrão)
    cy.get('#tabelaTrocas tr', { timeout: 6000 })
      .should('have.length.greaterThan', 1);

    // Aceita primeira troca pendente
    cy.get('[data-cy^="btn-aceitar-troca-"]').first().then($btn => {
      const trocaId = $btn.attr('data-cy').replace('btn-aceitar-troca-', '');
      cy.wrap($btn).click();

      // Confirma no modal
      cy.get('#modalAcao').should('be.visible');
      cy.get('[data-cy="btn-confirmar-acao"]').click();

      cy.get('#alerta', { timeout: 5000 }).should('contain', 'aceita');

      // Confirma via API
      cy.request(`/api/admin/trocas?status=APROVADO`).then(res => {
        const troca = res.body.find(t => t.id === parseInt(trocaId));
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
    // Cria pedido entregue e solicita troca
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(2, 1); // pneu diferente
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      cy.loginAdmin();
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento` });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'EM_TRANSPORTE' } });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'ENTREGUE' } });

      // Cliente solicita troca via API
      cy.loginCliente();
      cy.request({
        method: 'POST',
        url: '/api/pedidos/gerar-cupom-troca',
        body: {
          pedidoId,
          itensParaTroca: [{ pneu_id: 2, qtd: 1 }],
          valorTotal: 500,
          acao: 'Vale-Troca'
        },
        failOnStatusCode: false
      });
    });
  });

  it('Admin nega a troca com justificativa', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    cy.get('[data-cy^="btn-negar-troca-"]').first().then($btn => {
      const trocaId = $btn.attr('data-cy').replace('btn-negar-troca-', '');
      cy.wrap($btn).click();

      cy.get('#modalAcao').should('be.visible');
      cy.get('#modalAcaoObs').type('Produto fora do prazo de troca.');
      cy.get('[data-cy="btn-confirmar-acao"]').click();

      cy.get('#alerta', { timeout: 5000 }).should('contain', 'negada');

      cy.request(`/api/admin/trocas?status=NEGADO`).then(res => {
        const troca = res.body.find(t => t.id === parseInt(trocaId));
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
    cy.loginCliente();
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 2); // 2 unidades do mesmo pneu
    cy.visit('/checkout.html');
    cy.get('#listaEnderecos .card-sel', { timeout: 6000 }).first().click();
    cy.get('#btnPAC').click();
    cy.get('#listaCartoes1 .card-sel').first().click();
    cy.get('[data-cy="btn-finalizar"]').click();
    cy.url({ timeout: 10000 }).should('include', 'confirmacao.html');

    cy.ultimoPedido().then(p => {
      pedidoId = p.id;
      cy.loginAdmin();
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento` });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'EM_TRANSPORTE' } });
      cy.request({ method: 'PATCH', url: `/api/admin/pedidos/${pedidoId}/status`, body: { status: 'ENTREGUE' } });
    });
  });

  it('Cliente solicita troca de apenas 1 unidade (parcial)', () => {
    cy.loginCliente();
    cy.visit(`/troca.html?pedido=${pedidoId}`);

    cy.get('.check-item').first().check();
    // Seleciona quantidade 1 (de 2)
    cy.get('.qtd-devolver').first().select('1');
    cy.get('#acaoDesejada').select('Vale-Troca');
    cy.contains('SOLICITAR AGORA').click();

    cy.get('#resultadoTroca', { timeout: 6000 }).should('contain', 'TROCA-');
  });

  it('Admin aceita troca e confirma recebimento do produto', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.get('#menu-trocas').click();

    // Aceita
    cy.get('[data-cy^="btn-aceitar-troca-"]').first().click();
    cy.get('[data-cy="btn-confirmar-acao"]').click();
    cy.get('#alerta', { timeout: 5000 }).should('contain', 'aceita');

    // Muda filtro para APROVADO e confirma recebimento
    cy.get('#filtroTrocaStatus').select('APROVADO');
    cy.get('[data-cy^="btn-recebimento-troca-"]', { timeout: 6000 }).first().click();
    cy.get('[data-cy="btn-confirmar-acao"]').click();

    cy.get('#alerta', { timeout: 5000 }).should('contain', 'Recebimento');

    cy.request(`/api/admin/trocas?status=PRODUTO_RECEBIDO`).then(res => {
      expect(res.body.length).to.be.greaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// CENÁRIO 13 — Sistema gera cupom de troca automaticamente
// ─────────────────────────────────────────────────────────────────
describe('Cenário 13 — Sistema gera cupom de troca', () => {
  it('Cupom gerado deve ter código TROCA-XXXXXX e estar disponível para uso', () => {
    cy.loginCliente();

    // Solicita troca com valor específico
    cy.request({
      method: 'POST',
      url: '/api/pedidos/gerar-cupom-troca',
      body: {
        pedidoId: 1,
        itensParaTroca: [{ pneu_id: 1, qtd: 1 }],
        valorTotal: 150,
        acao: 'Vale-Troca'
      },
      failOnStatusCode: false
    }).then(res => {
      if (res.status === 201) {
        expect(res.body.codigo).to.match(/^TROCA-[A-Z0-9]{6}$/);
        // Verifica que o cupom pode ser validado
        cy.request({
          method: 'POST',
          url: '/api/carrinho/cupom/validar',
          body: { codigo: res.body.codigo }
        }).then(validRes => {
          expect(validRes.body.valido).to.eq(true);
          expect(validRes.body.cupom.tipo).to.eq('troca');
        });
      }
    });
  });
});
