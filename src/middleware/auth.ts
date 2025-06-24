import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../config/auth';
import { errorResponse, ErrorCode, HttpStatus, ApiCategory } from "../utils/apiResponse"

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

            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.UNAUTHORIZED_ERROR,
                "Missing Authentication",
                HttpStatus.UNAUTHORIZED


            )

        }

        const validation = validateToken(token);
        console.log(validation)
        if (!validation.valid || !validation.payload) {
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.UNAUTHORIZED_ERROR,
                validation.expired ? "Session expired" : "Invalid authentication",
                HttpStatus.UNAUTHORIZED
            );
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
        return errorResponse(
            res,
            ApiCategory.AUTH,
            ErrorCode.UNAUTHORIZED_ERROR,
            "Authentication failed",
            HttpStatus.UNAUTHORIZED
        );
    }

 



}