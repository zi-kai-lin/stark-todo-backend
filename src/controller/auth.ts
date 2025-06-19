import { Request, Response } from 'express';
import bcrypt from 'bcrypt'
import { generateToken, validateToken, cookieConfig, clearAuthCookie } from '../config/auth';
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

interface User {

    id: number;
    username: string;

}

interface UserRow extends RowDataPacket{
    user_id: number;
    username: string;
    password: string;
}

interface RegistrationBody {

    username: string;
    password: string;


}

interface CustomError {

    error: string;
    message: string;


} 



// User registration handler
export const register = async (req: Request, res: Response) : Promise<Response> => {

    let connection: PoolConnection | undefined;

    try{

        connection = await pool.getConnection();

        const body = req.body as RegistrationBody;
        const username = body.username;
        const password = body.password;

        if(!username || !password){
            const error: CustomError = {
                error: "registration error",
                message: "invalid input"
            };
            throw error;
        }

        await connection.beginTransaction();

        const [users] = await connection.execute<any[]>(` SELECT 1 FROM users WHERE username = ?`, [username])

        if (users.length > 0){

            const error: CustomError = {
                error: "registration error",
                message: "existing username"
            };
            throw error;

        }

        const saltRounds = 10;
        const encryptedPassword = await bcrypt.hash(password, saltRounds)


        const [insertResult] = await connection.execute<ResultSetHeader>(`
            INSERT INTO users (username, password) VALUES (?,?);
        `, [username, encryptedPassword]);


        const user: User = {
            id: insertResult.insertId,
            username: username,
            
        };

          // Generate JWT token
          const token = generateToken(user.id, user.username);
        
          // Commit transaction
          await connection.commit();
          
          // Set the JWT in an HTTP-only cookie instead of Authorization header
          res.cookie('auth_token', token, cookieConfig);
          
          return res.status(200).json({
              message: "success",
              user: {
                  id: user.id,
                  username: user.username,
               
              }
          });
    }

    catch(error){

        console.log(error);
        if (connection) {
            await connection.rollback();
        }
        

        
        return res.status(400).json({
            error: "registration error",
        });


    }
    finally{

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
            const error: CustomError = {
                error: "login error",
                message: "invalid input"
            };
            throw error;
        }

        // Get user from database
        const [users] = await connection.execute<UserRow[]>(
            `SELECT user_id, username, password FROM users WHERE username = ?`,
            [username]
        );

        if (users.length === 0) {
            const error: CustomError = {
                error: "login error",
                message: "invalid credentials"
            };
            throw error;
        }

        const user = users[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            const error: CustomError = {
                error: "login error",
                message: "invalid credentials"
            };
            throw error;
        }

        // Generate JWT token
        const token = generateToken(user.user_id, user.username);

        // Set the JWT in an HTTP-only cookie
        res.cookie('auth_token', token, cookieConfig);

        return res.status(200).json({
            message: "login successful",
            user: {
                id: user.user_id,
                username: user.username
            }
        });
    } catch (error) {
        console.log(error);

        // Check if it's our custom error with a safe message
        if (
            error && 
            typeof error === 'object' && 
            'message' in error && 
            'error' in error && 
            (
                (error as CustomError).message === "invalid input" ||
                (error as CustomError).message === "invalid credentials"
            )
        ) {
            return res.status(401).json({
                error: (error as CustomError).error,
                message: (error as CustomError).message
            });
        }

        // For all other errors, return a generic message
        return res.status(500).json({
            error: "login error",
            message: "an unexpected error occurred"
        });


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

        return res.status(200).json({
            message: "logout successful"
        });
    } catch (error) {
        console.log(error);
        
        return res.status(500).json({
            error: "logout error",
           
        });
    }
};