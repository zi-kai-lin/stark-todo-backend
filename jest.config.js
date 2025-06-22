module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testRegex: '/tests/.*\\.test\\.ts$',
  moduleFileExtensions: ['ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};