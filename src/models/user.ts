
import { pool } from '../config/database';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Task, TaskWithChildren } from './task';
import { Group } from './group';



export interface UserBasic{

    userId: number,
    username: string


}




export const getGroupsByUserId = async (userId: number): Promise<Group[]> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        
        // Verify user exists
        const [userRows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1 FROM users WHERE user_id = ?`,
            [userId]
        );
        
        if (userRows.length === 0) {
            throw new Error('User not found');
        }
        
        // Get all groups the user is a member of
        const [groupRows] = await connection.execute<RowDataPacket[]>(
            `SELECT g.group_id, g.name, g.description, g.created_by, 
                    g.created_at, gm.role
             FROM task_groups g
             JOIN group_members gm ON g.group_id = gm.group_id
             WHERE gm.user_id = ?
             ORDER BY g.created_at DESC`,
            [userId]
        );
        
        // Map rows to Group interface
        const groups: Group[] = groupRows.map(row => ({
            groupId: row.group_id,
            name: row.name,
            description: row.description,
            createdBy: row.created_by,
            createdAt: row.created_at,
            role: row.role
        }));
        
        return groups;
        
    } catch (error) {
        console.error('Error retrieving user groups:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};


export const getAvailableTasks = async (
    userId: number,
    mode: 'personal' | 'assigned' | 'watching' | 'group',
    dateOption?: string,
    sortBy: 'dueDate' | 'dateCreated' | 'owner' | 'taskId' = 'dueDate',
    groupOptions?: { 
        groupId: number, 
        ownerFilter?: number,  // Optional owner filter
        assignedFilter?: boolean  // Optional assigned filter, defaults to false
    }
): Promise<TaskWithChildren[]> => {
    let connection: PoolConnection | undefined;
    
    try {
        connection = await pool.getConnection();
        
        // Verify user exists
        const [userRows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1 FROM users WHERE user_id = ?`,
            [userId]
        );
        
        if (userRows.length === 0) {
            throw new Error('User not found');
        }
        
        // Build the base query with appropriate joins based on mode
        let baseQuery = '';
        const queryParams: any[] = [];
        
        // Only select parent tasks (where parent_id is NULL)
        // We'll fetch children separately for each parent
        
        if (mode === 'personal') {
            baseQuery = `
                SELECT t.task_id, t.description, t.due_date, t.owner_id, 
                       t.group_id, t.parent_id, t.completed, t.date_created
                FROM tasks t
                WHERE t.owner_id = ? AND t.parent_id IS NULL
            `;
            queryParams.push(userId);
        } 
        else if (mode === 'assigned') {
            baseQuery = `
                SELECT t.task_id, t.description, t.due_date, t.owner_id, 
                       t.group_id, t.parent_id, t.completed, t.date_created
                FROM tasks t
                JOIN task_assigned ta ON t.task_id = ta.task_id
                WHERE ta.user_id = ? AND t.parent_id IS NULL
            `;
            queryParams.push(userId);
        }
        else if (mode === 'watching') {
            baseQuery = `
                SELECT t.task_id, t.description, t.due_date, t.owner_id, 
                       t.group_id, t.parent_id, t.completed, t.date_created
                FROM tasks t
                JOIN task_watchers tw ON t.task_id = tw.task_id
                WHERE tw.user_id = ? AND t.parent_id IS NULL
            `;
            queryParams.push(userId);
        }
        else if (mode === 'group') {
            // Validate group mode requirements
            if (!groupOptions || !groupOptions.groupId) {
                throw new Error('Group ID is required for group mode');
            }
            
            // Check if the group exists
            const [groupRows] = await connection.execute<RowDataPacket[]>(
                `SELECT 1 FROM task_groups WHERE group_id = ?`,
                [groupOptions.groupId]
            );
            
            if (groupRows.length === 0) {
                throw new Error('Group not found');
            }
            
            // Check if user is a member of the group
            const [memberRows] = await connection.execute<RowDataPacket[]>(
                `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`,
                [groupOptions.groupId, userId]
            );
            
            if (memberRows.length === 0) {
                throw new Error('User is not a member of this group');
            }
            
            // Start with the basic query for group tasks
            if (groupOptions.assignedFilter === true) {
                // If assigned filter is enabled, include task_assigned join
                baseQuery = `
                    SELECT t.task_id, t.description, t.due_date, t.owner_id, 
                           t.group_id, t.parent_id, t.completed, t.date_created
                    FROM tasks t
                    JOIN task_assigned ta ON t.task_id = ta.task_id
                    WHERE t.group_id = ? AND t.parent_id IS NULL AND ta.user_id = ?
                `;
                queryParams.push(groupOptions.groupId, userId);
            } else {
                // Basic group query without assigned filter
                baseQuery = `
                    SELECT t.task_id, t.description, t.due_date, t.owner_id, 
                           t.group_id, t.parent_id, t.completed, t.date_created
                    FROM tasks t
                    WHERE t.group_id = ? AND t.parent_id IS NULL
                `;
                queryParams.push(groupOptions.groupId);
            }
            
            // Add owner filter if specified (after assigned filter)
            if (groupOptions.ownerFilter !== undefined) {
                baseQuery += ` AND t.owner_id = ?`;
                queryParams.push(groupOptions.ownerFilter);
            }
        }
        
        // Add date filter if specified
        if (dateOption) {
            baseQuery += ` AND DATE(t.due_date) = DATE(?)`;
            queryParams.push(dateOption);
        }
        
        // Add ordering based on sortBy parameter
        let orderClause: string;
        switch (sortBy) {
            case 'dueDate':
                orderClause = 'ORDER BY t.due_date ASC';
                break;
            case 'dateCreated':
                orderClause = 'ORDER BY t.date_created DESC';
                break;
            case 'owner':
                orderClause = 'ORDER BY t.owner_id ASC';
                break;
            case 'taskId':
                orderClause = 'ORDER BY t.task_id ASC';
                break;
            default:
                orderClause = 'ORDER BY t.due_date ASC';
        }
        
        baseQuery += ` ${orderClause}`;
        
        // Execute the query to get parent tasks
        const [parentTaskRows] = await connection.execute<RowDataPacket[]>(baseQuery, queryParams);
        
        // Create a list of parent task IDs
        const parentTaskIds = parentTaskRows.map(row => row.task_id);
        
        // If there are no tasks, return an empty array
        if (parentTaskIds.length === 0) {
            return [];
        }
        
        const placeholders = parentTaskIds.map(() => '?').join(',');
        const [allChildRows] = await connection.execute<RowDataPacket[]>(
            `SELECT task_id, description, due_date, owner_id, group_id, 
                    parent_id, completed, date_created
             FROM tasks
             WHERE parent_id IN (${placeholders})
             ORDER BY parent_id, date_created ASC`,
            [...parentTaskIds]
        );
        // Group child tasks by parent_id
        const childTasksByParent: { [parentId: number]: Task[] } = {};
        
        allChildRows.forEach(row => {
            const childTask: Task = {
                taskId: row.task_id,
                description: row.description,
                dueDate: row.due_date,
                ownerId: row.owner_id,
                groupId: row.group_id,
                parentId: row.parent_id,
                completed: !!row.completed,
                dateCreated: row.date_created
            };
            
            if (!childTasksByParent[row.parent_id]) {
                childTasksByParent[row.parent_id] = [];
            }
            
            childTasksByParent[row.parent_id].push(childTask);
        });
        
        // Map parent tasks and add their children
        const tasksWithChildren: TaskWithChildren[] = parentTaskRows.map(row => {
            const parentTask: Task = {
                taskId: row.task_id,
                description: row.description,
                dueDate: row.due_date,
                ownerId: row.owner_id,
                groupId: row.group_id,
                parentId: row.parent_id,
                completed: !!row.completed,
                dateCreated: row.date_created
            };
            
            return {
                task: parentTask,
                children: childTasksByParent[row.task_id] || []
            };
        });
        
        return tasksWithChildren;
        
    } catch (error) {
        console.error('Error retrieving available tasks:', error);
        throw error;
    } finally {
        if (connection) await connection.release();
    }
};