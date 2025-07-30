const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://google.com',
    setupNodeEvents(on, config) {
      // whatever setup you want
    },
    supportFile: false, // 🔥 disables the support file requirement
  },
});