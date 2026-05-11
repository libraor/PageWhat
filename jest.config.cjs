module.exports = {
  testEnvironment: 'jsdom',
  transform: {},
  collectCoverage: true,
  collectCoverageFrom: ['lib/**/*.js', 'background.js', '!**/*.test.js'],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup-tests.js'],
};
