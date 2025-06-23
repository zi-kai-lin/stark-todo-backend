import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getRequiredEnvVar,  loadEnvPath } from '../utils/envVar';


const envPath = loadEnvPath()
dotenv.config(envPath);

interface TokenPayload {
   userId: number;
   username: string;
}

interface TokenValidationResult {
   valid: boolean;
   expired: boolean;
   payload: TokenPayload | null;
}


const JWT_SECRET = getRequiredEnvVar('SECRET_KEY');
const JWT_EXPIRY = getRequiredEnvVar("SECRET_EXPIRATION")  || '3600'; // seconds

export const generateToken = (userId: number, username: string): string => {
   const payload: TokenPayload = {
       userId, 
       username
   };
   
   return jwt.sign(payload, JWT_SECRET, { expiresIn: parseInt(JWT_EXPIRY, 10) });
};

export const validateToken = (token: string): TokenValidationResult => {
   try {
       const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
       return {
           valid: true,
           expired: false,
           payload: decoded
       };
   } catch (error) {
       if (error instanceof jwt.TokenExpiredError) {
           return {
               valid: false,
               expired: true,
               payload: null
           };
       }
       
       return {
           valid: false,
           expired: false,
           payload: null
       };
   }
};

const parseSecondsToMilliseconds = (seconds: string): number => {
   const value = parseInt(seconds, 10);
   
   if (isNaN(value) || value <= 0) {
       throw new Error(`Invalid seconds format: ${seconds}`);
   }
   
   return value * 1000; // convert to milliseconds
};



const isProduction = process.env.NODE_ENV === 'production';

export const cookieConfig = {
   httpOnly: true,
   secure: isProduction,
   sameSite: 'strict' as const,
   maxAge: parseSecondsToMilliseconds(JWT_EXPIRY),
   path: '/'
};


export const clearAuthCookie = {

    maxAge: 0,  
    path: '/'   
  };