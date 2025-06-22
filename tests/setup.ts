import dotenv from 'dotenv';
import { testConnection, initializeDatabase } from '../src/config/database';
import { loadEnvPath } from '../src/utils/envVar';
// Load test environment variables

const envPath = loadEnvPath()
dotenv.config(envPath);


jest.setTimeout(15000);

// Global setup - run REAL database initialization once before all tests
beforeAll(async () => {
  console.log('Database initialization...');
  
  try {
    // Test real database connection
    await testConnection();
    console.log('Database connection successful');
    
    // Initialize real database schema
    await initializeDatabase();
    console.log('Database schema initialized');
    
  } catch (error) {
    console.error('Database setup failed:', error);
    throw error;
  }
});

// After the real setup, mock the database for individual tests
beforeAll(() => {
  // Mock the database module for individual tests (after real setup)
  jest.doMock('../src/config/database', () => {
    const { mockPool } = require('./mock/database');
    return { 
      pool: mockPool,
      testConnection: jest.fn().mockResolvedValue(undefined),
      initializeDatabase: jest.fn().mockResolvedValue(undefined)
    };
  });
});

// Reset mocks before each test
beforeEach(() => {
  const { resetMocks } = require('./mock/database');
  resetMocks();
});

// Cleanup after all tests
afterAll(() => {
  console.log('Test database setup completed.');
});