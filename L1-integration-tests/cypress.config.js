const { defineConfig } = require('cypress');

module.exports = defineConfig({
  projectId: 'nb24jr',
  e2e: {
    baseUrl: 'https://google.com',
    setupNodeEvents(on, config) {
      // whatever setup you want
    },
    supportFile: false, // 🔥 disables the support file requirement
  },
});