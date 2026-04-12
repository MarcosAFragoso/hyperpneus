const { defineConfig
} = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http: //localhost:3000',
    specPattern: 'cypress/e2e /**/*.cy.js',
    supportFile: 'cypress/support/commands.js',
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 8000,
    requestTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
  },
  env: {
    clienteEmail: 'teste@hyperpneus.com',
    clienteSenha: 'teste1234',
    adminUsuario: 'admin',
    adminSenha:   'admin123'
  }
});
