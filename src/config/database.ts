import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { getRequiredEnvVar, loadEnvPath } from '../utils/envVar'; // Reuse your env var validation function

const envPath = loadEnvPath()
dotenv.config(envPath);

interface DbConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  timezone: string;
}



const dbConfig: DbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: getRequiredEnvVar('DB_USER'),
  password: getRequiredEnvVar('DB_PASSWORD'),
  database: getRequiredEnvVar('DB_NAME'),
  port: parseInt(process.env.DB_PORT || '3306', 10),
  timezone: '+00:00' // Set timezone to UTC
  
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);


export const testConnection = async (): Promise<void>  =>{
  try {
    const connection = await pool.getConnection();
    console.log('Database connection successful');
    connection.release();
    return;
  } catch (error) {
    console.error('Database connection failed:', error);
    return;
  }
}


export async function initializeDatabase(): Promise<void> {


    const connection = await pool.getConnection();

    try {

        

        console.log("Connection with database established")


        const userTable = `
        CREATE TABLE IF NOT EXISTS users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_username (username)
        );
        `;
        
        const taskGroupsTable = `
        CREATE TABLE IF NOT EXISTS task_groups (
            group_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_created_by (created_by)
        );
        `;
        
        const tasksTable = `
        CREATE TABLE IF NOT EXISTS tasks (
            task_id INT AUTO_INCREMENT PRIMARY KEY,
            description TEXT NOT NULL,
            date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
            due_date DATE NULL,
            completed BOOLEAN DEFAULT FALSE,
            parent_id INT NULL,
            owner_id INT NOT NULL,
            group_id INT NULL,
            FOREIGN KEY (parent_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES task_groups(group_id) ON DELETE CASCADE,
            INDEX idx_completed (completed),
            INDEX idx_due_date (due_date),
            INDEX idx_owner_id (owner_id),
            INDEX idx_group_id (group_id),
            INDEX idx_date_created (date_created),
            INDEX idx_completed_due_date (completed, due_date)
        );
        `;
        
        const taskAssignedTable = `
        CREATE TABLE IF NOT EXISTS task_assigned (
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            PRIMARY KEY (task_id, user_id),
            FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_task_id (task_id),
            INDEX idx_user_id (user_id)
        );
        `;
        
        const taskWatchedTable = `
        CREATE TABLE IF NOT EXISTS task_watchers (
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            PRIMARY KEY (task_id, user_id),
            FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_task_id (task_id),
            INDEX idx_user_id (user_id)
        );
        `;
        
        const taskCommentsTable = `
        CREATE TABLE IF NOT EXISTS task_comments (
            comment_id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_task_id (task_id),
            INDEX idx_created_at (created_at)
        );
        `;
        
        const groupMembersTable = `
        CREATE TABLE IF NOT EXISTS group_members (
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            role ENUM('admin', 'member') DEFAULT 'member',
            join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES task_groups(group_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_group_id (group_id),
            INDEX idx_user_id (user_id)
        );
        `;



 

        // Split the schema into individual statements (split on semicolons)
        const tables = [
            { name: "users", sql: userTable },
            { name: "task_groups", sql: taskGroupsTable },
            { name: "tasks", sql: tasksTable },
            { name: "task_assigned", sql: taskAssignedTable },
            { name: "task_watchers", sql: taskWatchedTable },
            { name: "task_comments", sql: taskCommentsTable },
            { name: "group_members", sql: groupMembersTable },
        ];
        // Execute each statement
    
        for (const statement of tables) {
            console.log(`Checking and initializing ${statement.name} table`)
            await connection.query(statement.sql);
        }
        

    
    
        console.log('Database schema initialized successfully');



  } catch (error) {

        console.error('Failed to initialize database schema:', error);
        throw error;

  } finally {

        connection.release();

  }
}

// Export the pool for use in models
export { pool };