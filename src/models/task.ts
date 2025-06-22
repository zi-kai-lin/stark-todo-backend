// models/task.ts
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { UserBasic } from "./user"



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

export interface TaskWithChildren {
    task: Task;
    children: Task[];
}


export interface TaskComment {
    commentId?: number;
    taskId: number;
    userId: number;
    content: string;
    dateCreated?: Date;
}

export interface CommentWithUser extends TaskComment{

    username: string,

}


export interface TaskAssignedAndWatched {


    assigned: UserBasic[];
    watchers: UserBasic[];


}


interface ParentTaskRow extends RowDataPacket {
    task_id: number;
    owner_id: number;
    group_id: number | null;
}




/* helper function - 查看是否在團裏， admin or member? */
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


/* Helper funciton - 查看使用者 有沒有 指定 task 的  owner/ member（限團）/ admin （限團） 權利
可改進-》 和上面功能有些重疊
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
        
        return false;
        
    } catch (error) {
        console.error('Error checking task privilege:', error);
        return false;
    } finally {
        if (connection) await connection.release();
    }
};


/* 
    新增任務，
    三個 case 
    1. 增加 parent task （沒有指定 groupId)
    2. 增加 parent task （有指定 groupId) （加到團裏面，需要看 你是不是 團裏面的成員之一)
    3. 新增 子任務 (child task) 
    這樣分是因爲，如果你不在同一個團裏面，你是沒有 permission 隨便在別人的 parent task 下面 新增 child task

    新增的 子任務 會遺傳 parent task 的 groupId 
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
      



        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, description, due_date, owner_id, group_id, 
                    parent_id, completed, date_created
            FROM tasks WHERE task_id = ?`,
            [result.insertId]
        );

        const task = taskRows[0];
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


    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) await connection.release();
    }
};


/* 
    更改任務，
    主軸在於 任務狀態 & 團隊 跟新

    子任務跟新後 如果同個 parent 其他子任務都爲完成時， parent 跟新成 完成 Vice versa
    相反的 如果以完成 parent 和 子任務被跟新成未完成， 也同樣互相跟新


    parent 團隊跟新後， 子任務也必須同樣跟新。 子任務本身無法跟新 自己的 group


*/
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
            `SELECT task_id, owner_id, group_id, description, due_date, completed, parent_id, date_created
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
            throw new Error('Insufficient privileges');
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
                    throw new Error('Insufficient privileges');
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
            
            //  If completion status is changing (in either direction), cascade to all child tasks
            if (isCompletionUpdated) {
                // Set all child tasks to the same completion status as the parent
                await connection.execute(
                    `UPDATE tasks SET completed = ? WHERE parent_id = ?`,
                    [updateData.completed ? 1 : 0, taskId]
                );
            }
        }
        //  Handle child task completion status updates affecting parent
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
                    parent_id, completed, date_created
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
        if (connection) await connection.release();
    }
};



/* 
    刪除任務

    刪除子任務 或者是 parent 任務

    parent : 相關子任務會被刪除
    子任務： 刪除子任務後 查看其他子任務的 status, 如果都完成， 那 parent 也完成


*/
export const deleteTask = async (
    taskId: number,
    userId: number
): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id, parent_id, completed
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        const isChildTask = task.parent_id !== null;
        
        // Check if owner
        const isOwner = await checkTaskPrivilege('owner', taskId, userId);
        
        if (!isOwner) {
            // Check if member
            const isMember = await checkTaskPrivilege('member', taskId, userId);
            
            if (!isMember) {
                throw new Error('Insufficient privileges');
            }
        }
        
        // If this is a parent task, delete all child tasks first
        if (!isChildTask) {

            // Delete the task foreign key cascade will handle deletion
            await connection.execute(
                `DELETE FROM tasks WHERE task_id = ?`,
                [taskId]
            );
        } 
        // If child task, check if remaining child task of parent is still have incompleted
        else {
            // Delete the child task
            await connection.execute(
                `DELETE FROM tasks WHERE task_id = ?`,
                [taskId]
            );
            
            // Check remaining siblings' completion status
            const [siblingRows] = await connection.execute<RowDataPacket[]>(
                `SELECT COUNT(*) as total, SUM(completed = 1) as completed
                 FROM tasks
                 WHERE parent_id = ?`,
                [task.parent_id]
            );
            
            const siblings = siblingRows[0];
            
            // If no siblings left or all remaining siblings are completed, mark parent as completed
            if (siblings.total === 0 || (siblings.total > 0 && siblings.total === siblings.completed)) {
                await connection.execute(
                    `UPDATE tasks SET completed = 1 WHERE task_id = ?`,
                    [task.parent_id]
                );
            }
            // If there are uncompleted siblings, ensure parent is marked as uncompleted
            else if (siblings.completed < siblings.total) {
                await connection.execute(
                    `UPDATE tasks SET completed = 0 WHERE task_id = ?`,
                    [task.parent_id]
                );
            }
        }
        
        await connection.commit();
        return true;
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting task:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};



  
/**
 * Get a task by ID with all its child tasks
 * @param taskId - ID of the task to retrieve
 * @param userId - ID of the user requesting the task
 * @returns Promise<TaskWithChildren> - Task with its children or null if not found/no permission
 */
export const getTaskById = async (
    taskId: number,
    userId: number
): Promise<TaskWithChildren> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, description, due_date, owner_id, group_id, 
                    parent_id, completed, date_created
            FROM tasks
            WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const taskData = taskRows[0];
        
        // Check if user has permission to view this task
        const isOwner = taskData.owner_id === userId;
        let hasPermission = isOwner;
        
        // If not owner, check if user is a member of the task's group
        if (!hasPermission && taskData.group_id) {
            const isMember = await isGroupMember(taskData.group_id, userId);
            hasPermission = isMember;
        }
        
        if (!hasPermission) {
            throw new Error('Insufficient privileges');
        }
        
        // Map database row to Task interface
        const task: Task = {
            taskId: taskData.task_id,
            description: taskData.description,
            dueDate: taskData.due_date,
            ownerId: taskData.owner_id,
            groupId: taskData.group_id,
            parentId: taskData.parent_id,
            completed: !!taskData.completed,
            dateCreated: taskData.date_created
        };
        
        // Get all child tasks (if any)
        const [childRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, description, due_date, owner_id, group_id, 
                    parent_id, completed, date_created
            FROM tasks
            WHERE parent_id = ?
            ORDER BY date_created ASC`,  // Order by creation date, oldest first
            [taskId]
        );
        
        // Map child rows to Task interface
        const children: Task[] = childRows.map(row => ({
            taskId: row.task_id,
            description: row.description,
            dueDate: row.due_date,
            ownerId: row.owner_id,
            groupId: row.group_id,
            parentId: row.parent_id,
            completed: !!row.completed,
            dateCreated: row.date_created
        }));
        
        return {
            task,
            children
        };
        
    } catch (error) {
        console.error('Error retrieving task:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};


export const addTaskComment = async (
    taskId: number,
    userId: number,
    content: string
): Promise<TaskComment> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id 
             FROM tasks 
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        
        // Check if user has permission to comment (owner or member)
        const isOwner = await checkTaskPrivilege('owner', taskId, userId);
        
        if (!isOwner) {
            const isMember = await checkTaskPrivilege('member', taskId, userId);
            
            if (!isMember) {
                throw new Error('Insufficient privileges to comment on this task');
            }
        }
        
        // Validate comment content
        if (!content || content.trim() === '') {
            throw new Error('Invalid Input');
        }
        
        // Insert the comment
        const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO task_comments (task_id, user_id, content) 
             VALUES (?, ?, ?)`,
            [taskId, userId, content.trim()]
        );
        
        await connection.commit();
        
        const [commentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT comment_id, task_id, user_id, content, created_at 
            FROM task_comments WHERE comment_id = ?`,
            [result.insertId]
        );

        const comment = commentRows[0];
        return {
            commentId: comment.comment_id,
            taskId: comment.task_id,
            userId: comment.user_id,
            content: comment.content,
            dateCreated: comment.created_at  
        };
        
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};


export const deleteTaskComment = async (
    commentId: number,
    userId: number
): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Check if comment exists and get related task info
        const [commentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT c.comment_id, c.task_id, c.user_id, t.owner_id, t.group_id
             FROM task_comments c
             JOIN tasks t ON c.task_id = t.task_id
             WHERE c.comment_id = ?`,
            [commentId]
        );
        
        if (commentRows.length === 0) {
            throw new Error('Comment not found');
        }
        
        const comment = commentRows[0];
        
        /* Comment owner can delete own comment */
        /* Task owner can delete any comment under their task */
        /* Group admin can delete any comment inside the group  */

        const isCommentCreator = comment.user_id === userId;
        let hasPermission = isCommentCreator;
        
        if (!hasPermission) {
            // Check if user is the task owner
            const isTaskOwner = comment.owner_id === userId;
            hasPermission = isTaskOwner;
            
            // If not task owner, check if user is a group admin (if task is in a group)
            if (!hasPermission && comment.group_id) {
                const isAdmin = await isGroupMember(comment.group_id, userId, true);
                hasPermission = isAdmin;
            }
        }
        
        if (!hasPermission) {
            throw new Error('Insufficient privileges to delete this comment');
        }
        
        // Delete the comment
        const [result] = await connection.execute<ResultSetHeader>(
            `DELETE FROM task_comments WHERE comment_id = ?`,
            [commentId]
        );
        
        if (result.affectedRows === 0) {
            throw new Error('Failed to delete comment');
        }
        
        await connection.commit();
        return true;
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting task comment:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};

export const getTaskComments = async (
    taskId: number,
    userId: number
): Promise<CommentWithUser[]> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        
        // Check if user has permission to view comments (owner or member)
        const isOwner = task.owner_id === userId;
        let hasPermission = isOwner;
        
        // If not owner, check if user is a member of the task's group
        if (!hasPermission && task.group_id) {
            const isMember = await isGroupMember(task.group_id, userId);
            hasPermission = isMember;
        }
        
        if (!hasPermission) {
            throw new Error('Insufficient privileges');
        }
        
        // Get all comments for this task including username
        const [commentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT c.comment_id, c.task_id, c.user_id, c.content, c.created_at as date_created, u.username
             FROM task_comments c
             JOIN users u ON c.user_id = u.user_id
             WHERE c.task_id = ?
             ORDER BY c.created_at ASC`,
            [taskId]
        );
        
        // Map rows to CommentWithUser interface
        const comments: CommentWithUser[] = commentRows.map(row => ({
            commentId: row.comment_id,
            taskId: row.task_id,
            userId: row.user_id,
            content: row.content,
            dateCreated: row.date_created,
            username: row.username
        }));
        
        return comments;
        
    } catch (error) {
        console.error('Error retrieving task comments:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};


export const getAssigneesAndWatchers = async ( taskId: number, userId: number) : Promise<TaskAssignedAndWatched> =>{


    let connection: PoolConnection | undefined;
        
        try {
            connection = await pool.getConnection();
            
            // Check if task exists
            const [taskRows] = await connection.execute<RowDataPacket[]>(
                `SELECT task_id, owner_id, group_id
                FROM tasks
                WHERE task_id = ?`,
                [taskId]
            );
            
            if (taskRows.length === 0) {
                throw new Error('Task not found');
            }
            
            const task = taskRows[0];
            
            // Check if user has permission to view task users (owner or member)
            const isOwner = task.owner_id === userId;
            let hasPermission = isOwner;
            
            // If not owner, check if user is a member of the task's group
            if (!hasPermission && task.group_id) {
                const isMember = await isGroupMember(task.group_id, userId);
                hasPermission = isMember;
            }
            
            if (!hasPermission) {
                throw new Error('Insufficient privileges');
            }
            
            // Get assigned users with usernames
            const [assignedRows] = await connection.execute<RowDataPacket[]>(
                `SELECT t.user_id, u.username
                FROM task_assigned t
                JOIN users u ON t.user_id = u.user_id
                WHERE t.task_id = ?`,
                [taskId]
            );
            
            // Get watchers with usernames
            const [watcherRows] = await connection.execute<RowDataPacket[]>(
                `SELECT t.user_id, u.username
                FROM task_watchers t
                JOIN users u ON t.user_id = u.user_id
                WHERE t.task_id = ?`,
                [taskId]
            );
            
            // Map to UserBasic objects
            const assigned: UserBasic[] = assignedRows.map(row => ({
                userId: row.user_id,
                username: row.username
            }));
            
            const watchers: UserBasic[] = watcherRows.map(row => ({
                userId: row.user_id,
                username: row.username
            }));
            
            return { assigned, watchers };
            
        } catch (error) {
            console.error('Error retrieving task users:', error);
            throw error;
        } finally {
            if (connection) await connection.release();
        }


}


export const assignOrWatchTask = async (
    taskId: number,
    targetUserId: number,
    currentUserId: number,
    type: 'assigned' | 'watcher'
): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id, parent_id
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        
        // Determine if self-addition or adding others
        const isSelfAddition = targetUserId === currentUserId;
        
        if (isSelfAddition) {
            // For self-addition, check if user is owner or member of the group
            const isOwner = task.owner_id === currentUserId;
            let hasPermission = isOwner;
            
            if (!hasPermission && task.group_id) {
                const isMember = await isGroupMember(task.group_id, currentUserId);
                hasPermission = isMember;
            }
            
            if (!hasPermission) {
                throw new Error(`Insufficient privileges`);
            }
        } else {
            // Adding other require to be owner, parent task owner, or group admin
            const isOwner = task.owner_id === currentUserId;
            let hasPermission = isOwner;
            
            // Check if user is owner of parent task (if this is a subtask)
            if (!hasPermission && task.parent_id) {
                const [parentRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT owner_id FROM tasks WHERE task_id = ?`,
                    [task.parent_id]
                );
                
                if (parentRows.length > 0) {
                    hasPermission = parentRows[0].owner_id === currentUserId;
                }
            }
            
            // Check if user is admin of the group (if task belongs to a group)
            if (!hasPermission && task.group_id) {
                const isAdmin = await isGroupMember(task.group_id, currentUserId, true);
                hasPermission = isAdmin;
            }
            
            if (!hasPermission) {
                throw new Error(`Insufficient privileges`);
            }
            
            // Check if the target user exists
            const [userRows] = await connection.execute<RowDataPacket[]>(
                `SELECT user_id FROM users WHERE user_id = ?`,
                [targetUserId]
            );
            
            if (userRows.length === 0) {
                throw new Error('User to add does not exist');
            }
            
            // If task is in a group, verify the target user is a member of that group
            if (task.group_id) {
                const isMember = await isGroupMember(task.group_id, targetUserId);
                
                if (!isMember) {
                    throw new Error(`Target user must be a member of this group`);
                }
            }
        }
        
        // Determine table name based on type
        const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
        
        // Check if the user is already in the specified role for this task
        const [existingRows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1 FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
            [taskId, targetUserId]
        );
        
        if (existingRows.length > 0) {
            // User already has this role, treat as success but no action needed
            await connection.commit();
            return true;
        }
        
        // Add the user to the specified role
        await connection.execute(
            `INSERT INTO ${tableName} (task_id, user_id) VALUES (?, ?)`,
            [taskId, targetUserId]
        );
        
        await connection.commit();
        return true;
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error adding user as ${type} to task:`, error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};


export const removeAssignOrWatchTask = async (
    taskId: number,
    targetUserId: number,
    currentUserId: number,
    type: 'assigned' | 'watcher'
): Promise<boolean> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Check if task exists
        const [taskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, owner_id, group_id, parent_id
             FROM tasks
             WHERE task_id = ?`,
            [taskId]
        );
        
        if (taskRows.length === 0) {
            throw new Error('Task not found');
        }
        
        const task = taskRows[0];
        
        // Determine table name based on type
        const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
        
        // Check if the association exists
        const [existingRows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1 FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
            [taskId, targetUserId]
        );
        
        if (existingRows.length === 0) {
            // User doesn't have this role, treat as success but no action needed
            await connection.commit();
            return true;
        }
        
        // Determine if self-removal or removing others
        const isSelfRemoval = targetUserId === currentUserId;
        
        if (!isSelfRemoval) {
            // For removing others, need to be owner, parent owner, or group admin
            const isOwner = task.owner_id === currentUserId;
            let hasPermission = isOwner;
            
            // Check if user is owner of parent task (if this is a subtask)
            if (!hasPermission && task.parent_id) {
                const [parentRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT owner_id FROM tasks WHERE task_id = ?`,
                    [task.parent_id]
                );
                
                if (parentRows.length > 0) {
                    hasPermission = parentRows[0].owner_id === currentUserId;
                }
            }
            
            // Check if user is admin of the group (if task belongs to a group)
            if (!hasPermission && task.group_id) {
                const isAdmin = await isGroupMember(task.group_id, currentUserId, true);
                hasPermission = isAdmin;
            }
            
            if (!hasPermission) {
                throw new Error(`Insufficient privileges`);
            }
        }
        
        // Remove the user from the specified role
        await connection.execute(
            `DELETE FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
            [taskId, targetUserId]
        );
        
        await connection.commit();
        return true;
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error removing user as ${type} from task:`, error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};