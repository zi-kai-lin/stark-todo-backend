import express, { Request, Response } from 'express';

// Import controller functions (to be implemented later)
import { register, login, logout } from '../controller/auth';

const authRouter = express.Router();

// Define routes
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/test", (req: Request, res: Response) => {
    return res.status(200).json({ message: "Authentication router is working" });
});

export { authRouter };