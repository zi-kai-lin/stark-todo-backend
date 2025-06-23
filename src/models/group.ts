import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// Interface for group creation
export interface GroupCreateParams {
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

/* 在 task_group table 下 新增一個 自己 (userId)，和 group name & description ， role 爲 admin   */
export const createGroup = async (params: GroupCreateParams): Promise<Group> => {
  let connection: PoolConnection | undefined;
  
  try {
    connection = await pool.getConnection();
    

   // Check if group name already exists
    const [existingGroups] = await connection.execute<RowDataPacket[]>(
      `SELECT group_id FROM task_groups WHERE name = ?`,
      [params.name]
    );
    
    if (existingGroups.length > 0) {
      throw new Error('Group name already exists');
    }



    // Start transaction
    await connection.beginTransaction();
    
    // Create the group
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO task_groups (name, description, created_by) 
       VALUES (?, ?, ?)`,
      [params.name, params.description, params.ownerId]
    );
    
    const groupId = result.insertId;
    
    // Add the creator as an admin to the group
    await connection.execute(
      `INSERT INTO group_members (group_id, user_id, role) 
       VALUES (?, ?, 'admin')`,
      [groupId, params.ownerId]
    );
    
    // Commit the transaction
    await connection.commit();
    
    // Fetch the created group to return actual database timestamps
    const [groups] = await connection.execute<RowDataPacket[]>(
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
    
    if (groups.length === 0) {
      throw new Error('Failed to create group');
    }
    
    return groups[0] as Group;
    
  } catch (error) {

    if (connection) {
      await connection.rollback();
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.release();
    }
  }
};




/* 刪除前先看看 在不在 ， 然後 在看看你是不是 admin 內部 task 會隨着 group 刪除 而刪掉  */

export const deleteGroup = async (groupId: number, userId: number): Promise<boolean> => {
  let connection: PoolConnection | undefined;
  
  try {
      connection = await pool.getConnection();
      
      // Check if the group exists
      const [groups] = await connection.execute<RowDataPacket[]>(
          `SELECT group_id FROM task_groups WHERE group_id = ?`,
          [groupId]
      );
      
      if (groups.length === 0) {
          throw new Error('Group not found');
      }
      
      // Check if the user is an admin of the group
      const [members] = await connection.execute<RowDataPacket[]>(
          `SELECT role FROM group_members 
           WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
          [groupId, userId]
      );
      
      if (members.length === 0) {
          throw new Error('Insufficient privileges');
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Delete the group - CASCADE handles everything
      const [result] = await connection.execute<ResultSetHeader>(
          `DELETE FROM task_groups WHERE group_id = ?`,
          [groupId]
      );
      
      await connection.commit();
      
      return result.affectedRows > 0;
      
  } catch (error) {
      if (connection) {
          await connection.rollback();
      }
      throw error;
  } finally {
      if (connection) {
          await connection.release();
      }
  }
};

/* 看你在不在團裏，如果在， 看你是不是 admin, 在看 target user 在不在 加進來後 爲 普通 member privilege */

export const addUserToGroup = async (
    groupId: number, 
    targetUserId: number, 
    userId: number
  ): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      
      // Check if the group exists
      const [groups] = await connection.execute<RowDataPacket[]>(
        `SELECT group_id FROM task_groups WHERE group_id = ?`,
        [groupId]
      );
      
      if (groups.length === 0) {
        throw new Error('Group not found');
      }
      
      // Check if the requesting user is an admin of the group
      const [members] = await connection.execute<RowDataPacket[]>(
        `SELECT role FROM group_members 
         WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
        [groupId, userId]
      );
      
      if (members.length === 0) {
        throw new Error('Insufficient privileges');
      }
      
      // Check if the target user exists
      const [users] = await connection.execute<RowDataPacket[]>(
        `SELECT user_id FROM users WHERE user_id = ?`,
        [targetUserId]
      );
      
      if (users.length === 0) {
        throw new Error('User not found');
      }
      
      // Check if the user is already in the group
      const [existingMember] = await connection.execute<RowDataPacket[]>(
        `SELECT user_id FROM group_members 
         WHERE group_id = ? AND user_id = ?`,
        [groupId, targetUserId]
      );
      
      if (existingMember.length > 0) {
        throw new Error('User already in group');
      }
      
      await connection.beginTransaction();
      
      // Add the user to the group as a member
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO group_members (group_id, user_id, role) 
         VALUES (?, ?, 'member')`,
        [groupId, targetUserId]
      );
      
      await connection.commit();
      
      return result.affectedRows > 0;
      
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      

      throw error;
    } finally {

      if (connection) {
        await connection.release();
      }
    }
};


/* 看你在不在團裏，如果在， 看你是不是 admin, 在看 target user 在不在, 沒辦法刪除 團隊 擁有者， 刪除相關 任務， 指派，關注， 資料 */
/* 未來更進 =》 應該刪掉 user comment, task delete 應該要遵循 completed 查看 (細節在 Models/task.ts) */

export const removeUserFromGroup = async (
  groupId: number, 
  targetUserId: number, 
  userId: number  
): Promise<boolean> => {
  let connection: PoolConnection | undefined;
  
  try {
      connection = await pool.getConnection();
      
      // Check if the group exists
      const [groups] = await connection.execute<RowDataPacket[]>(
          `SELECT group_id, created_by FROM task_groups WHERE group_id = ?`,
          [groupId]
      );
      
      if (groups.length === 0) {
          throw new Error('Group not found');
      }
      
      const groupCreator = groups[0].created_by;
      
      // Check if the requesting user is an admin of the group
      const [members] = await connection.execute<RowDataPacket[]>(
          `SELECT role FROM group_members 
           WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
          [groupId, userId]
      );
      
      if (members.length === 0) {
          throw new Error('Insufficient privileges');
      }
      
      // Check if the target user is in the group
      const [targetMember] = await connection.execute<RowDataPacket[]>(
          `SELECT user_id FROM group_members 
           WHERE group_id = ? AND user_id = ?`,
          [groupId, targetUserId]
      );
      
      if (targetMember.length === 0) {
          throw new Error('User not found in group');
      }
      
      // Cannot remove the group creator
      if (targetUserId === groupCreator) {
          throw new Error('Cannot remove group creator');
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Get all tasks associated with this group
      const [groupTasks] = await connection.execute<RowDataPacket[]>(
          `SELECT task_id FROM tasks WHERE group_id = ?`,
          [groupId]
      );
      
      const taskIds = groupTasks.map(task => task.task_id);
      
      // Remove user's assignments and watching status from group tasks
      if (taskIds.length > 0) {
          const placeholders = taskIds.map(() => '?').join(',');
          
          // Remove user from assigned tasks in this group
          await connection.execute(
              `DELETE FROM task_assigned 
               WHERE user_id = ? AND task_id IN (${placeholders})`,
              [targetUserId, ...taskIds]  
          );
          
          // Remove user from watched tasks in this group
          await connection.execute(
              `DELETE FROM task_watchers 
               WHERE user_id = ? AND task_id IN (${placeholders})`,
              [targetUserId, ...taskIds]  
          );
      }
      
      // Remove the user from the group
      const [result] = await connection.execute<ResultSetHeader>(
          `DELETE FROM group_members 
           WHERE group_id = ? AND user_id = ?`,
          [groupId, targetUserId]
      );
      
      await connection.commit();
      
      return result.affectedRows > 0;
      
  } catch (error) {
      if (connection) {
          await connection.rollback();
      }
      throw error;
  } finally {
      if (connection) {
          await connection.release();
      }
  }
};