import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory, successResponse } from '../utils/apiResponse';
import { getAvailableGroups, getAvailableTasks } from '../controller/user';
import { authenticator } from '../middleware/auth';

const userRouter = express.Router();

// Apply authenticator middleware to all user routes
userRouter.use(authenticator);
userRouter.use(categoryMiddleware(ApiCategory.USER));

// Define routes
userRouter.get("/groups", getAvailableGroups);
userRouter.post("/tasks", getAvailableTasks); // Using POST since we're sending filter options in the body

// Test route to verify authenticator middleware - now consistent with API standards
userRouter.get("/test", (req: Request, res: Response) => {
    const category = res.locals.apiCategory;
    
    return successResponse(
        res,
        "User router is working",
        category,
        { 
            user: req.user,
            authenticated: true 
        }
    );
});

export { userRouter };