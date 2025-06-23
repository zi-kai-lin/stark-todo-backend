
import { Request, Response } from 'express';
import * as UserModel from "../models/user";
import { 
  successResponse, 
  errorResponse, 
  ErrorCode, 
  HttpStatus 
} from '../utils/apiResponse';
import moment from 'moment';

export const getAvailableGroups = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        
        const groups = await UserModel.getGroupsByUserId(userId);
        
        return successResponse(
            res,
            "User groups retrieved successfully",
            category,
            { groups }
        );
        
    } catch (error: any) {
        console.error('Error retrieving user groups:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'User not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "User not found",
                HttpStatus.NOT_FOUND
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

export const getAvailableTasks = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;
        
        // Extract query parameters with defaults
        const { 
            mode = 'personal', 
            dateOption, 
            sortBy = 'dueDate',
            groupOptions: requestGroupOptions = {},
            childViewOptions: requestChildViewOptions = {}
        } = req.body;
        
        // Validate mode
        const validModes = ['personal', 'assigned', 'watching', 'group'];
        if (!validModes.includes(mode)) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid request mode",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Validate sortBy
        const validSortOptions = ['dueDate', 'dateCreated', 'owner', 'taskId'];
        if (!validSortOptions.includes(sortBy)) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid sort by request",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Prepare the groupOptions object
        let groupOptions = undefined;
        
        if (mode === 'group') {
            // Validate group mode requirements
            if (!requestGroupOptions || !requestGroupOptions.groupId) {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "Group mode requires group id",
                    HttpStatus.BAD_REQUEST
                );
            }


            const groupId = parseInt(requestGroupOptions.groupId);
            if(isNaN(groupId) || groupId <= 0){
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "Valid group id is required",
                    HttpStatus.BAD_REQUEST
                );
            }

            if(requestGroupOptions.ownerFilter !== undefined){
                const ownerFilter = parseInt(requestGroupOptions.ownerFilter);

                if(isNaN(ownerFilter) || ownerFilter <= 0){
                    return errorResponse(
                        res,
                        category,
                        ErrorCode.INVALID_FORMAT,
                        "Invalid Owner Filter",
                        HttpStatus.BAD_REQUEST
                    );
                }
            }


            if(requestGroupOptions.assignedFilter !== undefined &&  typeof requestGroupOptions.assignedFilter !== "boolean"){
                    return errorResponse(
                        res,
                        category,
                        ErrorCode.INVALID_FORMAT,
                        "Assigned Value must be boolean",
                        HttpStatus.BAD_REQUEST
                    );

                }
                
            
            
            


            // Create the groupOptions object with the correct structure
            groupOptions = {
                groupId: requestGroupOptions.groupId,
                ownerFilter: requestGroupOptions.ownerFilter,
                assignedFilter: requestGroupOptions.assignedFilter
            };
        }
        
        // Prepare the childViewOptions object
        let childViewOptions = undefined;
        
        if (requestChildViewOptions && Object.keys(requestChildViewOptions).length > 0) {
            // Validate childViewOptions properties if provided
            if (requestChildViewOptions.showChild !== undefined && typeof requestChildViewOptions.showChild !== 'boolean') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "showChild must be a boolean",
                    HttpStatus.BAD_REQUEST
                );
            }
            
            if (requestChildViewOptions.ownerExclusive !== undefined && typeof requestChildViewOptions.ownerExclusive !== 'boolean') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "ownerExclusive must be a boolean",
                    HttpStatus.BAD_REQUEST
                );
            }
            
            if (requestChildViewOptions.sortChildren !== undefined && typeof requestChildViewOptions.sortChildren !== 'boolean') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "sortChildren must be a boolean",
                    HttpStatus.BAD_REQUEST
                );
            }
            
            childViewOptions = {
                showChild: requestChildViewOptions.showChild,
                ownerExclusive: requestChildViewOptions.ownerExclusive,
                sortChildren: requestChildViewOptions.sortChildren
            };
        }
        
        // Validate date format if provided
        if (dateOption && !moment(dateOption, 'YYYY-MM-DD', true).isValid()) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "dateOption must be in format 'yyyy-mm-dd'",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to get available tasks
        const tasks = await UserModel.getAvailableTasks(
            userId,
            mode,
            dateOption,
            sortBy,
            groupOptions,
            childViewOptions
        );
        
        return successResponse(
            res,
            "Tasks retrieved successfully",
            category,
            { tasks }
        );
        
    } catch (error: any) {
        console.error('Error retrieving tasks:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'User not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "User not found",
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Group not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Group not found",
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'User is not a member of this group') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "You are not a member of this group",
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