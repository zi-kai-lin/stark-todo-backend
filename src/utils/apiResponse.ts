import { Request, Response } from "express";

export const API_VERSION = 'v1';

export enum HttpStatus {
    OK = 200,
    CREATED = 201,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500
}


export enum ApiCategory {
    AUTH = "Authentication",
    USER = "User",
    TASK = "Task",
    GROUP = "Group"
}


export enum ErrorCode {
    INVALID_FORMAT = 'invalid_format',
    NOT_FOUND = 'not_found',
    UNAUTHORIZED_ERROR = 'unauthorized',
    PERMISSION_ERROR = 'forbidden',
    SERVER_ERROR = 'server_error',
    VALIDATION_ERROR = 'validation_error'
}



export const successResponse = <T> (

    res: Response,
    message: string,
    category: string,
    data?: T,
    statusCode: HttpStatus = HttpStatus.OK,
    




): Response => {
    return res.status(statusCode)
    .header('API-Version', API_VERSION)
    .json({
      success: true,
      category,
      message,
      data,
      timestamp: new Date().toISOString()
    });

}






export const errorResponse = (
    res: Response,
    category: string,
    errorCode: ErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST
  ): Response => {
    return res.status(statusCode)
      .header('API-Version', API_VERSION)
      .json({
        success: false,
        category,
        error: {
          code: errorCode,
          message
        },
        timestamp: new Date().toISOString()
      });
  };