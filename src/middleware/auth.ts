import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../config/auth';


// extend to allow for req.user
/* handle user prop from req */
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: number;
                username: string;
            };
        }
    }
}


export const authenticator = (req: Request, res: Response, next: NextFunction) : Response | void => {

    try {

        /* Obtain cookie */
        const token = req.cookies.auth_token;
        if(!token){

            return res.status(401).json({ 
                error: "authentication error", 
                message: "missing authentication" 
            });

        }

        const validation = validateToken(token);
        console.log(validation)
        if (!validation.valid || !validation.payload) {
            return res.status(401).json({ 
                error: "authentication error", 
                message: validation.expired ? "session expired" : "invalid authentication" 
            });
        }

        req.user = {
            userId: validation.payload.userId,
            username: validation.payload.username
        };
        
        // Proceed to the next middleware or route handler
        next();

    } catch (error) {
        // Handle any unexpected errors during authentication
        console.error('Authentication error:', error);
        return res.status(401).json({ 
            error: "authentication error", 
            message: "authentication failed" 
        });
    }

 



}