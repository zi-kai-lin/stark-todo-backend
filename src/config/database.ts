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




// Export the pool for use in models
export { pool };