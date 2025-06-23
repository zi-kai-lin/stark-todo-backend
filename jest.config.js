// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // SEQUENTIAL TEST EXECUTION
  maxWorkers: 1,           // Run only 1 worker (no parallel execution)
  maxConcurrency: 1,       // Run only 1 test at a time
  

  testMatch: [
    '**/tests/unit/models/task.test.ts',  // Run task tests first
    '**/tests/unit/models/user.test.ts',
    '**/tests/unit/models/group.test.ts'  // Then user tests
  ],
  
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  clearMocks: true,
  restoreMocks: true,
  
  testTimeout: 30000,


 
};