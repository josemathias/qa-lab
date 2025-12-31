module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/L0/**/*.test.js'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/portal/', '/_deprecated/'],
  setupFiles: ['<rootDir>/jest.setup.cjs'],
};
