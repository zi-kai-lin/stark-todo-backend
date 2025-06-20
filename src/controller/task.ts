import { Request, Response } from 'express';
import { pool } from '../config/database';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import * as TaskModel from "../models/task"

export const getTaskById = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (!taskId) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid task ID"
            });
        }
        
        // Call the model function to get the task with children
        const taskWithChildren = await TaskModel.getTaskById(taskId, userId);
        
        return res.status(200).json({
            message: "Task retrieved successfully",
            task: taskWithChildren
        });
        
    } catch (error: any) {
        console.error('Error retrieving task:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};

export const createTask = async (req: Request, res: Response): Promise<Response> => {
    let connection: PoolConnection | undefined;
    
    try {
        const userId = req.user!.userId;

        if (!req.body) {
            return res.status(400).json({
              error: "invalid request format",
              message: "Missing request body"
            });
          }


        const { description, dueDate, groupId, parentId } = req.body;
        if (description === undefined || description.trim() === '') {
            return res.status(400).json({
            error: "invalid request format",
            message: "Missing task description"
            });
        }
        const task = await TaskModel.createTask({
            description,
            dueDate: dueDate || null,
            ownerId: userId,
            groupId: groupId || null,
            parentId: parentId || null,
            completed: false
          });
        
        return res.status(201).json({
            message: "Task created successfully",
            task
        });
        
    } catch (error: any) {
        console.error('Error creating task:', error);
    
        // Handle specific errors from the model
        if (error.message === 'Parent task does not exist') {
          return res.status(400).json({
            error: "invalid request",
            message: "The specified parent task does not exist"
          });
        }
        
        if (error.message === 'Insufficient privileges') {
          return res.status(403).json({
            error: "permission error",
            message: "Insufficient privileges"
          });
        }

        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
          });
    }
};

export const updateTask = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        // Validate taskId
        if (isNaN(taskId)) {
            return res.status(400).json({
                error: "invalid_request",
                message: "Invalid task ID"
            });
        }
        
        // Validate body exists
        if (!req.body) {
            return res.status(400).json({
                error: "invalid_request",
                message: "Missing request body"
            });
        }
        
        // Extract update fields
        const { description, dueDate, groupId, completed } = req.body;
        
        // Ensure at least one field is being updated
        if (description === undefined && dueDate === undefined && 
            groupId === undefined && completed === undefined) {
            return res.status(400).json({
                error: "invalid_request",
                message: "No update fields provided"
            });
        }
        
        // Validate description if provided
        if (description !== undefined && (typeof description !== 'string' || description.trim() === '')) {
            return res.status(400).json({
                error: "invalid_request",
                message: "Task description must be a non-empty string"
            });
        }
        
        // Call the model function to update the task
        const updatedTask = await TaskModel.updateTask(taskId, userId, {
            description,
            dueDate,
            groupId,
            completed
        });
        
        return res.status(200).json({
            message: "Task updated successfully",
            task: updatedTask
        });
        
    } catch (error: any) {
        console.error('Error updating task:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges') {
            return res.status(403).json({
                error: "forbidden",
                message: "You don't have permission to update this task"
            });
        }
        
        if (error.message === 'Not in specified group') {
            return res.status(403).json({
                error: "forbidden",
                message: "You must be a member of the group to move this task to it"
            });
        }
        
        return res.status(500).json({
            error: "server_error",
            message: "An unexpected error occurred"
        });
    }
};

export const deleteTask = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (!taskId) {
            return res.status(400).json({
                error: "invalid request",
                message: "Invalid task ID"
            });
        }
        
        // Call the model function to delete the task
        const success = await TaskModel.deleteTask(taskId, userId);
        
        return res.status(200).json({
            message: "Task deleted successfully",
            taskId
        });
        
    } catch (error: any) {
        console.error('Error deleting task:', error);
    
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }

        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};

export const getTaskComments = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (!taskId) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid task ID"
            });
        }
        
        // Call the model function to get task comments
        const comments = await TaskModel.getTaskComments(taskId, userId);
        
        return res.status(200).json({
            message: "Comments retrieved successfully",
            comments
        });
        
    } catch (error: any) {
        console.error('Error retrieving task comments:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};

export const addTaskComment = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (!taskId) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid task ID"
            });
        }
        
        if (!req.body) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Missing request body"
            });
        }
        
        const { content } = req.body;
        if (!content || content.trim() === '') {
            return res.status(400).json({
                error: "invalid request format",
                message: "Comment content cannot be empty"
            });
        }
        
        // Call the model function to add the comment
        const comment = await TaskModel.addTaskComment(
            taskId,
            userId,
            content
        );
        
        return res.status(201).json({
            message: "Comment added successfully",
            comment
        });
        
    } catch (error: any) {
        console.error('Error adding comment to task:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges to comment on this task') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }
        
        if (error.message === 'Invalid Input') {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid comment content"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};


export const deleteTaskComment = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const commentId = parseInt(req.params.commentId);
        
        if (!commentId) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid comment ID"
            });
        }
        
        // Call the model function to delete the comment
        const success = await TaskModel.deleteTaskComment(
            commentId,
            userId
        );
        
        return res.status(200).json({
            message: "Comment deleted successfully",
            commentId
        });
        
    } catch (error: any) {
        console.error('Error deleting comment:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Comment not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Comment not found"
            });
        }
        
        if (error.message === 'Insufficient privileges to delete this comment') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }
        
        if (error.message === 'Failed to delete comment') {
            return res.status(500).json({
                error: "server error",
                message: "Failed to delete comment"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};


export const getWatcherAndAssigned = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (!taskId) {
            return res.status(400).json({
                error: "invalid request format",
                message: "Invalid task ID"
            });
        }
        
        // Call the model function to get assigned users and watchers
        const users = await TaskModel.getAssignedAndWatched(taskId, userId);
        
        return res.status(200).json({
            message: "Task users retrieved successfully",
            task: {
                id: taskId,
                assigned: users.assigned,
                watchers: users.watchers
            }
        });
        
    } catch (error: any) {
        console.error('Error retrieving task users:', error);
        
        // Handle specific errors from the model
        if (error.message === 'Task not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Task not found"
            });
        }
        
        if (error.message === 'Insufficient privileges') {
            return res.status(403).json({
                error: "permission error",
                message: "Insufficient privileges"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};

export const createAssignOrWatchTask = (type: 'assigned' | 'watcher') => {
    return async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.user!.userId;
            const taskId = parseInt(req.params.taskId);
            
            if (!taskId) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Invalid task ID"
                });
            }
            
            if (!req.body) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Missing request body"
                });
            }
            
            const { targetUserId } = req.body;
            if (!targetUserId) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Target user ID is required"
                });
            }
            
            // Call the model function to assign or watch the task
            const success = await TaskModel.assignOrWatchTask(
                taskId,
                parseInt(targetUserId),
                userId,
                type
            );
            
            return res.status(200).json({
                message: `User successfully added as ${type} to task`,
                success
            });
            
        } catch (error: any) {
            console.error(`Error adding user as ${type} to task:`, error);
            
            // Handle specific errors from the model
            if (error.message === 'Task not found') {
                return res.status(404).json({
                    error: "not_found",
                    message: "Task not found"
                });
            }
            
            if (error.message === 'User to add does not exist') {
                return res.status(404).json({
                    error: "not_found",
                    message: "User not found"
                });
            }
            
            if (error.message === 'Insufficient privileges') {
                return res.status(403).json({
                    error: "permission error",
                    message: "Insufficient privileges"
                });
            }
            
            if (error.message === 'Target user must be a member of this group') {
                return res.status(403).json({
                    error: "permission error",
                    message: "Target user must be a member of this group"
                });
            }
            
            return res.status(500).json({
                error: "server error",
                message: "An unexpected error occurred"
            });
        }
    };
};


export const removeAssignOrWatchTask = (type: 'assigned' | 'watcher') => {
    return async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.user!.userId;
            const taskId = parseInt(req.params.taskId);
            
            if (!taskId) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Invalid task ID"
                });
            }
            
            if (!req.body) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Missing request body"
                });
            }
            
            const { targetUserId } = req.body;
            if (!targetUserId) {
                return res.status(400).json({
                    error: "invalid request format",
                    message: "Target user ID is required"
                });
            }
            
            // Call the model function to remove the user
            const success = await TaskModel.removeAssignOrWatchTask(
                taskId,
                parseInt(targetUserId),
                userId,
                type
            );
            
            return res.status(200).json({
                message: `User successfully removed as ${type} from task`,
                success
            });
            
        } catch (error: any) {
            console.error(`Error removing user as ${type} from task:`, error);
            
            // Handle specific errors from the model
            if (error.message === 'Task not found') {
                return res.status(404).json({
                    error: "not_found",
                    message: "Task not found"
                });
            }
            
            if (error.message === 'Insufficient privileges') {
                return res.status(403).json({
                    error: "permission error",
                    message: "Insufficient privileges"
                });
            }
            
            return res.status(500).json({
                error: "server error",
                message: "An unexpected error occurred"
            });
        }
    };
};


