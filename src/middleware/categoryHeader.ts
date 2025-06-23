
import { Request, Response, NextFunction } from "express";
import { ApiCategory } from "../utils/apiResponse";

export const categoryMiddleware = (category: ApiCategory) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Store the category in res.locals for use in controllers
      res.locals.apiCategory = category;
      
      // Add a category header if desired
      res.setHeader('API-Category', category);
      
      next();
    };
  };