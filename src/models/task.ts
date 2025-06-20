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
 * Check if a user is a member of a specific group
 * @param groupId - ID of the group to check
 * @param userId - ID of the user
 * @param requireAdmin - Whether to check for admin role
 * @returns Promise<boolean> - True if user is a member (or admin if specified)
 */
export const isGroupMember = async (
    groupId: number,
    userId: number,
    requireAdmin: boolean = false
  ): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      
      const query = requireAdmin 
        ? `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'`
        : `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`;
      
      const [rows] = await connection.execute<RowDataPacket[]>(
        query,
        [groupId, userId]
      );
      
      return rows.length > 0;
      
    } catch (error) {
      console.error('Error checking group membership:', error);
      return false;
    } finally {
      if (connection) await connection.release();
    }
};


/**
 * Check if a user has a specific privilege level for a task
 * @param privilegeLevel - Level of privilege to check ("owner", "member", or "admin")
 * @param taskId - ID of the task to check
 * @param userId - ID of the user
 * @returns Promise<boolean> - True if user has the specified privilege level
 */
export const checkTaskPrivilege = async (
    privilegeLevel: 'owner' | 'member' | 'admin',
    taskId: number,
    userId: number
): Promise<boolean> => {
    let connection: PoolConnection | undefined;

    try {
        connection = await pool.getConnection();
        
        // First, get the task details
        const [taskRows] = await connection.execute<RowDataPacket[]>(
        `SELECT task_id, owner_id, group_id
            FROM tasks
            WHERE task_id = ?`,
        [taskId]
        );
        
        // If task doesn't exist, return false
        if (taskRows.length === 0) {
            return false;
        }
        
        const task = taskRows[0];
        
        // Check specific privilege level
        if (privilegeLevel === 'owner') {
            // For owner level, only check if user is the owner
            return task.owner_id === userId;
        } 
        
        // If checking for member or admin, the task must be in a group
        if (!task.group_id) {
            return false;
        }
        
        if (privilegeLevel === 'member') {
            // For member level, just check if they're in the group at all
            const [memberRows] = await connection.execute<RowDataPacket[]>(
                `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`,
                [task.group_id, userId]
            );
            
            return memberRows.length > 0;
        } 
        
        if (privilegeLevel === 'admin') {
            // For admin level, check if user has admin role
            const [adminRows] = await connection.execute<RowDataPacket[]>(
                `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'`,
                [task.group_id, userId]
            );
            
            return adminRows.length > 0;
        }
        
        // This should never happen due to TypeScript type checking
        return false;
        
    } catch (error) {
        console.error('Error checking task privilege:', error);
        return false;
    } finally {
        if (connection) await connection.release();
    }
};


/* Task Creation - Updated to use improved helper function 
ensure that 
child task should inherit parent task group id
aka when parent id is provided, query the parent to get it's group id regardless of subtask group id

*/
export const createTask = async (taskData: Omit<Task, 'taskId' | 'dateCreated'>): Promise<Task> => {
    let connection: PoolConnection | undefined;
    
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      
      // Check if parent task exists when parent id is specified
      if (taskData.parentId) {
        // Get parent task details to verify it exists
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
        
        // Check if user is owner of the parent task or a member of the parent's group
        const isOwner = await checkTaskPrivilege('owner', taskData.parentId, taskData.ownerId);
        
        if (!isOwner) {
          // If not owner, check if user is a member of the group containing the parent task
          const isMember = await checkTaskPrivilege('member', taskData.parentId, taskData.ownerId);
          
          if (!isMember) {
            throw new Error('Insufficient privileges');
          }
        }
        
    
        // Inherit child task with parent task group id, override user input if parent id and group id are both provided
        if (parentTask.group_id !== null) {
          taskData.groupId = parentTask.group_id;
        } else {
          // If parent has no group, child task should have no group
          taskData.groupId = null;
        }
      } 
      // If no parent (this is a parent/standalone task), check group permissions as before
      else if (taskData.groupId) {
        // Check if user is a member of the specified group
        const isMember = await isGroupMember(taskData.groupId, taskData.ownerId);
        
        if (!isMember) {
          throw new Error('Insufficient Privileges');
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



export const updateTask = async (
    taskId: number, 
    userId: number, 
    updateData: Partial<Omit<Task, 'taskId' | 'ownerId' | 'dateCreated'>>
): Promise<Task> => {

    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Determine if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id, description, due_date, completed, status, parent_id, date_created
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        
        // Check if owner
        const isOwner = await checkTaskPrivilege('owner', taskId, userId);
        
        /* check if child task */
        const isChildTask = task.parent_id !== null;
        
        // child task cannot udpate group id
        if (isChildTask && updateData.groupId !== undefined) {
            throw new Error('Sub task group change not allowed');
        }
        
        // Check if task is being updated to another group (when updated groupId is not the same with current group id)
        if (updateData.groupId !== undefined && updateData.groupId !== task.group_id) {
            // If trying to move task between groups or add/remove from a group
            
            /* Owner or admin privilege required for group change of task */
            if (!isOwner) {
                // If not owner, check if user is an admin in the current group
                // (Only admins can move tasks between groups)
                if (task.group_id) {
                    const isAdmin = await checkTaskPrivilege('admin', taskId, userId);
                    if (!isAdmin) {
                        throw new Error('Insufficient privileges');
                    }
                } else {
                    // If task is not in a group and user is not owner, they can't move it
                    throw new Error('Insufficient privileges');
                }
            }
            
            // Verify user is a member of the target group if setting initial group
            if (updateData.groupId !== null) {
                const [newGroupRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT 1 FROM group_members 
                     WHERE group_id = ? AND user_id = ?`,
                    [updateData.groupId, userId]
                );
                
                if (newGroupRows.length === 0) {
                    throw new Error('Insufficient privileges');
                }
            }
        } else {
            // Regular update (not changing groups) - check member privileges
            if (!isOwner) {
                // If not owner, check if user is a member of the task's group
                const isMember = await checkTaskPrivilege('member', taskId, userId);
                
                if (!isMember) {
                    throw new Error('Insufficient privileges: Must be a member of the task group');
                }
            }
        }
        
        // Build update query dynamically based on provided fields
        let updateQuery = 'UPDATE tasks SET ';
        const updateValues = [];
        const updateFields = [];
        
        if (updateData.description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(updateData.description.trim());
        }
        
        if (updateData.dueDate !== undefined) {
            updateFields.push('due_date = ?');
            updateValues.push(updateData.dueDate);
        }
        
        if (updateData.groupId !== undefined) {
            updateFields.push('group_id = ?');
            updateValues.push(updateData.groupId);
        }
        
        if (updateData.completed !== undefined) {
            updateFields.push('completed = ?');
            updateValues.push(updateData.completed ? 1 : 0);
        }
        
        // If no fields to update, return the original task
        if (updateFields.length === 0) {
            return {
                taskId: task.task_id,
                description: task.description,
                dueDate: task.due_date,
                ownerId: task.owner_id,
                groupId: task.group_id,
                parentId: task.parent_id,
                completed: !!task.completed,
                dateCreated: task.date_created
            };
        }
        
        updateQuery += updateFields.join(', ');
        updateQuery += ' WHERE task_id = ?';
        updateValues.push(taskId);
        /* To do, make parent id immutable  */
        const isCompletionUpdated = updateData.completed !== undefined && updateData.completed !== !!task.completed;
        const isGroupUpdated = updateData.groupId !== undefined && updateData.groupId !== task.group_id;

        // Execute the update
        await connection.execute(updateQuery, updateValues);
        
        // After task update, update co
        if (!isChildTask) {
            // This is a parent task - check if we need to cascade updates
            
            // If group is being changed, cascade to all child tasks
            if (isGroupUpdated) {
                await connection.execute(
                    `UPDATE tasks SET group_id = ? WHERE parent_id = ?`,
                    [updateData.groupId, taskId]
                );
            }
            
            // CHANGED: If completion status is changing (in either direction), cascade to all child tasks
            if (isCompletionUpdated) {
                // Set all child tasks to the same completion status as the parent
                await connection.execute(
                    `UPDATE tasks SET completed = ? WHERE parent_id = ?`,
                    [updateData.completed ? 1 : 0, taskId]
                );
            }
        }
        // CHANGED: Handle child task completion status updates affecting parent
        else if (isCompletionUpdated) {
            if (updateData.completed) {
                // Child task marked as completed - check if all siblings are also completed
                const [siblingRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT COUNT(*) as total, SUM(completed = 1) as completed
                     FROM tasks
                     WHERE parent_id = ?`,
                    [task.parent_id]
                );
                
                const siblings = siblingRows[0];
                
                // If all siblings are now completed, update parent task
                if (siblings.total === siblings.completed) {
                    await connection.execute(
                        `UPDATE tasks SET completed = 1 WHERE task_id = ?`,
                        [task.parent_id]
                    );
                }
            } else {
                // Child task marked as uncompleted - parent must also be marked uncompleted
                await connection.execute(
                    `UPDATE tasks SET completed = 0 WHERE task_id = ?`,
                    [task.parent_id]
                );
            }
        }
        
        await connection.commit();
        
        // Fetch the updated task
        const [updatedTaskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, description, due_date, owner_id, group_id, 
                    parent_id, completed, date_created, status
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        const updatedTask = updatedTaskRows[0];
        
        return {
            taskId: updatedTask.task_id,
            description: updatedTask.description,
            dueDate: updatedTask.due_date,
            ownerId: updatedTask.owner_id,
            groupId: updatedTask.group_id,
            parentId: updatedTask.parent_id,
            completed: !!updatedTask.completed,
            dateCreated: updatedTask.date_created
        };
        
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) connection.release();
    }
};