import { Request, Response } from 'express';
import { pool } from '../config/database';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import * as UserModel from "../models/user"



export const getAvailableGroups = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        const groups = await UserModel.getGroupsByUserId(userId);
        
        return res.status(200).json({
            message: "User groups retrieved successfully",
            groups
        });
        
    } catch (error: any) {
        console.error('Error retrieving user groups:', error);
        
        // Handle specific errors from the model if needed
        if (error.message === 'User not found') {
            return res.status(404).json({
                error: "not_found",
                message: "User not found"
            });
        }
        
        return res.status(500).json({
            error: "server error",
            message: "An unexpected error occurred"
        });
    }
};

export const getAvailableTasks = async (req: Request, res: Response): Promise<Response> => {
    try {
        const userId = req.user!.userId;
        
        // Extract query parameters with defaults
        const { 
            mode = 'personal', 
            dateOption, 
            sortBy = 'dueDate',
            groupOptions: requestGroupOptions = {}
        } = req.body;
        
        // Validate mode
        const validModes = ['personal', 'assigned', 'watching', 'group'];
        if (!validModes.includes(mode)) {
            return res.status(400).json({
                error: "invalid_request",
                message: "Invalid request mode"
            });
        }
        
        // Validate sortBy
        const validSortOptions = ['dueDate', 'dateCreated', 'owner', 'taskId'];
        if (!validSortOptions.includes(sortBy)) {
            return res.status(400).json({
                error: "invalid_request",
                message: "Invalid sort by request"
            });
        }
        
        // Prepare the groupOptions object
        let groupOptions = undefined;
        
        if (mode === 'group') {
            // Validate group mode requirements
            if (!requestGroupOptions || !requestGroupOptions.groupId) {
                return res.status(400).json({
                    error: "invalid_request",
                    message: "Group mode requires group id"
                });
            }
            
            // Create the groupOptions object with the correct structure
            groupOptions = {
                groupId: requestGroupOptions.groupId,
                ownerFilter: requestGroupOptions.ownerFilter,
                assignedFilter: requestGroupOptions.assignedFilter
            };
        }
        
        // Validate date format if provided
        if (dateOption && !/^\d{4}-\d{2}-\d{2}$/.test(dateOption)) {
            return res.status(400).json({
                error: "invalid_request",
                message: "dateOption must be in format 'yyyy-mm-dd'"
            });
        }
        
        // Call the model function to get available tasks
        const tasks = await UserModel.getAvailableTasks(
            userId,
            mode,
            dateOption,
            sortBy,
            groupOptions
        );
        
        return res.status(200).json({
            message: "Tasks retrieved successfully",
            tasks
        });
        
    } catch (error: any) {
        console.error('Error retrieving tasks:', error);
        
        // Handle specific errors from the model
        if (error.message === 'User not found') {
            return res.status(404).json({
                error: "not_found",
                message: "User not found"
            });
        }
        
        if (error.message === 'Group not found') {
            return res.status(404).json({
                error: "not_found",
                message: "Insufficient privileges"
            });
        }
        
        if (error.message === 'User is not a member of this group') {
            return res.status(403).json({
                error: "permission_error",
                message: "You are not a member of this group"
            });
        }
        
        return res.status(500).json({
            error: "server_error",
            message: "An unexpected error occurred"
        });
    }
};