import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// Interface for group creation
interface GroupCreateParams {
  name: string;
  description: string;
  ownerId: number;
}

export interface Group {
  groupId: number;
  name: string;
  description: string | null;
  createdBy: number;
  createdAt: Date;
  role: string; // 'admin' or 'member'
}

export const createGroup = async (params: GroupCreateParams): Promise<Group> => {
  let connection: PoolConnection | undefined;
  
  try {
    connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    // Create the group
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO task_groups (name, description, created_by) 
       VALUES (?, ?, ?)`,
      [params.name, params.description, params.ownerId]
    );
    
    const groupId = result.insertId;
    
    // Add the creator as an admin to the group
    await connection.query(
      `INSERT INTO group_members (group_id, user_id, role) 
       VALUES (?, ?, 'admin')`,
      [groupId, params.ownerId]
    );
    
    // Get the created group information with role
    const [groups] = await connection.query<RowDataPacket[]>(
      `SELECT 
        g.group_id as groupId, 
        g.name, 
        g.description, 
        g.created_by as createdBy, 
        g.created_at as createdAt,
        gm.role
       FROM task_groups g
       JOIN group_members gm ON g.group_id = gm.group_id
       WHERE g.group_id = ? AND gm.user_id = ?`,
      [groupId, params.ownerId]
    );
    
    // Commit the transaction
    await connection.commit();
    
    if (groups.length === 0) {
      throw new Error('Failed to create group');
    }
    
    return groups[0] as Group;
    
  } catch (error) {
    // Rollback transaction on error
    if (connection) {
      await connection.rollback();
    }
    
    // Handle specific errors
    if (error instanceof Error) {
      // Check for duplicate entry error (unique constraint violation)
      if (error.message.includes('Duplicate entry') && error.message.includes('name')) {
        throw new Error('Group name already exists');
      }
    }
    
    // Re-throw the error
    throw error;
  } finally {
    // Release the connection
    if (connection) {
      connection.release();
    }
  }
};

export const deleteGroup = async (groupId: number, userId: number): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      
      // First, check if the group exists
      const [groups] = await connection.query<RowDataPacket[]>(
        `SELECT group_id FROM task_groups WHERE group_id = ?`,
        [groupId]
      );
      
      if (groups.length === 0) {
        throw new Error('Group not found');
      }
      
      // Check if the user is an admin of the group
      const [members] = await connection.query<RowDataPacket[]>(
        `SELECT role FROM group_members 
         WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
        [groupId, userId]
      );
      
      if (members.length === 0) {
        throw new Error('Insufficient privileges');
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Delete the group (cascade will handle related records)
      const [result] = await connection.query<ResultSetHeader>(
        `DELETE FROM task_groups WHERE group_id = ?`,
        [groupId]
      );
      
      // Commit the transaction
      await connection.commit();
      
      return result.affectedRows > 0;
      
    } catch (error) {
      // Rollback transaction if it was started
      if (connection) {
        await connection.rollback();
      }
      
      // Re-throw the error
      throw error;
    } finally {
      // Release the connection
      if (connection) {
        connection.release();
      }
    }
};

export const addUserToGroup = async (
    groupId: number, 
    targetUserId: number, 
    userId: number
  ): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      
      // Check if the group exists
      const [groups] = await connection.query<RowDataPacket[]>(
        `SELECT group_id FROM task_groups WHERE group_id = ?`,
        [groupId]
      );
      
      if (groups.length === 0) {
        throw new Error('Group not found');
      }
      
      // Check if the requesting user is an admin of the group
      const [members] = await connection.query<RowDataPacket[]>(
        `SELECT role FROM group_members 
         WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
        [groupId, userId]
      );
      
      if (members.length === 0) {
        throw new Error('Insufficient privileges');
      }
      
      // Check if the target user exists
      const [users] = await connection.query<RowDataPacket[]>(
        `SELECT user_id FROM users WHERE user_id = ?`,
        [targetUserId]
      );
      
      if (users.length === 0) {
        throw new Error('User not found');
      }
      
      // Check if the user is already in the group
      const [existingMember] = await connection.query<RowDataPacket[]>(
        `SELECT user_id FROM group_members 
         WHERE group_id = ? AND user_id = ?`,
        [groupId, targetUserId]
      );
      
      if (existingMember.length > 0) {
        throw new Error('User already in group');
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Add the user to the group as a member
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO group_members (group_id, user_id, role) 
         VALUES (?, ?, 'member')`,
        [groupId, targetUserId]
      );
      
      // Commit the transaction
      await connection.commit();
      
      return result.affectedRows > 0;
      
    } catch (error) {
      // Rollback transaction if a connection exists
      if (connection) {
        await connection.rollback();
      }
      
      // Re-throw the error
      throw error;
    } finally {
      // Release the connection
      if (connection) {
        connection.release();
      }
    }
};

export const removeUserFromGroup = async (
    groupId: number, 
    targetUserId: number, 
    userId: number
    ): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      
      // Check if the group exists
      const [groups] = await connection.query<RowDataPacket[]>(
        `SELECT group_id, created_by FROM task_groups WHERE group_id = ?`,
        [groupId]
      );
      
      if (groups.length === 0) {
        throw new Error('Group not found');
      }
      
      const groupCreator = groups[0].created_by;
      
      // Check if the requesting user is an admin of the group
      const [members] = await connection.query<RowDataPacket[]>(
        `SELECT role FROM group_members 
         WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
        [groupId, userId]
      );
      
      if (members.length === 0) {
        throw new Error('Insufficient privileges');
      }
      
      // Check if the target user is in the group
      const [targetMember] = await connection.query<RowDataPacket[]>(
        `SELECT user_id FROM group_members 
         WHERE group_id = ? AND user_id = ?`,
        [groupId, targetUserId]
      );
      
      if (targetMember.length === 0) {
        throw new Error('User not found in group');
      }
      
      // Cannot remove the group creator
      if (targetUserId === groupCreator) {
        throw new Error('Insufficient privileges');
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Get all tasks associated with this group
      const [groupTasks] = await connection.query<RowDataPacket[]>(
        `SELECT task_id FROM tasks WHERE group_id = ?`,
        [groupId]
      );
      
      const taskIds = groupTasks.map(task => task.task_id);
      
      // If there are tasks in this group
      if (taskIds.length > 0) {
        // Remove user from assigned tasks in this group
        await connection.query(
          `DELETE FROM task_assigned 
           WHERE user_id = ? AND task_id IN (?)`,
          [targetUserId, taskIds]
        );
        
        // Remove user from watched tasks in this group
        await connection.query(
          `DELETE FROM task_watchers 
           WHERE user_id = ? AND task_id IN (?)`,
          [targetUserId, taskIds]
        );
      }
      
      // Remove the user from the group
      const [result] = await connection.query<ResultSetHeader>(
        `DELETE FROM group_members 
         WHERE group_id = ? AND user_id = ?`,
        [groupId, targetUserId]
      );
      
      // Commit the transaction
      await connection.commit();
      
      return result.affectedRows > 0;
      
    } catch (error) {
      // Rollback transaction if a connection exists
      if (connection) {
        await connection.rollback();
      }
      
      // Re-throw the error
      throw error;
    } finally {
      // Release the connection
      if (connection) {
        connection.release();
      }
    }
};