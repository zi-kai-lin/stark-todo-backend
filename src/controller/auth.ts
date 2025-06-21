import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { generateToken, validateToken, cookieConfig, clearAuthCookie } from '../config/auth';
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { 
    successResponse, 
    errorResponse, 
    ErrorCode, 
    HttpStatus,
    ApiCategory 
} from '../utils/apiResponse';

interface User {
    id: number;
    username: string;
}

interface UserRow extends RowDataPacket {
    user_id: number;
    username: string;
    password: string;
}

interface RegistrationBody {
    username: string;
    password: string;
}

// User registration handler
export const register = async (req: Request, res: Response): Promise<Response> => {
    let connection: PoolConnection | undefined;

    try {
        connection = await pool.getConnection();

        const body = req.body as RegistrationBody;
        const { username, password } = body;

        if (!username || !password) {
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.VALIDATION_ERROR,
                "Username and password are required",
                HttpStatus.BAD_REQUEST
            );
        }

        await connection.beginTransaction();

        const [users] = await connection.execute<any[]>(
            `SELECT 1 FROM users WHERE username = ?`, 
            [username]
        );

        if (users.length > 0) {
            await connection.rollback();
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.VALIDATION_ERROR,
                "Username already exists",
                HttpStatus.CONFLICT
            );
        }

        const saltRounds = 10;
        const encryptedPassword = await bcrypt.hash(password, saltRounds);

        const [insertResult] = await connection.execute<ResultSetHeader>(
            `INSERT INTO users (username, password) VALUES (?,?)`,
            [username, encryptedPassword]
        );

        const user: User = {
            id: insertResult.insertId,
            username: username,
        };

        // Generate JWT token
        const token = generateToken(user.id, user.username);
        
        // Commit transaction
        await connection.commit();    
        
        // Set the JWT in an HTTP-only cookie
        res.cookie('auth_token', token, cookieConfig);

        return successResponse(
            res,
            "Registration successful",
            ApiCategory.AUTH,
            {
                user: {
                    id: user.id,
                    username: user.username
                }
            },
            HttpStatus.CREATED
        );

    } catch (error) {
        console.error('Error during registration:', error);
        
        if (connection) {
            await connection.rollback();
        }

        return errorResponse(
            res,
            ApiCategory.AUTH,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred during registration",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    } finally {
        if (connection) {
            await connection.release();
        }
    }
};

// User login handler
export const login = async (req: Request, res: Response): Promise<Response> => {
    let connection: PoolConnection | undefined;

    try {
        connection = await pool.getConnection();

        const body = req.body as { username: string; password: string };
        const { username, password } = body;

        if (!username || !password) {
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.VALIDATION_ERROR,
                "Username and password are required",
                HttpStatus.BAD_REQUEST
            );
        }

        // Get user from database
        const [users] = await connection.execute<UserRow[]>(
            `SELECT user_id, username, password FROM users WHERE username = ?`,
            [username]
        );

        if (users.length === 0) {
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.UNAUTHORIZED_ERROR,
                "Invalid username or password",
                HttpStatus.UNAUTHORIZED
            );
        }

        const user = users[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return errorResponse(
                res,
                ApiCategory.AUTH,
                ErrorCode.UNAUTHORIZED_ERROR,
                "Invalid username or password",
                HttpStatus.UNAUTHORIZED
            );
        }

        // Generate JWT token
        const token = generateToken(user.user_id, user.username);

        // Set the JWT in an HTTP-only cookie
        res.cookie('auth_token', token, cookieConfig);

        return successResponse(
            res,
            "Login successful",
            ApiCategory.AUTH,
            {
                user: {
                    id: user.user_id,
                    username: user.username
                }
            },
            HttpStatus.OK
        );

    } catch (error) {
        console.error('Error during login:', error);

        return errorResponse(
            res,
            ApiCategory.AUTH,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred during login",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    } finally {
        if (connection) {
            await connection.release();
        }
    }
};

// User logout handler
export const logout = async (req: Request, res: Response): Promise<Response> => {
    try {
        // Clear the authentication cookie
        res.cookie('auth_token', '', clearAuthCookie);

        return successResponse(
            res,
            "Logout successful",
            ApiCategory.AUTH,
            {},
            HttpStatus.OK
        );

    } catch (error) {
        console.error('Error during logout:', error);
        
        return errorResponse(
            res,
            ApiCategory.AUTH,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred during logout",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};