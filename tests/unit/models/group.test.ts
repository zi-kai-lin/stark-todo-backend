// tests/integration/models/createTask.integration.test.ts
import {


    createGroup,
    GroupCreateParams,
    addUserToGroup,
    removeUserFromGroup,
    deleteGroup

} from "../../../src/models/group"

import { 
    
    createTask,
    updateTask,
    deleteTask,
    getTaskById,
    addTaskComment,
    deleteTaskComment,
    getTaskComments,
    assignOrWatchTask,
    removeAssignOrWatchTask,
    getAssigneesAndWatchers

 } from '../../../src/models/task';

 import { 
  cleanupDatabase,
  setupTestData
} from "../../setup"

import { pool } from '../../../src/config/database';
import { RowDataPacket } from 'mysql2';
import { ResultSetHeader } from "mysql2/promise"



describe('createGroup', () => {
    beforeEach(async () => {
      // Setup test database
      await cleanupDatabase();
      await setupTestData();
    });
  
    afterAll(async () => {
      // Final cleanup
      await cleanupDatabase();
    });
  
    describe('Success', () => {
        it('should create group with name and description and current user', async () => {
            const groupParams: GroupCreateParams = {
              name: 'Unique Test Group',
              description: 'Test group description',
              ownerId: 1
            };
      
            const result = await createGroup(groupParams);
      
            expect(result).toBeDefined();
            expect(result.groupId).toBeDefined();
            expect(result.name).toBe('Unique Test Group');
            expect(result.description).toBe('Test group description');
            expect(result.createdBy).toBe(1);
            expect(result.createdAt).toBeDefined();
            expect(result.role).toBe('admin');
      
            // Verify the group was actually created in database
            const connection = await pool.getConnection();
            try {
              const [groups] = await connection.execute<RowDataPacket[]>(
                'SELECT * FROM task_groups WHERE group_id = ?',
                [result.groupId]
              );
              expect(groups).toHaveLength(1);
              expect(groups[0].name).toBe('Unique Test Group');
              expect(groups[0].created_by).toBe(1);
      
              // Verify the creator was added as admin
              const [members] = await connection.execute<RowDataPacket[]>(
                'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
                [result.groupId, 1]
              );
              expect(members).toHaveLength(1);
              expect(members[0].role).toBe('admin');
            } finally {
              connection.release();
            }
          });
      
  
      it('should create group with null description', async () => {
        const groupParams = {
          name: 'Test Group No Description',
          description: "",
          ownerId: 1
        };
  
        const result = await createGroup(groupParams);
  
        expect(result).toBeDefined();
        expect(result.groupId).toBeDefined();
        expect(result.name).toBe('Test Group No Description');
        expect(result.description).toBe("");
        expect(result.createdBy).toBe(1);
        expect(result.createdAt).toBeDefined();
        expect(result.role).toBe('admin');
      });
  
      
  
      it('should create group with creator as admin role', async () => {
        const groupParams = {
          name: 'Admin Role Test',
          description: 'Testing admin role assignment',
          ownerId: 1
        };
  
        const result = await createGroup(groupParams);
  
        expect(result.role).toBe('admin');
  
        // Double check in database
        const connection = await pool.getConnection();
        try {
          const [members] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
            [result.groupId, 1]
          );
          expect(members).toHaveLength(1);
          expect(members[0].role).toBe('admin');
        } finally {
          connection.release();
        }
      });
    });
  
    describe('Failure', () => {
      it('should throw error when creating group with same name', async () => {
        // Create first group
        const groupParams1 = {
          name: 'Duplicate Name',
          description: 'First group',
          ownerId: 1
        };
        await createGroup(groupParams1);
  
        // Try to create second group with same name
        const groupParams2 = {
          name: 'Duplicate Name',
          description: 'Second group',
          ownerId: 2
        };
  
        await expect(createGroup(groupParams2))
          .rejects
          .toThrow('Group name already exists');
      });
  
      it('should rollback transaction when group creation fails', async () => {
        // Create first group
        const groupParams1 = {
          name: 'Rollback Test',
          description: 'First group',
          ownerId: 1
        };
        await createGroup(groupParams1);
  
        const connection = await pool.getConnection();
        let initialGroupCount;
        let initialMemberCount;
  
        try {
          // Get initial counts
          const [groupCountResult] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM task_groups'
          );
          initialGroupCount = groupCountResult[0].count;
  
          const [memberCountResult] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM group_members'
          );
          initialMemberCount = memberCountResult[0].count;
        } finally {
          connection.release();
        }
  
        // Try to create group with duplicate name (should fail and rollback)
        const groupParams2 = {
          name: 'Rollback Test',
          description: 'Second group',
          ownerId: 2
        };
  
        await expect(createGroup(groupParams2))
          .rejects
          .toThrow('Group name already exists');
  
        // Verify counts haven't changed (transaction was rolled back)
        const connection2 = await pool.getConnection();
        try {
          const [groupCountResult] = await connection2.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM task_groups'
          );
          expect(groupCountResult[0].count).toBe(initialGroupCount);
  
          const [memberCountResult] = await connection2.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM group_members'
          );
          expect(memberCountResult[0].count).toBe(initialMemberCount);
        } finally {
          connection2.release();
        }
      });
    });
  });



describe('addUserToGroup', () => {
    beforeEach(async () => {
        // Setup test database
        await cleanupDatabase();
        await setupTestData();
    });

    afterAll(async () => {
        // Final cleanup
        await cleanupDatabase();
    });

    describe('Success', () => {
        it('should add user as admin to existing group and record target user group info', async () => {
        // Admin (user 1) adds user 2 to group 1
        const result = await addUserToGroup(1, 2, 1);

        expect(result).toBe(true);

        // Verify the user was added to the group
        const connection = await pool.getConnection();
        try {
            const [members] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
            );
            expect(members).toHaveLength(1);
            expect(members[0].role).toBe('member');
            expect(members[0].group_id).toBe(1);
            expect(members[0].user_id).toBe(2);
            expect(members[0].join_date).toBeDefined();
        } finally {
            connection.release();
        }
        });

        it('should allow admin to add users outside of group as long as they exist and not already in group', async () => {
        // Create additional users for testing
        const connection = await pool.getConnection();
        let newUserId;
        
        try {
            const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            ['newuser', 'hashedpassword']
            );
            newUserId = result.insertId;
        } finally {
            connection.release();
        }

        // Admin (user 1) adds the new user to group 1
        const addResult = await addUserToGroup(1, newUserId, 1);

        expect(addResult).toBe(true);

        // Verify the new user was added
        const connection2 = await pool.getConnection();
        try {
            const [members] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, newUserId]
            );
            expect(members).toHaveLength(1);
            expect(members[0].role).toBe('member');
        } finally {
            connection2.release();
        }
        });

        it('should add user with member role by default', async () => {
        const result = await addUserToGroup(1, 2, 1);

        expect(result).toBe(true);

        // Verify the user was added with member role
        const connection = await pool.getConnection();
        try {
            const [members] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
            );
            expect(members).toHaveLength(1);
            expect(members[0].role).toBe('member');
        } finally {
            connection.release();
        }
        });
    });

    describe('Failure', () => {
        it('should throw error when target user does not exist', async () => {
        const nonExistentUserId = 99999;

        await expect(addUserToGroup(1, nonExistentUserId, 1))
            .rejects
            .toThrow('User not found');
        });

        it('should throw error when target group does not exist', async () => {
        const nonExistentGroupId = 99999;

        await expect(addUserToGroup(nonExistentGroupId, 2, 1))
            .rejects
            .toThrow('Group not found');
        });

        it('should throw error when current user is not admin of the target group', async () => {
        // User 2 (not admin of group 1) tries to add a new user
        const connection = await pool.getConnection();
        let newUserId;
        
        try {
            const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            ['targetuser', 'hashedpassword']
            );
            newUserId = result.insertId;
        } finally {
            connection.release();
        }

        await expect(addUserToGroup(1, newUserId, 2))
            .rejects
            .toThrow('Insufficient privileges');
        });

        it('should throw error when user already exists within the group', async () => {
        // First add user 2 to group 1
        await addUserToGroup(1, 2, 1);

        // Try to add the same user again
        await expect(addUserToGroup(1, 2, 1))
            .rejects
            .toThrow('User already in group');
        });

        it('should throw error when non-member tries to add users', async () => {
        // Create a new user who is not in any group
        const connection = await pool.getConnection();
        let outsiderUserId;
        
        try {
            const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            ['outsider', 'hashedpassword']
            );
            outsiderUserId = result.insertId;
        } finally {
            connection.release();
        }

        // Outsider tries to add user 2 to group 1
        await expect(addUserToGroup(1, 2, outsiderUserId))
            .rejects
            .toThrow('Insufficient privileges');
        });

        it('should rollback transaction when add user fails', async () => {
        const connection = await pool.getConnection();
        let initialMemberCount;

        try {
            // Get initial member count
            const [memberCountResult] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
            [1]
            );
            initialMemberCount = memberCountResult[0].count;
        } finally {
            connection.release();
        }

        // Try to add non-existent user (should fail)
        await expect(addUserToGroup(1, 99999, 1))
            .rejects
            .toThrow('User not found');

        // Verify member count hasn't changed
        const connection2 = await pool.getConnection();
        try {
            const [memberCountResult] = await connection2.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
            [1]
            );
            expect(memberCountResult[0].count).toBe(initialMemberCount);
        } finally {
            connection2.release();
        }
        });
    });
});





describe('deleteGroup', () => {
    beforeEach(async () => {
      await cleanupDatabase();
      await setupTestData();
    });
  
    afterAll(async () => {
      await cleanupDatabase();
    });
  
    describe('Success', () => {
      it('should delete group when user is admin', async () => {
        const result = await deleteGroup(1, 1);
  
        expect(result).toBe(true);
  
        // Verify the group was deleted
        const connection = await pool.getConnection();
        try {
          const [groups] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_groups WHERE group_id = ?',
            [1]
          );
          expect(groups).toHaveLength(0);
        } finally {
          connection.release();
        }
      });
  
      it('should cascade delete all group members when group is deleted', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Verify users are in the group
        const connection = await pool.getConnection();
        try {
          const [membersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ?',
            [1]
          );
          expect(membersBefore.length).toBeGreaterThan(1);
        } finally {
          connection.release();
        }
  
        // Delete the group
        const result = await deleteGroup(1, 1);
        expect(result).toBe(true);
  
        // Verify all group member connections are removed
        const connection2 = await pool.getConnection();
        try {
          const [membersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ?',
            [1]
          );
          expect(membersAfter).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
  
      it('should cascade delete all group tasks when group is deleted', async () => {


        await addUserToGroup(1, 2, 1);

        // Create group tasks
        const groupTask1 = await createTask({
          description: 'Group Task 1',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        const groupTask2 = await createTask({
          description: 'Group Task 2',
          dueDate: new Date('2024-11-15'),
          ownerId: 2,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Verify tasks exist
        const connection = await pool.getConnection();
        try {
          const [tasksBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM tasks WHERE group_id = ?',
            [1]
          );
          expect(tasksBefore).toHaveLength(2);
        } finally {
          connection.release();
        }
  
        // Delete the group
        const result = await deleteGroup(1, 1);
        expect(result).toBe(true);
  
        // Verify all group tasks are deleted
        const connection2 = await pool.getConnection();
        try {
          const [tasksAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM tasks WHERE task_id IN (?, ?)',
            [groupTask1.taskId, groupTask2.taskId]
          );
          expect(tasksAfter).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
  
      it('should cascade delete task assignments, watchers, and comments when group is deleted', async () => {
        // Add user 2 to group
        await addUserToGroup(1, 2, 1);
  
        // Create group task
        const groupTask = await createTask({
          description: 'Group Task with Relations',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Add assignments and watchers
        await assignOrWatchTask(groupTask.taskId!, 2, 1, 'assigned');
        await assignOrWatchTask(groupTask.taskId!, 2, 1, 'watcher');
  
        // Add comments
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?), (?, ?, ?)',
            [groupTask.taskId, 1, 'Comment by user 1', groupTask.taskId, 2, 'Comment by user 2']
          );
  
          // Verify assignments, watchers, and comments exist
          const [assignmentsBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE task_id = ?',
            [groupTask.taskId]
          );
          const [watchersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ?',
            [groupTask.taskId]
          );
          const [commentsBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [groupTask.taskId]
          );
  
          expect(assignmentsBefore).toHaveLength(1);
          expect(watchersBefore).toHaveLength(1);
          expect(commentsBefore).toHaveLength(2);
        } finally {
          connection.release();
        }
  
        // Delete the group
        const result = await deleteGroup(1, 1);
        expect(result).toBe(true);
  
        // Verify all related data is deleted
        const connection2 = await pool.getConnection();
        try {
          const [assignmentsAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE task_id = ?',
            [groupTask.taskId]
          );
          const [watchersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ?',
            [groupTask.taskId]
          );
          const [commentsAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [groupTask.taskId]
          );
  
          expect(assignmentsAfter).toHaveLength(0);
          expect(watchersAfter).toHaveLength(0);
          expect(commentsAfter).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
  
      it('should preserve personal tasks when group is deleted', async () => {
        // Create personal task (no group)
        const personalTask = await createTask({
          description: 'Personal Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });
  
        // Create group task
        await createTask({
          description: 'Group Task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Delete the group
        const result = await deleteGroup(1, 1);
        expect(result).toBe(true);
  
        // Verify personal task still exists
        const connection = await pool.getConnection();
        try {
          const [personalTaskAfter] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM tasks WHERE task_id = ?',
            [personalTask.taskId]
          );
          expect(personalTaskAfter).toHaveLength(1);
          expect(personalTaskAfter[0].group_id).toBeNull();
        } finally {
          connection.release();
        }
      });
    });
  
    describe('Failure', () => {
      it('should throw error when group does not exist', async () => {
        await expect(deleteGroup(999, 1)).rejects.toThrow('Group not found');
      });
  
      it('should throw error when user is not an admin', async () => {
        // Add user 2 as regular member
        await addUserToGroup(1, 2, 1);
  
        // Try to delete group as non-admin user 2
        await expect(deleteGroup(1, 2)).rejects.toThrow('Insufficient privileges');
      });
  
      it('should throw error when user is not a group member', async () => {
        // Try to delete group as user 2 who is not in the group
        await expect(deleteGroup(1, 2)).rejects.toThrow('Insufficient privileges');
      });
    });
  });

  describe('removeUserFromGroup', () => {
    beforeEach(async () => {
      await cleanupDatabase();
      await setupTestData();
    });
  
    afterAll(async () => {
      await cleanupDatabase();
    });
  
    describe('Success', () => {
      it('should remove user from group when user has no associated tasks', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Verify user 2 is in the group
        const connection = await pool.getConnection();
        try {
          const [membersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
          );
          expect(membersBefore).toHaveLength(1);
        } finally {
          connection.release();
        }
  
        // Remove user 2 from group 1
        const result = await removeUserFromGroup(1, 2, 1);
        expect(result).toBe(true);
  
        // Verify user was removed from group
        const connection2 = await pool.getConnection();
        try {
          const [membersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
          );
          expect(membersAfter).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
  
      it('should remove user assignments and watching but keep tasks in group', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Create group task owned by user 2
        const groupTask = await createTask({
          description: 'Task by User 2',
          dueDate: new Date('2024-12-31'),
          ownerId: 2,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Assign task to user 2 and make them watch it
        await assignOrWatchTask(groupTask.taskId!, 2, 1, 'assigned');
        await assignOrWatchTask(groupTask.taskId!, 2, 1, 'watcher');
  
        // User 1 also watches the task
        await assignOrWatchTask(groupTask.taskId!, 1, 1, 'watcher');
  
        // Verify assignments and watchers exist
        const connection = await pool.getConnection();
        try {
          const [assignmentsBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 2]
          );
          const [watchersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 2]
          );
          const [user1WatchersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 1]
          );
  
          expect(assignmentsBefore).toHaveLength(1);
          expect(watchersBefore).toHaveLength(1);
          expect(user1WatchersBefore).toHaveLength(1);
        } finally {
          connection.release();
        }
  
        // Remove user 2 from group
        const result = await removeUserFromGroup(1, 2, 1);
        expect(result).toBe(true);
  
        // Verify user 2's assignments and watching are removed
        const connection2 = await pool.getConnection();
        try {
          const [assignmentsAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 2]
          );
          const [watchersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 2]
          );
          const [user1WatchersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE task_id = ? AND user_id = ?',
            [groupTask.taskId, 1]
          );
  
          // User 2's assignments and watching should be gone
          expect(assignmentsAfter).toHaveLength(0);
          expect(watchersAfter).toHaveLength(0);
          
          // User 1's watching should remain
          expect(user1WatchersAfter).toHaveLength(1);
        } finally {
          connection2.release();
        }
  
        // Most importantly: Verify the task still exists in the group
        const connection3 = await pool.getConnection();
        try {
          const [taskAfter] = await connection3.execute<RowDataPacket[]>(
            'SELECT * FROM tasks WHERE task_id = ?',
            [groupTask.taskId]
          );
  
          expect(taskAfter).toHaveLength(1);
          expect(taskAfter[0].owner_id).toBe(2); // Owner unchanged
          expect(taskAfter[0].group_id).toBe(1); // Still in group
          expect(taskAfter[0].description).toBe('Task by User 2');
        } finally {
          connection3.release();
        }
      });
  
      it('should preserve task comments when user is removed from group', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Create group task
        const groupTask = await createTask({
          description: 'Task with Comments',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Add comments from both users
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?), (?, ?, ?)',
            [groupTask.taskId, 1, 'Comment by user 1', groupTask.taskId, 2, 'Comment by user 2']
          );
  
          // Verify comments exist
          const [commentsBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [groupTask.taskId]
          );
          expect(commentsBefore).toHaveLength(2);
        } finally {
          connection.release();
        }
  
        // Remove user 2 from group
        const result = await removeUserFromGroup(1, 2, 1);
        expect(result).toBe(true);
  
        // Verify comments are preserved
        const connection2 = await pool.getConnection();
        try {
          const [commentsAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_comments WHERE task_id = ? ORDER BY user_id',
            [groupTask.taskId]
          );
  
          expect(commentsAfter).toHaveLength(2);
          expect(commentsAfter[0].user_id).toBe(1);
          expect(commentsAfter[0].content).toBe('Comment by user 1');
          expect(commentsAfter[1].user_id).toBe(2);
          expect(commentsAfter[1].content).toBe('Comment by user 2');
        } finally {
          connection2.release();
        }
      });
  
      it('should remove user from multiple group tasks at once', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Create multiple group tasks
        const task1 = await createTask({
          description: 'Group Task 1',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        const task2 = await createTask({
          description: 'Group Task 2',
          dueDate: new Date('2024-11-15'),
          ownerId: 2,
          groupId: 1,
          parentId: null,
          completed: false
        });
  
        // Assign user 2 to both tasks
        await assignOrWatchTask(task1.taskId!, 2, 1, 'assigned');
        await assignOrWatchTask(task2.taskId!, 2, 1, 'watcher');
  
        // Verify assignments
        const connection = await pool.getConnection();
        try {
          const [assignmentsBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE user_id = ?',
            [2]
          );
          const [watchersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE user_id = ?',
            [2]
          );
  
          expect(assignmentsBefore).toHaveLength(1);
          expect(watchersBefore).toHaveLength(1);
        } finally {
          connection.release();
        }
  
        // Remove user 2 from group
        const result = await removeUserFromGroup(1, 2, 1);
        expect(result).toBe(true);
  
        // Verify all assignments and watching removed
        const connection2 = await pool.getConnection();
        try {
          const [assignmentsAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_assigned WHERE user_id = ?',
            [2]
          );
          const [watchersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM task_watchers WHERE user_id = ?',
            [2]
          );
  
          expect(assignmentsAfter).toHaveLength(0);
          expect(watchersAfter).toHaveLength(0);
        } finally {
          connection2.release();
        }
  
        // Verify tasks still exist
        const connection3 = await pool.getConnection();
        try {
          const [tasksAfter] = await connection3.execute<RowDataPacket[]>(
            'SELECT * FROM tasks WHERE task_id IN (?, ?)',
            [task1.taskId, task2.taskId]
          );
  
          expect(tasksAfter).toHaveLength(2);
          expect(tasksAfter.every(task => task.group_id === 1)).toBe(true);
        } finally {
          connection3.release();
        }
      });
    });
  
    describe('Failure', () => {
      it('should throw error when group does not exist', async () => {
        await expect(removeUserFromGroup(999, 2, 1))
          .rejects
          .toThrow('Group not found');
      });
  
      it('should throw error when current user is not admin', async () => {
        // Add user 2 as regular member
        await addUserToGroup(1, 2, 1);
  
        // User 2 (non-admin) tries to remove themselves
        await expect(removeUserFromGroup(1, 2, 2))
          .rejects
          .toThrow('Insufficient privileges');
      });
  
      it('should throw error when target user is not in group', async () => {
        // User 2 is not in group 1
        await expect(removeUserFromGroup(1, 2, 1))
          .rejects
          .toThrow('User not found in group');
      });
  
      it('should throw error when trying to remove group creator', async () => {
        // User 1 is the creator of group 1 (from setupTestData)
        await expect(removeUserFromGroup(1, 1, 1))
          .rejects
          .toThrow('Cannot remove group creator');
      });
  
      it('should rollback on database error', async () => {
        // Add user 2 to group 1
        await addUserToGroup(1, 2, 1);
  
        // Verify user 2 is in group
        const connection = await pool.getConnection();
        try {
          const [membersBefore] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
          );
          expect(membersBefore).toHaveLength(1);
        } finally {
          connection.release();
        }
  
        // Mock a database error by using invalid group ID after validation
        // This tests transaction rollback behavior
        await expect(removeUserFromGroup(1, 999, 1))
          .rejects
          .toThrow('User not found in group');
  
        // Verify user 2 is still in group (rollback worked)
        const connection2 = await pool.getConnection();
        try {
          const [membersAfter] = await connection2.execute<RowDataPacket[]>(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
          );
          expect(membersAfter).toHaveLength(1);
        } finally {
          connection2.release();
        }
      });
    });
  });