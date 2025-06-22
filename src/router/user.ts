import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory, successResponse } from '../utils/apiResponse';
import { getAvailableGroups, getAvailableTasks } from '../controller/user';
import { authenticator } from '../middleware/auth';

const userRouter = express.Router();

// Apply authenticator middleware to all user routes
userRouter.use(authenticator);
userRouter.use(categoryMiddleware(ApiCategory.USER));

/* 使用者個人用的 API */

// Define routes 查看自己的團隊 & 自己的任務
userRouter.get("/groups", getAvailableGroups);
userRouter.post("/tasks", getAvailableTasks); 



export { userRouter };