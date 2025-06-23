import { Request, Response, NextFunction } from "express";
import { API_VERSION } from "../utils/apiResponse";



export const versionHeaderMiddleware = (
    req: Request, 
    res: Response, 
    next: NextFunction
  ): void => {

    res.setHeader('API-Version', API_VERSION);

    
    next();
  };
  