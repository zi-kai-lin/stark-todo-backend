import express, { Request, Response } from "express";
import cors from 'cors';
import helmet from 'helmet';
import morgan from "morgan";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser"
import { testConnection, initializeDatabase, pool } from './config/database';

import { versionHeaderMiddleware } from "./middleware/versionHeader";
import { authRouter } from "./router/auth";
import { userRouter } from "./router/user";
import { taskRouter } from "./router/task";
import { groupRouter } from "./router/group";


const corsSettings = {
    origin: [
        "http://localhost:3000",
        "http://localhost:4000"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    maxAge: 86400
};

const app = express();


(async () => {
    try {
        // Test database connection
        console.log('Initializing database connection');
        await testConnection();
        
        // Initialize database schema
        console.log('Initializing database schema');
        await initializeDatabase();
        
        console.log('Database initialization complete, app ready, ');
    } catch (error) {
        console.error('Database initialization failed:', error);
        console.error('Exiting...');
        process.exit(1); // Exit with error code
    }
})();



app.use(cors(corsSettings));
app.use(helmet());
app.use(morgan('tiny'));  // HTTP request logger
app.use(bodyParser.json()); 
app.use(cookieParser());

app.use(versionHeaderMiddleware);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/task", taskRouter);
app.use("/api/v1/group", groupRouter);


export const shutdown = async (signal: string) => {
    console.log(`Shutting down`);
    
    try {
        if (pool) {
            await pool.end();
            console.log("SQL pool closed");
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C




export default app;

