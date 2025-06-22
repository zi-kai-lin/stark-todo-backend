import dotenv from 'dotenv';

dotenv.config({ path: './tests/.env.test' });

jest.setTimeout(5000);

jest.mock('../src/config/database', () => {
    const { mockPool } = require('./mock/database');
    return { 
      pool: mockPool,
      testConnection: jest.fn().mockResolvedValue(undefined),
      initializeDatabase: jest.fn().mockResolvedValue(undefined)
    };
  });

// This function runs before each test file
beforeAll(() => {
  console.log('Starting tests...');
});

// This function runs after each test file
afterAll(() => {
  console.log('Tests completed.');
});
