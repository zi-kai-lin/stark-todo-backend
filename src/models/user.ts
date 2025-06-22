
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


/* 
 依據現在的使用者 存取 不同 任務資料

 模式 (mode) ： personal （查看 自己建立的任務）, assigned （查看被指派的 任務）, watching (查看 在關注的 任務), group (查看團體內的 任務 )
 dueDate 日期 (dateOption?): YYYY-MM-DD 格式日期 來節選 任務 dueDate 
 排序 （sortBy) : 可按照 建立日期 (dateCreated) <default>, 完成日 (dueDate), 建立者（owner), 和 任務id (taskId) 排序回傳結果
 
 團體選項 (groupOptions?):
   mode === "group" 時需要:
   1. 團隊id (groupId)， 查看所有相關 groupId 的任務: int
   2. 任務創作人篩選 (ownerFilter): int 
   3. 任務指派節選 (assignedFilter): true/false, 只看到在團隊裏被指派的任務

子任務選項 (childViewOptions?):
   1. 查詢子任務（false 只會抓 parent, return [{parentTask}...]; true 會抓 children, return [{parentTask, children:[childTask...]}...]) 
   2. 限定自己建立的子任務 （在團體裏因爲別人也可以在自己的任務下增加子任務; false 可以看到別人建立 而 true 限定看到自己的）
   3. 子任務排序 （false 爲 dateCreated, 而 true 將會 follow 上面 (排序）sortBy 的規則 
   */ 
export const getAvailableTasks = async (
    userId: number,
    mode: 'personal' | 'assigned' | 'watching' | 'group',
    dateOption?: string,
    sortBy: 'dueDate' | 'dateCreated' | 'owner' | 'taskId' = 'dueDate',
    groupOptions?: { 
        groupId: number, 
        ownerFilter?: number,  
        assignedFilter?: boolean  
    },
    childViewOptions?: {
        showChild?: boolean,
        ownerExclusive?: boolean,
        sortChildren?: boolean
    }
): Promise<TaskWithChildren[]> => {
    let connection: PoolConnection | undefined;
    
    // Set defaults for childViewOptions
    const showChild = childViewOptions?.showChild ?? false;
    const ownerExclusive = childViewOptions?.ownerExclusive ?? false;
    const sortChildren = childViewOptions?.sortChildren ?? false;
    
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
        // We'll fetch children separately for each parent if showChild is true
        
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
                orderClause = 'ORDER BY -t.due_date DESC';
                break;
            case 'dateCreated':
                orderClause = 'ORDER BY -t.date_created ASC';
                break;
            case 'owner':
                orderClause = 'ORDER BY t.owner_id ASC';
                break;
            case 'taskId':
                orderClause = 'ORDER BY t.task_id ASC';
                break;
            default:
                orderClause = 'ORDER BY -t.date_created ASC';
        }
        
        baseQuery += ` ${orderClause}`;
        
        // Execute the query to get parent tasks
        const [parentTaskRows] = await connection.execute<RowDataPacket[]>(baseQuery, queryParams);
        
        // If showChild is false, return parent tasks with empty children arrays
        if (!showChild) {
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
                    children: []
                };
            });
            
            return tasksWithChildren;
        }
        
        // Create a list of parent task IDs
        const parentTaskIds = parentTaskRows.map(row => row.task_id);
        
        // If there are no tasks, return an empty array
        if (parentTaskIds.length === 0) {
            return [];
        }
        
        // Build child query with owner filtering if needed
        let childQuery = `
            SELECT task_id, description, due_date, owner_id, group_id, 
                   parent_id, completed, date_created
            FROM tasks
            WHERE parent_id IN (${parentTaskIds.map(() => '?').join(',')})
        `;
        
        const childQueryParams = [...parentTaskIds];
        
        // Add owner filter for children if ownerExclusive is true
        if (ownerExclusive) {
            childQuery += ` AND owner_id = ?`;
            childQueryParams.push(userId);
        }
        
        // Add sorting for children
        if (sortChildren) {
            let childOrderClause: string;
            switch (sortBy) {
                case 'dueDate':
                    childOrderClause = 'ORDER BY parent_id, -due_date DESC';
                    break;
                case 'dateCreated':
                    childOrderClause = 'ORDER BY parent_id, -date_created ASC';
                    break;
                case 'owner':
                    childOrderClause = 'ORDER BY parent_id, owner_id ASC';
                    break;
                case 'taskId':
                    childOrderClause = 'ORDER BY parent_id, task_id ASC';
                    break;
                default:
                    childOrderClause = 'ORDER BY parent_id, -date_created ASC';
            }
            childQuery += ` ${childOrderClause}`;
        } else {
            childQuery += ` ORDER BY parent_id, -date_created ASC`;
        }
        
        const [allChildRows] = await connection.execute<RowDataPacket[]>(childQuery, childQueryParams);
        
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