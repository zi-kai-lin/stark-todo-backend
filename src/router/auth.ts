import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory } from '../utils/apiResponse';
// Import controller functions (to be implemented later)
import { register, login, logout } from '../controller/auth';

const authRouter = express.Router();

/* Route specific to user authenticaiton 使用者登錄等 */

authRouter.use(categoryMiddleware(ApiCategory.AUTH));

// Auehtnication Routes
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);


export { authRouter };