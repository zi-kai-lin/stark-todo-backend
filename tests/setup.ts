import dotenv from 'dotenv';
import { testConnection, initializeDatabase } from '../src/config/initialize';
import { loadEnvPath } from '../src/utils/envVar';
import { pool } from '../src/config/database';
// Load test environment variables

const envPath = loadEnvPath()
dotenv.config(envPath);





// Global setup - run REAL database initialization once before all tests
beforeAll(async () => {
  console.log('Testing Database initialization...');
  
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


afterAll(async () => {
    console.log('Test Completed, ending pool');
    try {
      await cleanupDatabase(); // Clean before closing
      await pool.end(); // MISSING: You need to close the pool!
      console.log('Pool closed successfully');
    } catch (error) {
      console.error('Error closing pool:', error);
    }
  });


  
  export async function cleanupDatabase() {
    const connection = await pool.getConnection();
    try {
      // Prevent foreign key constraint issues
      await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
      await connection.execute('TRUNCATE TABLE task_comments');
      await connection.execute('TRUNCATE TABLE task_assigned');
      await connection.execute('TRUNCATE TABLE task_watchers');
      await connection.execute('TRUNCATE TABLE tasks');
      await connection.execute('TRUNCATE TABLE group_members');
      await connection.execute('TRUNCATE TABLE task_groups');
      await connection.execute('TRUNCATE TABLE users');
      await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw to prevent cascading failures
    } finally {
      connection.release();
    }
  }


  export async function setupTestData() {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Create baseline test users (1 and 2 are commonly used)
      await connection.execute(
        'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?), (?, ?, ?)',
        [1, 'testuser1', 'hashedpass1', 2, 'testuser2', 'hashedpass2']
      );
  
      // Create test group
      await connection.execute(
        'INSERT INTO task_groups (group_id, name, description, created_by) VALUES (?, ?, ?, ?)',
        [1, 'Test Group', 'A test group', 1]
      );
  
      // Add user 1 to group as admin
      await connection.execute(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [1, 1, 'admin']
      );
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }