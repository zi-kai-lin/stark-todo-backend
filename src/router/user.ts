import express, { Request, Response } from 'express';

// Import controller functions (to be implemented later)
import { getAvailableGroups, getAvailableTasks } from '../controller/user';
import { authenticator } from '../middleware/auth';

const userRouter = express.Router();

// Apply authenticator middleware to all user routes
userRouter.use(authenticator);

// Define routes
userRouter.get("/groups", getAvailableGroups);
userRouter.post("/tasks", getAvailableTasks); // Using POST since we're sending filter options in the body

// Test route to verify authenticator middleware
userRouter.get("/test", (req: Request, res: Response) => {
    
    return res.status(200).json({ 
        message: "User router is working",
        user: req.user // Return the user object from the token
    });
});

export { userRouter };