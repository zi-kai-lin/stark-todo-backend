import { Request, Response } from 'express';
import * as TaskModel from "../models/task";
import { 
  successResponse, 
  errorResponse, 
  ErrorCode, 
  HttpStatus 
} from '../utils/apiResponse';
import moment from "moment";

export const getTaskById = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to get the task with children
        const taskWithChildren = await TaskModel.getTaskById(taskId, userId);
        
        return successResponse(
            res,
            "Task retrieved successfully",
            category,
            { task: taskWithChildren }
        );
        
    } catch (error: any) {
        console.error('Error retrieving task:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
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

export const createTask = async (req: Request, res: Response): Promise<Response> => {
    console.log("here")
    try {
        const userId = req.user!.userId;
        const category = res.locals.apiCategory;

        if (!req.body) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Missing request body",
                HttpStatus.BAD_REQUEST
            );
        }

        const { description, dueDate, groupId, parentId } = req.body;
        if (description === undefined || (typeof description !== 'string' || description.trim() === '')) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Missing task description",
                HttpStatus.BAD_REQUEST
            );
        }

        if(dueDate !== undefined && !(moment(dueDate, 'YYYY-MM-DD', true).isValid())){
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid date format (yyyy-mm-dd)",
                HttpStatus.BAD_REQUEST
            );
        }

        if(groupId !== undefined && (isNaN(groupId) || groupId <= 0)){
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid id format",
                HttpStatus.BAD_REQUEST
            );
        }



        
        const task = await TaskModel.createTask({
            description,
            dueDate: dueDate || null,
            ownerId: userId,
            groupId: groupId || null,
            parentId: parentId || null,
            completed: false
        });
        
        return successResponse(
            res,
            "Task created successfully",
            category,
            { task },
            HttpStatus.CREATED
        );
        
    } catch (error: any) {
        console.error('Error creating task:', error);
        const category = res.locals.apiCategory;
    
        // Handle specific errors from the model
        if (error.message === 'Parent task does not exist') {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "The specified parent task does not exist",
                HttpStatus.BAD_REQUEST
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

export const updateTask = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        // Validate taskId
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Validate body exists
        if (!req.body) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Missing request body",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Extract update fields
        const { description, dueDate, groupId, completed } = req.body;
        
        // Ensure at least one field is being updated
        if (description === undefined && dueDate === undefined && 
            groupId === undefined && completed === undefined) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "No update fields provided",
                HttpStatus.BAD_REQUEST
            );
        }
        
        if (description === undefined || (typeof description !== 'string' || description.trim() === '')) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Missing task description",
                HttpStatus.BAD_REQUEST
            );
        }

        if(dueDate !== undefined && !(moment(dueDate, 'YYYY-MM-DD', true).isValid())){
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid date format (yyyy-mm-dd)",
                HttpStatus.BAD_REQUEST
            );
        }

        if(groupId !== undefined && (isNaN(groupId) || groupId <= 0)){
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid id format",
                HttpStatus.BAD_REQUEST
            );
        }

        if(completed !== undefined && typeof(completed) !== "boolean"){
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Completion status must be boolean",
                HttpStatus.BAD_REQUEST
            );
        }



        // Call the model function to update the task
        const updatedTask = await TaskModel.updateTask(taskId, userId, {
            description,
            dueDate,
            groupId,
            completed
        });
        
        return successResponse(
            res,
            "Task updated successfully",
            category,
            { task: updatedTask }
        );
        
    } catch (error: any) {
        console.error('Error updating task:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Insufficient privileges') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "You don't have permission to update this task",
                HttpStatus.FORBIDDEN
            );
        }


        if (error.message === 'Invalid Update') {
            return errorResponse(
                res,
                category,
                ErrorCode.VALIDATION_ERROR,
                "Child task must inherited parent's group properties",
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

export const deleteTask = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to delete the task
        const deleted = await TaskModel.deleteTask(taskId, userId);
        
        return successResponse(
            res,
            "Task deleted successfully",
            category,
            { deleted }
        );
        
    } catch (error: any) {
        console.error('Error deleting task:', error);
        const category = res.locals.apiCategory;
    
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
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

export const getTaskComments = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to get task comments
        const comments = await TaskModel.getTaskComments(taskId, userId);
        
        return successResponse(
            res,
            "Comments retrieved successfully",
            category,
            { comments }
        );
        
    } catch (error: any) {
        console.error('Error retrieving task comments:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
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

export const addTaskComment = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        if (!req.body) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Missing request body",
                HttpStatus.BAD_REQUEST
            );
        }
        
        const { content } = req.body;
        if (!content || content.trim() === '') {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Comment content cannot be empty",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to add the comment
        const comment = await TaskModel.addTaskComment(
            taskId,
            userId,
            content
        );
        
        return successResponse(
            res,
            "Comment added successfully",
            category,
            { comment },
            HttpStatus.CREATED
        );
        
    } catch (error: any) {
        console.error('Error adding comment to task:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
                HttpStatus.NOT_FOUND
            );
        }
        
        if (error.message === 'Insufficient privileges to comment on this task') {
            return errorResponse(
                res,
                category,
                ErrorCode.PERMISSION_ERROR,
                "Insufficient privileges",
                HttpStatus.FORBIDDEN
            );
        }
        
        if (error.message === 'Invalid Input') {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid comment content",
                HttpStatus.BAD_REQUEST
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

export const deleteTaskComment = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const targetId = parseInt(req.params.commentId);
        const category = res.locals.apiCategory;
        
        if (isNaN(targetId) || targetId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid comment ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to delete the comment
        const success = await TaskModel.deleteTaskComment(
            targetId,
            userId
        );
        
        return successResponse(
            res,
            "Comment deleted successfully",
            category,
            { targetId }
        );
        
    } catch (error: any) {
        console.error('Error deleting comment:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Comment not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Comment not found",
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
        
        if (error.message === 'Failed to delete comment') {
            return errorResponse(
                res,
                category,
                ErrorCode.SERVER_ERROR,
                "Failed to delete comment",
                HttpStatus.INTERNAL_SERVER_ERROR
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

export const getAssigneesAndWatchers = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.id);
        const category = res.locals.apiCategory;
        
        if (isNaN(taskId) || taskId <= 0) {
            return errorResponse(
                res,
                category,
                ErrorCode.INVALID_FORMAT,
                "Invalid task ID",
                HttpStatus.BAD_REQUEST
            );
        }
        
        // Call the model function to get assigned users and watchers
        const users = await TaskModel.getAssigneesAndWatchers(taskId, userId);
        
        return successResponse(
            res,
            "Task users retrieved successfully",
            category,
            {
                task: {
                    id: taskId,
                    assigned: users.assigned,
                    watchers: users.watchers
                }
            }
        );
        
    } catch (error: any) {
        console.error('Error retrieving task users:', error);
        const category = res.locals.apiCategory;
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return errorResponse(
                res,
                category,
                ErrorCode.NOT_FOUND,
                "Task not found",
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

export const createAssignOrWatchTask = (type: 'assigned' | 'watcher') => {
    return async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.user!.userId;
            const taskId = parseInt(req.params.id);
            const targetUserId = parseInt(req.params.targetUserId);
            const category = res.locals.apiCategory;

            if (isNaN(taskId) || taskId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "Invalid ID input",
                    HttpStatus.BAD_REQUEST
                );
            }

            // Call the model function to assign or watch the task
            const success = await TaskModel.assignOrWatchTask(
                taskId,
                targetUserId,
                userId,
                type
            );
            
            return successResponse(
                res,
                `User successfully added as ${type} to task`,
                category,
                { success }
            );
            
        } catch (error: any) {
            console.error(`Error adding user as ${type} to task:`, error);
            const category = res.locals.apiCategory;
            
            // Handle specific errors from the model
            if (error.message === 'Task not found') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.NOT_FOUND,
                    "Task not found",
                    HttpStatus.NOT_FOUND
                );
            }
            
            if (error.message === 'User to add does not exist') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.NOT_FOUND,
                    "User not found",
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
            
            if (error.message === 'Target user must be a member of this group') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.PERMISSION_ERROR,
                    "Target user must be a member of this group",
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
};

export const removeAssignOrWatchTask = (type: 'assigned' | 'watcher') => {
    return async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.user!.userId;
            const taskId = parseInt(req.params.id);
            const targetUserId = parseInt(req.params.targetUserId);
            const category = res.locals.apiCategory;

            if (isNaN(taskId) || taskId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.INVALID_FORMAT,
                    "Invalid ID input",
                    HttpStatus.BAD_REQUEST
                );
            }
            
            // Call the model function to remove the user
            const success = await TaskModel.removeAssignOrWatchTask(
                taskId,
                targetUserId,
                userId,
                type
            );
            
            return successResponse(
                res,
                `User successfully removed as ${type} from task`,
                category,
                { success }
            );
            
        } catch (error: any) {
            console.error(`Error removing user as ${type} from task:`, error);
            const category = res.locals.apiCategory;
            
            // Handle specific errors from the model
            if (error.message === 'Task not found') {
                return errorResponse(
                    res,
                    category,
                    ErrorCode.NOT_FOUND,
                    "Task not found",
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
};