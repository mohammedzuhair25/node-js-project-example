export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?js$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/test/**/*.test.mjs'],
};