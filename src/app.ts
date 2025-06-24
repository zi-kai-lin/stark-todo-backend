import express, { Request, Response } from "express";
import cors from 'cors';
import helmet from 'helmet';
import morgan from "morgan";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser"
import { pool } from './config/database';
import { initializeDatabase, testConnection } from "./config/initialize";
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
    const maxRetries = 20;
    const retryDelay = 3000; /* 3 second */
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Database initialization attempt ${attempt}/${maxRetries}`);
            
            // Test database connection
            await testConnection();
            
            // Initialize database schema
            await initializeDatabase();
            
            console.log('Database initialization complete, app ready');
            break; // Exit loop on success
            
        } catch (error) {
            console.error(`Database initialization attempt ${attempt}/${maxRetries} failed:`, error);
            
            if (attempt === maxRetries) {
                console.error('Database initialization failed after all retries. Exiting...');
                process.exit(1);
            }
            
            console.log(`Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
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

app.get("/", (req: Request, res: Response) => {
    const routes = `
  注冊/登錄/登出 AUTHENTICATION ROUTES
  ------------------------
  POST   /api/v1/auth/register          注冊
  POST   /api/v1/auth/login             登錄
  POST   /api/v1/auth/logout            登出
  
  
  使用者 USER ROUTES
  --------------  
  POST   /api/v1/user/tasks             查看 當前用戶的 任務
  GET    /api/v1/user/groups            查看 當前用戶 所在的團體



  任務 TASK ROUTES
  --------------
  POST   /api/v1/task                   建立 任務
  GET    /api/v1/task/:id               查 任務 (ID)
  PATCH  /api/v1/task/:id               跟新 任務
  DELETE /api/v1/task/:id               刪除 任務
  GET    /api/v1/task/:id/comments      查看 任務 留言
  POST   /api/v1/task/:id/comments      新增 任務 留言
  DELETE /api/v1/task/:id/comments/:commentId        刪除 任務 留言
  POST   /api/v1/task/:id/watchers/:targetUserId     指派 任務 關注人
  DELETE /api/v1/task/:id/watchers/:targetUserId     解除 任務 關注人
  POST   /api/v1/task/:id/assigned/:targetUserId     指派 任務 執行人
  DELETE /api/v1/task/:id/assigned/:targetUserId     解除 任務 執行人
  GET    /api/v1/task/:id/assigneesAndWatchers       查看 任務 執行和關注人


  
  團隊 GROUP ROUTES
  ---------------
  POST   /api/v1/group                  新增 分享團隊
  DELETE /api/v1/group/:id              刪除 分享團隊
  POST   /api/v1/group/:id/users/:targetUserId      新增 分享團隊 用戶
  DELETE /api/v1/group/:id/users/:targetUserId      刪除 分享團隊 用戶
  
    `;
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(routes);
  });

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

