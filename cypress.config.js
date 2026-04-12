const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000', // ajuste para sua porta local
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    env: {
      clienteEmail: "teste@hyperpneus.com",
      clienteSenha: "123" // adicione a senha se o teste pedir
    },
  },
});