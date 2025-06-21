import { Request, Response } from 'express';
import * as GroupModel from '../models/group';
import { 
  successResponse, 
  errorResponse, 
  ErrorCode, 
  HttpStatus 
} from '../utils/apiResponse';

// Create a new group
export const createGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        const { name, description } = req.body;
        
        if (!name) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Group name is required",
                HttpStatus.BAD_REQUEST
            );
        }
        
        const group = await GroupModel.createGroup({
            name,
            description: description || '',
            ownerId: userId
        });
        
        return successResponse(
            res,
            "Group created successfully",
            category,
            { group },
            HttpStatus.CREATED
        );
        
    } catch (error: any) {
        console.error('Error creating group:', error);
        const category = res.locals.apiCategory;
        
        if (error.message === 'Group name already exists') {
            return errorResponse(
                res,
                category,
                ErrorCode.VALIDATION_ERROR,
                "Group name already exists",
                HttpStatus.CONFLICT
            );
        }
        
        return errorResponse(
            res,
            category,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const deleteGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        const groupId = parseInt(req.params.id);  
        
        if (isNaN(groupId)) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid group ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        const deleted = await GroupModel.deleteGroup(groupId, userId);
        
        return successResponse(
            res,
            "Group deleted successfully",
            category,
            { deleted }
        );
        
    } catch (error: any) {
        console.error('Error deleting group:', error);
        const category = res.locals.apiCategory;
        
        if (error.message === 'Group not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Group not found",
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Insufficient privileges') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "Insufficient privileges",
                HttpStatus.FORBIDDEN
            );
        }
        
        return errorResponse(
            res,
            category,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const addUserToGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        const groupId = parseInt(req.params.id);  
        const targetUserId = parseInt(req.params.targetUserId); 
        
        if (isNaN(groupId) || isNaN(targetUserId)) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid ID format",
                HttpStatus.BAD_REQUEST
            );
        }
        
        const success = await GroupModel.addUserToGroup(groupId, targetUserId, userId);
        
        return successResponse(
            res,
            "User added to group successfully",
            category,
            { success },
            HttpStatus.CREATED
        );
        
    } catch (error: any) {
        console.error('Error adding user to group:', error);
        const category = res.locals.apiCategory;
        
        if (error.message === 'Group not found' || error.message === 'User not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                error.message,
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Insufficient privileges') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "Insufficient privileges",
                HttpStatus.FORBIDDEN
            );
        }
        
        if (error.message === 'User already in group') {
            return errorResponse(
                res,
                category,
                ErrorCode.VALIDATION_ERROR,
                "User already in group",
                HttpStatus.CONFLICT
            );
        }
        
        return errorResponse(
            res,
            category,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const removeUserFromGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        const groupId = parseInt(req.params.id);  
        const targetUserId = parseInt(req.params.targetUserId);  
        
        if (isNaN(groupId) || isNaN(targetUserId)) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid ID format",
                HttpStatus.BAD_REQUEST
            );
        }
        
        const success = await GroupModel.removeUserFromGroup(groupId, targetUserId, userId);
        
        return successResponse(
            res,
            "User removed from group successfully",
            category,
            { success }
        );
        
    } catch (error: any) {
        console.error('Error removing user from group:', error);
        const category = res.locals.apiCategory;
        
        if (error.message === 'Group not found' || error.message === 'User not found in group') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                error.message,
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Insufficient privileges') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "Insufficient privileges",
                HttpStatus.FORBIDDEN
            );
        }
        
        return errorResponse(
            res,
            category,
            ErrorCode.SERVER_ERROR,
            "An unexpected error occurred",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};