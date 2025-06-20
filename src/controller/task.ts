import { Request, Response } from 'express';
import { pool } from '../config/database';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import * as TaskModel from "../models/task"

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


/**
 * Update an existing task
 */
/**
 * Update an existing task
 */
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

/**
 * Delete a task
 */
export const deleteTask = async (req: Request, res: Response): Promise<Response> => {
    let connection: PoolConnection | undefined;
    
    try {
        const userId = req.user!.userId;
        const taskId = parseInt(req.params.taskId);
        
        if (isNaN(taskId)) {
            return res.status(400).json({
                error: "invalid request",
                message: "Invalid task ID"
            });
        }
        
        connection = await pool.getConnection();
        
        // TODO: Implement permission checking and task deletion
        // For placeholder, return success
        
        return res.status(200).json({
            message: "Task deleted successfully",
            taskId
        });
        
    } catch (error) {
        console.error('Error deleting task:', error);
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    } finally {
        if (connection) {
            await connection.release();
        }
    }
};


