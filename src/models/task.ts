// models/task.ts
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface Task {
  taskId?: number;
  description: string;
  dueDate?: Date | null;
  ownerId: number;
  groupId?: number | null;
  parentId?: number | null;
  completed?: boolean;
  dateCreated?: Date;
}


interface ParentTaskRow extends RowDataPacket {
    task_id: number;
    owner_id: number;
    group_id: number | null;
}


interface GroupMemberRow extends RowDataPacket {
    role: string;
  }

/**
 * Create a new task
 */
export const createTask = async (taskData: Omit<Task, 'taskId' | 'dateCreated'>): Promise<Task> => {
  let connection: PoolConnection | undefined;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    // Check if parent task exist when parent id is specified within the body
    if (taskData.parentId) {
      const [parentRows] = await connection.execute<ParentTaskRow[]>(
        `SELECT task_id, owner_id, group_id 
         FROM tasks
         WHERE task_id = ?`,
        [taskData.parentId]
      );
      
      if (Array.isArray(parentRows) && parentRows.length === 0) {
        throw new Error('Parent task does not exist');
      }
      
      const parentTask = parentRows[0];
      
      /* If user is the owner of said parent task, subtask permission allowed */
      const isOwner = parentTask.owner_id === taskData.ownerId;
      
    // if user is the not the owner nor within the group of said task
        if (!isOwner && !parentTask.group_id) {
            throw new Error('Insufficient privileges');
        }

      // Parent task is in a group (can add subtask to task that you belong in the groups)
      if (!isOwner && parentTask.group_id) {
        // Check if user is a member in the group
        const [groupMemberRows] = await connection.execute<GroupMemberRow[]>(
          `SELECT role FROM group_members 
           WHERE group_id = ? AND user_id = ?`,
          [parentTask.group_id, taskData.ownerId]
        );
        
        // If not a group member at all, deny permission
        if (Array.isArray(groupMemberRows) && groupMemberRows.length === 0) {
          throw new Error('Insufficient privileges');
        }
        
        // No need to check for admin role anymore - any group member can add subtasks
        
        // Ensure the subtask is in the same group as the parent
        taskData.groupId = parentTask.group_id;
      }
      
     
    }
    
    // Check if user have permission to add task into group (only member privilege required)
    if (taskData.groupId) {
      const [groupRows] = await connection.execute(
        `SELECT 1 FROM group_members 
         WHERE group_id = ? AND user_id = ?`,
        [taskData.groupId, taskData.ownerId]
      );
      
      if (Array.isArray(groupRows) && groupRows.length === 0) {
        throw new Error('Insufficient privileges');
      }
    }
    
    // Insert the task
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO tasks (
        description, 
        due_date, 
        owner_id, 
        group_id, 
        parent_id, 
        completed
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskData.description,
        taskData.dueDate || null,
        taskData.ownerId,
        taskData.groupId || null,
        taskData.parentId || null,
        taskData.completed || false
      ]
    );
    
    await connection.commit();
    
    return {
      ...taskData,
      taskId: result.insertId,
      completed: taskData.completed || false,
      dateCreated: new Date()
    };
    
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.release();
  }
};