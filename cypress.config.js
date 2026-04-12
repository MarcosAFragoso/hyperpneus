const { defineConfig } = require("cypress");

module.exports = defineConfig({
  allowCypressEnv: false,

  e2e: {
    setupNodeEvents(on, config) {
      config.env.USER_EMAIL = "teste@hyperpneus.com";
    },
  },
});
