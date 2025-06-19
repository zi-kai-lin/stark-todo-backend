import { Request, Response } from 'express';
import bcrypt from 'bcrypt'
import { generateToken, validateToken, cookieConfig, clearAuthCookie } from '../config/auth';
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader } from 'mysql2/promise'

interface User {

    id: number;
    username: string;

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
export const login = async (req: Request, res: Response) => {

    res.status(200).json({ message: "placeholder" });
};

// User logout handler
export const logout = async (req: Request, res: Response) => {

    res.status(200).json({ message: "placeholder" });
};