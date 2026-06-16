// cypress/e2e/08_fluxo_completo_sistema.cy.js
// DEMONSTRAÇÃO VISUAL COMPLETA — HyperPneus

const TS = Date.now();

function gerarCpf() {
  const base = String(TS).slice(-9).padStart(9, '0');
  const n = base.split('').map(Number);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < 9; i++) s1 += n[i] * (10 - i);
  const d1 = (s1 * 10) % 11 >= 10 ? 0 : (s1 * 10) % 11;
  for (let i = 0; i < 9; i++) s2 += n[i] * (11 - i);
  s2 += d1 * 2;
  const d2 = (s2 * 10) % 11 >= 10 ? 0 : (s2 * 10) % 11;
  return `${base}${d1}${d2}`;
}
function cpfMask(cpf) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

const CLIENTE = {
  nome: 'Marcos',
  sobrenome: `Demo${String(TS).slice(-4)}`,
  email: `demo.${TS}@hyperpneus.dev`,
  senha: 'HyperDemo@2026',
  cpf: gerarCpf(),
};
const finalCartao = String(TS).slice(-4);
const numeroCartao = `411111111111${finalCartao}`;

const PAGINA = 3500;
const CAMPO = 800;
const ACAO = 2500;
const VER = 4000;
const NARRAR = 3000;
const STEPPER = 5000;

// Salva pedidoId no Cypress.env para persistir entre describes
function salvarPedidoId() {
  cy.loginCliente(CLIENTE.email, CLIENTE.senha);
  cy.request({ url: '/api/pedidos', withCredentials: true }).then(res => {
    expect(res.body.length).to.be.greaterThan(0);
    Cypress.env('_demoPedidoId', res.body[0].id);
    cy.log(`📋 pedidoId salvo: ${res.body[0].id}`);
  });
}

function avancarStatusViaAPI(pedidoId, novoStatus) {
  cy.loginAdmin();
  if (novoStatus === 'PAGAMENTO_CONFIRMADO') {
    cy.request({
      method: 'PATCH',
      url: `/api/admin/pedidos/${pedidoId}/confirmar-pagamento`,
      withCredentials: true, failOnStatusCode: false
    });
  } else {
    cy.request({
      method: 'PATCH',
      url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: novoStatus },
      withCredentials: true, failOnStatusCode: false
    });
  }
}

before(() => {
  cy.resetEstoque();
  cy.wait(1000);
});

// ════════════════════════════════════════════════════════
// CENÁRIO 1 — Vitrine
// ════════════════════════════════════════════════════════
describe('Cenário 1 — Vitrine da loja HyperPneus', () => {

  it('Página inicial com produtos em destaque', () => {
    cy.log('🏠 Abrindo a loja HyperPneus...');
    cy.visit('/index.html');
    cy.wait(PAGINA);
    cy.get('#gridDestaques .card-pneu', { timeout: 10000 })
      .should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('✅ Vitrine carregada com produtos em destaque');
  });

  it('Busca pneu pela medida 205/55 R16', () => {
    cy.log('🔍 Filtro de busca por medida');
    cy.visit('/index.html');
    cy.wait(PAGINA);

    cy.get('#filtroLargura').select('205'); cy.wait(ACAO);
    cy.get('#filtroPerfil').select('55'); cy.wait(ACAO);
    cy.get('#filtroAro').select('16'); cy.wait(ACAO);
    cy.contains('button', 'Buscar').click();
    cy.wait(PAGINA);

    cy.get('#gridResultados .card-pneu', { timeout: 10000 })
      .should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('✅ Resultados encontrados para 205/55 R16');

    cy.get('#gridResultados .card-pneu').first().click();
    cy.wait(PAGINA);
    cy.get('#btnAdicionar', { timeout: 10000 }).should('be.visible');
    cy.wait(VER);
    cy.log('📄 Página de detalhe carregada');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 2 — Carrinho anônimo
// localStorage só persiste dentro do mesmo it() — tudo em um bloco só
// ════════════════════════════════════════════════════════
describe('Cenário 2 — Carrinho anônimo (sem login)', () => {

  it('Adiciona pneu ao carrinho e visualiza — sem login', () => {
    cy.log('🛒 Demonstrando carrinho anônimo via localStorage');

    // Passo 1: abre detalhe e adiciona ao carrinho
    cy.visit('/detalhe.html?id=1');
    cy.wait(PAGINA);
    cy.get('[data-cy="btn-adicionar"]', { timeout: 10000 }).should('be.visible');
    cy.wait(CAMPO);
    cy.get('[data-cy="btn-adicionar"]').click();
    cy.get('[data-cy="btn-adicionar"]', { timeout: 8000 }).should('contain', 'Adicionado');
    cy.wait(ACAO);
    cy.log('✅ Item adicionado — salvo no localStorage do navegador');

    // Passo 2: navega para carrinho NO MESMO it() para preservar o localStorage
    cy.visit('/carrinho.html');
    cy.wait(PAGINA);

    // O carrinho.html lê o localStorage e renderiza os itens
    cy.get('#carrinhoConteudo', { timeout: 10000 }).should('not.have.class', 'd-none');
    cy.get('#tabelaItens tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('📦 Item aparece no carrinho — localStorage funcionando corretamente');
    cy.log('ℹ️ Ao fazer login, este item será migrado automaticamente para o banco');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 3 — Cadastro
// ════════════════════════════════════════════════════════
describe('Cenário 3 — Cadastro de novo cliente', () => {

  it('Preenche o formulário e cria a conta', () => {
    cy.log('📝 Criando nova conta de cliente');
    cy.visit('/cadastro.html');
    cy.wait(PAGINA);

    cy.get('#cadNome').type(CLIENTE.nome, { delay: 40 }); cy.wait(CAMPO);
    cy.get('#cadSobrenome').type(CLIENTE.sobrenome, { delay: 40 }); cy.wait(CAMPO);
    cy.get('#cadCpf').type(cpfMask(CLIENTE.cpf), { delay: 40 }); cy.wait(ACAO);
    cy.get('#cadEmail').type(CLIENTE.email, { delay: 40 }); cy.wait(CAMPO);
    cy.get('#cadSenha').type(CLIENTE.senha, { delay: 40 }); cy.wait(CAMPO);
    cy.get('#cadConfirmar').type(CLIENTE.senha, { delay: 40 }); cy.wait(ACAO);

    cy.contains('button', 'CRIAR CONTA').click();
    cy.url({ timeout: 10000 }).should('match', /login\.html|index\.html/);
    cy.wait(VER);
    cy.log('✅ Conta criada com sucesso!');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 4 — Login
// ════════════════════════════════════════════════════════
describe('Cenário 4 — Login do cliente', () => {

  it('Autentica com a conta recém-criada', () => {
    cy.log('🔐 Fazendo login com a nova conta');
    cy.visit('/login.html');
    cy.wait(PAGINA);

    cy.get('#loginEmail').type(CLIENTE.email, { delay: 50 }); cy.wait(ACAO);
    cy.get('#loginSenha').type(CLIENTE.senha, { delay: 50 }); cy.wait(ACAO);
    cy.contains('button', 'ENTRAR').click();
    cy.url({ timeout: 10000 }).should('not.include', 'login.html');
    cy.wait(VER);
    cy.log('✅ Login realizado — sessão ativa');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 5 — Checkout
// ════════════════════════════════════════════════════════
describe('Cenário 5 — Checkout: endereço, frete e pagamento', () => {

  beforeEach(() => {
    cy.loginCliente(CLIENTE.email, CLIENTE.senha);
  });

  it('Adiciona endereço via CEP', () => {
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.wait(PAGINA);

    cy.intercept('GET', 'https://viacep.com.br/ws/*/json/', {
      body: { logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }
    }).as('viacep');

    cy.contains('Adicionar novo endereço').click();
    cy.get('#modalEndereco').should('be.visible'); cy.wait(ACAO);
    cy.get('#novoCep').type('01310100', { delay: 50 }); cy.wait(ACAO);
    cy.contains('button', 'Buscar').click();
    cy.wait('@viacep'); cy.wait(ACAO);
    cy.get('#novoLogradouro').should('have.value', 'Avenida Paulista');
    cy.get('#novoNumero').type('1578', { delay: 50 }); cy.wait(CAMPO);
    cy.get('#novoNome').type('Trabalho', { delay: 50 }); cy.wait(ACAO);
    cy.get('#modalEndereco .modal-footer .btn-primary').click();
    cy.get('#modalEndereco', { timeout: 8000 }).should('not.have.class', 'show');
    cy.contains('#listaEnderecos .card-sel', 'Avenida Paulista', { timeout: 8000 }).click();
    cy.wait(VER);
    cy.log('✅ Endereço adicionado via CEP e selecionado');
  });

  it('Escolhe frete PAC', () => {
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.wait(PAGINA);
    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click(); cy.wait(ACAO);
    cy.get('#btnPAC').click(); cy.wait(ACAO);
    cy.get('#resumoFrete', { timeout: 6000 }).invoke('text').then(t => {
      cy.log(`📦 Frete PAC calculado: ${t}`);
    });
    cy.wait(VER);
    cy.log('✅ Frete PAC selecionado — 7% do valor dos produtos');
  });

  it('Cadastra cartão e finaliza a compra', () => {
    cy.limparCarrinho();
    cy.adicionarAoCarrinho(1, 1);
    cy.visit('/checkout.html');
    cy.wait(PAGINA);

    cy.get('#listaEnderecos .card-sel', { timeout: 8000 }).first().click(); cy.wait(ACAO);
    cy.get('#btnPAC').click(); cy.wait(ACAO);

    cy.get('[data-cy="btn-novo-cartao"]').click();
    cy.get('#modalCartao').should('be.visible'); cy.wait(ACAO);
    cy.get('[data-cy="input-cartao-nome"]').type('MARCOS DEMO', { delay: 50 }); cy.wait(CAMPO);
    cy.get('[data-cy="input-cartao-numero"]').clear().type(numeroCartao, { delay: 50 }); cy.wait(CAMPO);
    cy.get('#cartaoValidade').type('12/28', { delay: 50 }); cy.wait(CAMPO);
    cy.get('#cartaoCvv').type('123', { delay: 50 }); cy.wait(CAMPO);
    cy.get('[data-cy="select-cartao-bandeira"]').select('Visa'); cy.wait(ACAO);
    cy.get('[data-cy="btn-salvar-cartao"]').click();
    cy.get('#modalCartao', { timeout: 10000 }).should('not.have.class', 'show'); cy.wait(ACAO);

    cy.get('#listaCartoes1 .card-sel', { timeout: 8000 }).first().click(); cy.wait(VER);

    // intercepta a rota correta /finalizar
    cy.intercept('POST', '/api/pedidos/finalizar').as('finalizarPedido');
    cy.get('[data-cy="btn-finalizar"]', { timeout: 8000 }).should('not.be.disabled').click();
    cy.wait('@finalizarPedido', { timeout: 12000 }).its('response.statusCode').should('eq', 201);

    cy.url({ timeout: 12000 }).should('include', 'confirmacao.html');
    cy.get('#tituloPagamento', { timeout: 10000 }).should('contain', 'Confirmado');
    cy.wait(VER);
    cy.log('🎉 PEDIDO CONFIRMADO — registrado no banco com status EM_PROCESSAMENTO!');

    // salva pedidoId usando o novo cliente
    cy.request({ url: '/api/pedidos', withCredentials: true }).then(res => {
      expect(res.body.length).to.be.greaterThan(0);
      Cypress.env('_demoPedidoId', res.body[0].id);
      cy.log(`📋 Pedido #${res.body[0].id} salvo`);
    });
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 6 — Painel Admin + Acompanhamento
// ════════════════════════════════════════════════════════
describe('Cenário 6 — Painel Admin e Acompanhamento do Pedido', () => {

  it('Admin confirma pagamento via API e cliente vê etapa 2', () => {
    const pedidoId = Cypress.env('_demoPedidoId');
    expect(pedidoId, 'pedidoId deve existir').to.be.greaterThan(0);

    // Avança via API 
    avancarStatusViaAPI(pedidoId, 'PAGAMENTO_CONFIRMADO');
    cy.wait(ACAO);

    // Mostra o painel admin com o pedido confirmado
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.wait(PAGINA);
    cy.contains('.nav-admin .nav-link', 'Pedidos').click(); cy.wait(PAGINA);
    cy.get('#filtroStatusPedido').select('PAGAMENTO_CONFIRMADO'); cy.wait(ACAO);
    cy.get('#tabelaPedidosBody tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('✅ Admin confirmou pagamento — pedido avançou para PAGAMENTO_CONFIRMADO');

    // Cliente vê etapa atualizada na tela de acompanhamento
    cy.loginCliente(CLIENTE.email, CLIENTE.senha);
    cy.visit(`/confirmacao.html?pedido=${pedidoId}&modo=visualizar`);
    cy.wait(PAGINA);
    cy.get('.step-icon.ativo, .step-icon.completado', { timeout: 8000 })
      .should('have.length.greaterThan', 0);
    cy.wait(STEPPER);
    cy.log('🔵 Cliente vê progresso atualizado na tela de acompanhamento');
  });

  it('Admin coloca EM_TRANSPORTE e cliente vê progresso', () => {
    const pedidoId = Cypress.env('_demoPedidoId');

    avancarStatusViaAPI(pedidoId, 'EM_TRANSPORTE');
    cy.wait(ACAO);

    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.wait(PAGINA);
    cy.contains('.nav-admin .nav-link', 'Pedidos').click(); cy.wait(PAGINA);
    cy.get('#filtroStatusPedido').select('EM_TRANSPORTE'); cy.wait(ACAO);
    cy.get('#tabelaPedidosBody tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('🚚 Pedido despachado para transporte');

    cy.loginCliente(CLIENTE.email, CLIENTE.senha);
    cy.visit(`/confirmacao.html?pedido=${pedidoId}&modo=visualizar`);
    cy.wait(PAGINA);
    cy.get('.step-icon.ativo, .step-icon.completado', { timeout: 8000 })
      .should('have.length.greaterThan', 1);
    cy.wait(STEPPER);
  });

  it('Admin confirma ENTREGUE e cliente vê pedido finalizado', () => {
    const pedidoId = Cypress.env('_demoPedidoId');

    avancarStatusViaAPI(pedidoId, 'ENTREGUE');
    cy.wait(ACAO);

    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.wait(PAGINA);
    cy.contains('.nav-admin .nav-link', 'Pedidos').click(); cy.wait(PAGINA);
    cy.get('#filtroStatusPedido').select('ENTREGUE'); cy.wait(ACAO);
    cy.get('#tabelaPedidosBody tr', { timeout: 8000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('🏠 Entrega confirmada pelo administrador');

    cy.loginCliente(CLIENTE.email, CLIENTE.senha);
    cy.visit(`/confirmacao.html?pedido=${pedidoId}&modo=visualizar`);
    cy.wait(PAGINA);
    cy.get('.step-icon.completado, .step-icon.ativo', { timeout: 8000 })
      .should('have.length.greaterThan', 0);
    cy.wait(STEPPER);
    cy.log('🟢 FLUXO COMPLETO — pedido entregue ao cliente!');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 7 — Troca de Produto
// ════════════════════════════════════════════════════════
describe('Cenário 7 — Solicitação de Troca de Produto', () => {

  it('Cliente solicita Vale-Troca em troca.html', () => {
    const pedidoId = Cypress.env('_demoPedidoId');
    expect(pedidoId, 'pedidoId deve existir').to.be.greaterThan(0);

    // Garante ENTREGUE via API antes de abrir troca.html
    cy.loginAdmin();
    cy.request({
      method: 'PATCH',
      url: `/api/admin/pedidos/${pedidoId}/status`,
      body: { status: 'ENTREGUE' },
      withCredentials: true,
      failOnStatusCode: false
    });

    cy.loginCliente(CLIENTE.email, CLIENTE.senha);
    cy.visit(`/troca.html?pedido=${pedidoId}`);
    cy.wait(PAGINA);

    cy.get('#containerItens', { timeout: 10000 }).should('be.visible'); cy.wait(VER);
    cy.get('.check-item', { timeout: 8000 }).first().check(); cy.wait(ACAO);
    cy.get('#acaoDesejada').select('Vale-Troca'); cy.wait(ACAO);

    // rota correta é /api/pedidos/gerar-cupom-troca
    cy.intercept('POST', '/api/pedidos/gerar-cupom-troca').as('salvarTroca');
    cy.contains('SOLICITAR AGORA').click();
    cy.wait('@salvarTroca', { timeout: 8000 }).its('response.statusCode').should('eq', 201);

    cy.get('#resultadoTroca', { timeout: 8000 })
      .should('contain', 'aprovação do administrador');
    cy.wait(VER);
    cy.log('✅ Solicitação de troca enviada — aguarda aprovação do admin');
  });
});

// ════════════════════════════════════════════════════════
// CENÁRIO 8 — Pós-Venda e Dashboard
// ════════════════════════════════════════════════════════
describe('Cenário 8 — Gestão de Pós-Venda e Business Intelligence', () => {

  it('Admin aprova a troca no painel', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.wait(PAGINA);

    cy.contains('.nav-admin .nav-link', 'Trocas').click(); cy.wait(ACAO);
    cy.get('#aba-trocas-lista', { timeout: 6000 }).click(); cy.wait(PAGINA);
    cy.get('#tabelaTrocasBody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);

    cy.intercept('PATCH', '/api/admin/trocas/*/aceitar').as('aceitarTroca');
    cy.get('[data-cy^="btn-aceitar-troca-"]', { timeout: 8000 }).first().click();
    cy.wait(ACAO);

    cy.get('#modalJustificativaTroca.show, #modalAcao.show', { timeout: 6000 }).should('be.visible');
    cy.get('#justificativaTexto, #modalAcaoObs').type('Vale-troca aprovado.', { delay: 40 });
    cy.wait(ACAO);
    cy.get('#btnConfirmarJustificativa, [data-cy="btn-confirmar-acao"]').click();
    cy.wait('@aceitarTroca', { timeout: 8000 }).its('response.statusCode').should('eq', 200);
    cy.wait(VER);
    cy.log('✅ Troca aprovada — cupom gerado automaticamente pelo sistema');
  });

  it('Dashboard exibe métricas e gráficos', () => {
    cy.loginAdmin();
    cy.visit('/admin.html');
    cy.wait(PAGINA);

    cy.get('#painelPrincipal', { timeout: 10000 }).should('be.visible'); cy.wait(NARRAR);

    cy.get('#m-total-pedidos', { timeout: 8000 }).invoke('text').then(t => {
      cy.log(`📦 Total de pedidos: ${t.trim()}`);
    });
    cy.wait(ACAO);
    cy.get('#m-faturamento', { timeout: 8000 }).invoke('text').then(t => {
      cy.log(`💰 Faturamento total: ${t}`);
    });
    cy.wait(VER);

    cy.get('canvas', { timeout: 10000 }).should('have.length.greaterThan', 0);
    cy.wait(VER);
    cy.log('📊 Dashboard com métricas e gráfico de vendas por categoria');

    cy.contains('.nav-admin .nav-link', 'Trocas').click(); cy.wait(ACAO);
    cy.get('#aba-trocas-dashboard', { timeout: 6000 }).should('be.visible');
    cy.wait(VER);
    cy.log('✅ Demonstração completa do HyperPneus concluída!');
  });
});
