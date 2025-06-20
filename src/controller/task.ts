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

