import { 
    
    createTask,

    assignOrWatchTask,
   
} from '../../../src/models/task';


import { 
    cleanupDatabase,
    setupTestData
} from "../../setup"

 

import { 
  getAvailableTasks,
  getGroupsByUserId
} from '../../../src/models/user';
import { pool } from '../../../src/config/database';

import { ResultSetHeader } from "mysql2/promise"

describe('GetAvailableTasks Integration Tests', () => {
  
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

  // ==================== USER VALIDATION TESTING ====================
  describe('User Validation Testing', () => {
    describe('Failure', () => {
      it('should throw "User not found" error for non-existent user ID', async () => {
        await expect(getAvailableTasks(999, 'personal')).rejects.toThrow('User not found');
      });
    });
  });

  // ==================== MODE TESTING ====================
  describe('Mode Testing', () => {
    
    describe('Personal Mode', () => {
      describe('Success', () => {
        it('should retrieve tasks that belong to current user as owner', async () => {
          // Create tasks owned by different users
          const userTask1 = await createTask({
            description: 'User 1 Task 1',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          const userTask2 = await createTask({
            description: 'User 1 Task 2',
            dueDate: new Date('2024-11-15'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: true
          });

          // Create task owned by different user
          await createTask({
            description: 'User 2 Task',
            dueDate: new Date('2024-10-01'),
            ownerId: 2,
            groupId: null,
            parentId: null,
            completed: false
          });

          // Get personal tasks for user 1
          const result = await getAvailableTasks(1, 'personal');

          // Verify only user 1's tasks are returned
          expect(result).toHaveLength(2);
          expect(result.every(taskWithChildren => taskWithChildren.task.ownerId === 1)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.description === 'User 1 Task 1')).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.description === 'User 1 Task 2')).toBe(true);
          expect(result.every(taskWithChildren => taskWithChildren.task.parentId === null)).toBe(true);
        });
      });
    });

    describe('Assigned Mode', () => {
      describe('Success', () => {
        it('should retrieve all tasks that are assigned to the current user', async () => {


          
          // Create tasks owned by different users
          const task1 = await createTask({
            description: 'Task 1 for assignment',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          const task2 = await createTask({
            description: 'Task 2 for assignment',
            dueDate: new Date('2024-11-15'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          const task3 = await createTask({
            description: 'Task 3 not assigned',
            dueDate: new Date('2024-10-01'),
            ownerId: 2,
            groupId: null,
            parentId: null,
            completed: false
          });

          // Assign tasks to user 1
          await assignOrWatchTask(task1.taskId!, 1, 1, 'assigned');
          await assignOrWatchTask(task2.taskId!, 1, 1, 'assigned');
          // Don't assign task3

          // Get assigned tasks for user 1
          const result = await getAvailableTasks(1, 'assigned');

          // Verify only assigned tasks are returned
          expect(result).toHaveLength(2);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task1.taskId)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task2.taskId)).toBe(true);
        });
      });
    });

    describe('Watching Mode', () => {
      describe('Success', () => {
        it('should retrieve all tasks that are watched by the current user', async () => {
          // Create tasks owned by different users
          const task1 = await createTask({
            description: 'Task 1 for watching',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          const task2 = await createTask({
            description: 'Task 2 for watching',
            dueDate: new Date('2024-11-15'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          const task3 = await createTask({
            description: 'Task 3 not watched',
            dueDate: new Date('2024-10-01'),
            ownerId: 2,
            groupId: null,
            parentId: null,
            completed: false
          });

          // Add watchers to tasks
          await assignOrWatchTask(task1.taskId!, 1, 1, 'watcher');
          await assignOrWatchTask(task2.taskId!, 1, 1, 'watcher');
          // Don't add watcher to task3

          // Get watched tasks for user 1
          const result = await getAvailableTasks(1, 'watching');

          // Verify only watched tasks are returned
          expect(result).toHaveLength(2);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task1.taskId)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task2.taskId)).toBe(true);
        });
      });
    });

    describe('Group Mode', () => {
      describe('Success', () => {
        it('should retrieve tasks from the group that the user belongs to when groupOptions is present', async () => {
          // Add user 2 to group 1
          const connection = await pool.getConnection();
          try {
            await connection.execute(
              'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
              [1, 2, 'member']
            );
          } finally {
            connection.release();
          }

          // Create tasks in different contexts
          const groupTask1 = await createTask({
            description: 'Group 1 Task 1',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: 1,
            parentId: null,
            completed: false
          });

          const groupTask2 = await createTask({
            description: 'Group 1 Task 2',
            dueDate: new Date('2024-11-15'),
            ownerId: 2,
            groupId: 1,
            parentId: null,
            completed: false
          });

          // Create task outside group
          await createTask({
            description: 'Personal Task',
            dueDate: new Date('2024-10-01'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          // Get group tasks for user 1
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1
          });

          // Verify only group tasks are returned
          expect(result).toHaveLength(2);
          expect(result.every(taskWithChildren => taskWithChildren.task.groupId === 1)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === groupTask1.taskId)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === groupTask2.taskId)).toBe(true);
        });

        it('should filter tasks based on ownership of other member that belong to the same group (with ownerFilter)', async () => {
          // Add user 2 to group 1
          const connection = await pool.getConnection();
          try {
            await connection.execute(
              'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
              [1, 2, 'member']
            );
          } finally {
            connection.release();
          }

          // Create tasks owned by different users in same group
          const user1Task = await createTask({
            description: 'User 1 Group Task',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: 1,
            parentId: null,
            completed: false
          });

          await createTask({
            description: 'User 2 Group Task',
            dueDate: new Date('2024-11-15'),
            ownerId: 2,
            groupId: 1,
            parentId: null,
            completed: false
          });

          // Get group tasks filtered by user 1 ownership
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1,
            ownerFilter: 1
          });

          // Verify only user 1's tasks are returned
          expect(result).toHaveLength(1);
          expect(result[0].task.ownerId).toBe(1);
          expect(result[0].task.taskId).toBe(user1Task.taskId);
        });

        it('should show all assigned tasks that belong to current user when assignedFilter: true', async () => {
          // Add user 2 to group 1
          const connection = await pool.getConnection();
          try {
            await connection.execute(
              'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
              [1, 2, 'member']
            );
          } finally {
            connection.release();
          }

          // Create group tasks
          const task1 = await createTask({
            description: 'Group Task 1',
            dueDate: new Date('2024-12-31'),
            ownerId: 2,
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

          // Assign only task1 to user 1
          await assignOrWatchTask(task1.taskId!, 1, 2, 'assigned');

          // Get assigned group tasks for user 1
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1,
            assignedFilter: true
          });

          // Verify only assigned task is returned
          expect(result).toHaveLength(1);
          expect(result[0].task.taskId).toBe(task1.taskId);
        });

        it('should show all group tasks regardless of assignment when assignedFilter: false', async () => {
          // Add user 2 to group 1
          const connection = await pool.getConnection();
          try {
            await connection.execute(
              'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
              [1, 2, 'member']
            );
          } finally {
            connection.release();
          }

          // Create group tasks
          const task1 = await createTask({
            description: 'Group Task 1',
            dueDate: new Date('2024-12-31'),
            ownerId: 2,
            groupId: 1,
            parentId: null,
            completed: false
          });

          const task2 = await createTask({
            description: 'Group Task 2',
            dueDate: new Date('2024-11-15'),
            ownerId: 1,
            groupId: 1,
            parentId: null,
            completed: false
          });

          // Assign only task1 to user 1
          await assignOrWatchTask(task1.taskId!, 1, 2, 'assigned');

          // Get all group tasks for user 1
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1,
            assignedFilter: false
          });

          // Verify all group tasks are returned
          expect(result).toHaveLength(2);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task1.taskId)).toBe(true);
          expect(result.some(taskWithChildren => taskWithChildren.task.taskId === task2.taskId)).toBe(true);
        });
      });

      describe('Edge Cases', () => {
        it('should return [] when ownerFilter points to non-existent user', async () => {
          // Create group task
          await createTask({
            description: 'Group Task',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: 1,
            parentId: null,
            completed: false
          });

          // Get group tasks with non-existent owner filter
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1,
            ownerFilter: 999 // Non-existent user
          });

          // Verify empty result
          expect(result).toHaveLength(0);
        });

        it('should return [] when ownerFilter points to user not in group', async () => {
          // Create group task
          await createTask({
            description: 'Group Task',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: 1,
            parentId: null,
            completed: false
          });

          // Get group tasks with owner filter for user not in group
          const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 1,
            ownerFilter: 2 // User 2 is not in group 1
          });

          // Verify empty result
          expect(result).toHaveLength(0);
        });
      });

      describe('Failure', () => {
        it('should fail when using group mode without groupID', async () => {
          await expect(getAvailableTasks(1, 'group')).rejects.toThrow('Group ID is required for group mode');
        });

        it('should fail when retrieving tasks from group that does not exist', async () => {
          await expect(getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 999
          })).rejects.toThrow('Group not found');
        });

        it('should fail when retrieving tasks from group that user is not a part of', async () => {
          // Create second group
          const connection = await pool.getConnection();
          try {
            await connection.execute(
              'INSERT INTO task_groups (group_id, name, description, created_by) VALUES (?, ?, ?, ?)',
              [2, 'User 2 Group', 'Group for user 2', 2]
            );
            await connection.execute(
              'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
              [2, 2, 'admin']
            );
          } finally {
            connection.release();
          }

          // Try to access group 2 as user 1
          await expect(getAvailableTasks(1, 'group', undefined, 'dateCreated', {
            groupId: 2
          })).rejects.toThrow('User is not a member of this group');
        });
      });
    });
  });

  // ==================== EMPTY RESULTS TESTING ====================
  describe('Empty Results Testing', () => {
    
    it('should return [] when no parent tasks found', async () => {
      const result = await getAvailableTasks(1, 'personal');
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return parents with empty children when showChild: false', async () => {
      // Create parent task
      const parent = await createTask({
        description: 'Parent Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });

      // Create child task
      await createTask({
        description: 'Child Task',
        dueDate: new Date('2024-11-15'),
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
      });

      // Get tasks with showChild: false
      const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated', undefined, {
        showChild: false
      });

      // Verify parent returned with empty children
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(parent.taskId);
      expect(result[0].children).toHaveLength(0);
    });

    it('should return parents with empty children when no child tasks exist', async () => {
      // Create parent task with no children
      const parent = await createTask({
        description: 'Parent Task No Children',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });

      // Get tasks with showChild: true
      const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated', undefined, {
        showChild: true
      });

      // Verify parent returned with empty children array
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(parent.taskId);
      expect(result[0].children).toHaveLength(0);
    });
  });

  // ==================== DATE OPTION TESTING ====================
  describe('Date Option Testing', () => {
    
    describe('Success', () => {
      it('should include tasks with due_date matching dateOption', async () => {
        // Create tasks with different due dates
        const matchingTask = await createTask({
          description: 'Matching Date Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        await createTask({
          description: 'Different Date Task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks for specific date
        const result = await getAvailableTasks(1, 'personal', '2024-12-31');

        // Verify only matching task is returned
        expect(result).toHaveLength(1);
        expect(result[0].task.taskId).toBe(matchingTask.taskId);
      });

      it('should exclude tasks with due_date NOT matching dateOption', async () => {
        // Create tasks with different due dates
        await createTask({
          description: 'Task 1',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        await createTask({
          description: 'Task 2',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks for specific date
        const result = await getAvailableTasks(1, 'personal', '2024-10-01');

        // Verify no tasks are returned
        expect(result).toHaveLength(0);
      });
    });

    describe('Edge Cases', () => {
      it('should exclude tasks with NULL due_date when dateOption is specified', async () => {
        // Create tasks with null and specific due dates
        await createTask({
          description: 'Null Date Task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const specificDateTask = await createTask({
          description: 'Specific Date Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks for specific date
        const result = await getAvailableTasks(1, 'personal', '2024-12-31');

        // Verify only specific date task is returned
        expect(result).toHaveLength(1);
        expect(result[0].task.taskId).toBe(specificDateTask.taskId);
      });
    });
  });

  // ==================== ALL MODE TEST ====================
  describe('All Mode Test', () => {
    
    describe('Checks', () => {
      it('should return only parent tasks (all task retrieved should be parent tasks)', async () => {
        // Create parent and child tasks
        const parent = await createTask({
          description: 'Parent Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        await createTask({
          description: 'Child Task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        });

        // Get all tasks
        const result = await getAvailableTasks(1, 'personal');

        // Verify only parent tasks are returned
        expect(result).toHaveLength(1);
        expect(result[0].task.parentId).toBeNull();
        expect(result[0].task.taskId).toBe(parent.taskId);
      });

      it('should include child tasks when showChild: true', async () => {
        // Create parent and child tasks
        const parent = await createTask({
          description: 'Parent Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const child = await createTask({
          description: 'Child Task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        });

        // Get tasks with children
        const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated', undefined, {
          showChild: true
        });

        // Verify parent and children are returned
        expect(result).toHaveLength(1);
        expect(result[0].task.taskId).toBe(parent.taskId);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children[0].taskId).toBe(child.taskId);
      });

      it('should have empty children arrays when showChild: false', async () => {
        // Create parent and child tasks
        const parent = await createTask({
          description: 'Parent Task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        await createTask({
          description: 'Child Task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        });

        // Get tasks without children
        const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated', undefined, {
          showChild: false
        });

        // Verify children arrays are empty
        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(0);
      });
    });

    describe('Sorting', () => {
      it('should sort tasks by dueDate ASC with nulls last when sortBy is dueDate', async () => {
        // Create tasks with different due dates in specific order to verify sorting
        const task1 = await createTask({
          description: 'Task with null date',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const task2 = await createTask({
          description: 'Task with earliest date',
          dueDate: new Date('2024-01-01'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const task3 = await createTask({
          description: 'Task with latest date',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks sorted by due date
        const result = await getAvailableTasks(1, 'personal', undefined, 'dueDate');

        // Verify sorting order: earliest, latest, null (based on actual MySQL ORDER BY behavior)
        expect(result).toHaveLength(3);
        
        // Find tasks by their due dates to verify sorting regardless of creation order
        const nullDateTask = result.find(r => r.task.dueDate === null);
        const earlyDateTask = result.find(r => r.task.dueDate && new Date(r.task.dueDate).getTime() === new Date('2024-01-01').getTime());
        const lateDateTask = result.find(r => r.task.dueDate && new Date(r.task.dueDate).getTime() === new Date('2024-12-31').getTime());
        
        expect(earlyDateTask).toBeDefined();
        expect(lateDateTask).toBeDefined();
        expect(nullDateTask).toBeDefined();
        
        // Verify actual sort order - check the positions
        const earlyIndex = result.findIndex(r => r.task.dueDate && new Date(r.task.dueDate).getTime() === new Date('2024-01-01').getTime());
        const lateIndex = result.findIndex(r => r.task.dueDate && new Date(r.task.dueDate).getTime() === new Date('2024-12-31').getTime());
        const nullIndex = result.findIndex(r => r.task.dueDate === null);
        
        expect(earlyIndex < lateIndex).toBe(true); // Early date should come before late date
        expect(lateIndex < nullIndex).toBe(true); // Late date should come before null
      });

      it('should sort tasks by dateCreated DESC with nulls last when sortBy is dateCreated', async () => {
        // Create tasks with delays to ensure different created times
        const task1 = await createTask({
          description: 'First created task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));

        const task2 = await createTask({
          description: 'Second created task',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        const task3 = await createTask({
          description: 'Third created task',
          dueDate: new Date('2024-10-01'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks sorted by date created
        const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated');

        // Verify sorting order: latest created first (DESC)
        expect(result).toHaveLength(3);
        
        // Verify the actual sort order by checking dateCreated timestamps
        const sortedByCreationDesc = result.slice().sort((a, b) => {
          const dateA = new Date(a.task.dateCreated!).getTime();
          const dateB = new Date(b.task.dateCreated!).getTime();
          return dateB - dateA; // DESC order
        });
        
        // Compare with actual result
        for (let i = 0; i < result.length; i++) {
          expect(result[i].task.taskId).toBe(sortedByCreationDesc[i].task.taskId);
        }
      });

      it('should sort tasks by owner when sortBy is owner', async () => {
        // Add user 2 to group 1
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }

        // Create group tasks owned by different users
        const task1 = await createTask({
          description: 'Task owned by user 2',
          dueDate: new Date('2024-12-31'),
          ownerId: 2,
          groupId: 1,
          parentId: null,
          completed: false
        });

        const task2 = await createTask({
          description: 'Task owned by user 1',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        });

        // Get group tasks sorted by owner
        const result = await getAvailableTasks(1, 'group', undefined, 'owner', { groupId: 1 });

        // Verify sorting order: user 1 first, user 2 second
        expect(result).toHaveLength(2);
        expect(result[0].task.ownerId).toBe(1); // User 1 first
        expect(result[1].task.ownerId).toBe(2); // User 2 second
      });

      it('should sort tasks by taskId when sortBy is taskId', async () => {
        // Create multiple tasks
        const task1 = await createTask({
          description: 'Task 1',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const task2 = await createTask({
          description: 'Task 2',
          dueDate: new Date('2024-11-15'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        const task3 = await createTask({
          description: 'Task 3',
          dueDate: new Date('2024-10-01'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        });

        // Get tasks sorted by task ID
        const result = await getAvailableTasks(1, 'personal', undefined, 'taskId');

        // Verify sorting order: ascending by task ID
        expect(result).toHaveLength(3);
        expect(result[0].task.taskId).toBe(task1.taskId); // Lowest ID first
        expect(result[1].task.taskId).toBe(task2.taskId); // Middle ID
        expect(result[2].task.taskId).toBe(task3.taskId); // Highest ID last
      });

   
      it('should verify actual sort order is correct for NULL handling in dueDate and dateCreated sorting', async () => {
        // Create tasks with mixed null and non-null dates
        const connection = await pool.getConnection();
        try {
          // Insert tasks with specific created times and due dates to test null handling
          await connection.execute(
            `INSERT INTO tasks (task_id, description, due_date, owner_id, date_created) VALUES 
             (?, ?, ?, ?, ?), 
             (?, ?, ?, ?, ?), 
             (?, ?, ?, ?, ?)`,
            [
              1, 'Task with null due date', null, 1, '2024-01-01 10:00:00',
              2, 'Task with early due date', '2024-06-01', 1, '2024-01-01 11:00:00', 
              3, 'Task with late due date', '2024-12-01', 1, '2024-01-01 12:00:00'
            ]
          );
        } finally {
          connection.release();
        }

        // Test dueDate sorting with nulls
        const dueDateResult = await getAvailableTasks(1, 'personal', undefined, 'dueDate');
        expect(dueDateResult).toHaveLength(3);
        
        // Verify dueDate sorting: non-null dates first (ASC), then nulls last
        const nonNullDueDates = dueDateResult.filter(r => r.task.dueDate !== null);
        const nullDueDates = dueDateResult.filter(r => r.task.dueDate === null);
        
        expect(nonNullDueDates).toHaveLength(2);
        expect(nullDueDates).toHaveLength(1);
        
        // Verify non-null dates are sorted ASC
        if (nonNullDueDates.length >= 2) {
          const firstDate = new Date(nonNullDueDates[0].task.dueDate!).getTime();
          const secondDate = new Date(nonNullDueDates[1].task.dueDate!).getTime();
          expect(firstDate <= secondDate).toBe(true);
        }

        // Test dateCreated sorting 
        const dateCreatedResult = await getAvailableTasks(1, 'personal', undefined, 'dateCreated');
        expect(dateCreatedResult).toHaveLength(3);
        
        // Verify dateCreated sorting: DESC order (latest first)
        for (let i = 0; i < dateCreatedResult.length - 1; i++) {
          const currentDate = new Date(dateCreatedResult[i].task.dateCreated!).getTime();
          const nextDate = new Date(dateCreatedResult[i + 1].task.dateCreated!).getTime();
          expect(currentDate >= nextDate).toBe(true);
        }
      });
    });

    describe('ChildViewOptions', () => {
      
      describe('Success', () => {
        it('should return empty children arrays when showChild: false', async () => {
          // Create parent with children
          const parent = await createTask({
            description: 'Parent Task',
            dueDate: new Date('2024-12-31'),
            ownerId: 1,
            groupId: null,
            parentId: null,
            completed: false
          });

          await createTask({
            description: 'Child Task 1',
            dueDate: new Date('2024-11-15'),
            ownerId: 1,
            groupId: null,
            parentId: parent.taskId,
            completed: false
          });

          await createTask({
            description: 'Child Task 2',
            dueDate: new Date('2024-10-01'),
            ownerId: 1,
            groupId: null,
            parentId: parent.taskId,
            completed: false
          });

          // Get tasks with showChild: false
          const result = await getAvailableTasks(1, 'personal', undefined, 'dateCreated', undefined, {
            showChild: false
          });

          expect(result).toHaveLength(1);
          expect(result[0].children).toHaveLength(0);
        });

        describe('showChild: true combinations', () => {
          it('should handle ownerExclusive: true, sortChildren: true', async () => {
            // Add user 2 to group 1 so they can create tasks in the group
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1 owned by user 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1, // In group so user 2 can create child tasks
              parentId: null,
              completed: false
            });

            // Create child task owned by user 1 (same as current user)
            const child1 = await createTask({
              description: 'Child by owner',
              dueDate: new Date('2024-11-15'),
              ownerId: 1, // Same as current user
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Create child task owned by user 2 (different owner but in same group)
            await createTask({
              description: 'Child by other',
              dueDate: new Date('2024-10-01'),
              ownerId: 2, // Different owner but group member
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: true, sortChildren: true
            const result = await getAvailableTasks(1, 'group', undefined, 'dueDate', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: true,
              sortChildren: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(1); // Only owner's child
            expect(result[0].children[0].taskId).toBe(child1.taskId);
            expect(result[0].children[0].ownerId).toBe(1);
          });

          it('should handle ownerExclusive: true, sortChildren: false', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks with different owners and different creation times
            const child1 = await createTask({
              description: 'Child by owner 1',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds
            const child2 = await createTask({
              description: 'Child by owner 2',
              dueDate: new Date('2024-10-01'),
              ownerId: 1,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            await createTask({
              description: 'Child by different owner',
              dueDate: new Date('2024-09-01'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: true, sortChildren: false (should use dateCreated DESC)
            const result = await getAvailableTasks(1, 'group', undefined, 'dueDate', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: true,
              sortChildren: false
            });
            console.log("result is", result)
            console.log("resuilt", result[0].children)
            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2);
            expect(result[0].children[0].taskId).toBe(child2.taskId); 
            expect(result[0].children[1].taskId).toBe(child1.taskId); 
          });

          it('should handle ownerExclusive: false, sortChildren: true', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks with different owners
            const child1 = await createTask({
              description: 'Child by owner',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            const child2 = await createTask({
              description: 'Child by other',
              dueDate: new Date('2024-10-01'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: false, sortChildren: true (should follow parent sorting)
            const result = await getAvailableTasks(1, 'group', undefined, 'dueDate', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: false,
              sortChildren: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2); // All children
            // Should be sorted by dueDate ASC (following parent sorting)
            expect(result[0].children[0].taskId).toBe(child2.taskId); // Earlier due date first
            expect(result[0].children[1].taskId).toBe(child1.taskId); // Later due date second
          });

          it('should handle ownerExclusive: false, sortChildren: false', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks with different creation times
            const child1 = await createTask({
              description: 'Child 1',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds


            const child2 = await createTask({
              description: 'Child 2',
              dueDate: new Date('2024-10-01'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: false, sortChildren: false (should use dateCreated DESC)
            const result = await getAvailableTasks(1, 'group', undefined, 'dueDate', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: false,
              sortChildren: false
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2); // All children
            expect(result[0].children[0].taskId).toBe(child2.taskId); // Latest created first
            expect(result[0].children[1].taskId).toBe(child1.taskId); // Earlier created second
          });
        });

        describe('ownerExclusive', () => {
          it('should fetch children exclusive to owner when true', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks with different owners
            const ownedChild = await createTask({
              description: 'Child owned by current user',
              dueDate: new Date('2024-11-15'),
              ownerId: 1, // Same as current user
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            await createTask({
              description: 'Child owned by other user',
              dueDate: new Date('2024-10-01'),
              ownerId: 2, // Different owner
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: true
            const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(1);
            expect(result[0].children[0].taskId).toBe(ownedChild.taskId);
            expect(result[0].children[0].ownerId).toBe(1);
          });

          it('should fetch all children when false', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks with different owners
            const child1 = await createTask({
              description: 'Child owned by current user',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            const child2 = await createTask({
              description: 'Child owned by other user',
              dueDate: new Date('2024-10-01'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: false
            const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: false
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2);
            expect(result[0].children.some(child => child.taskId === child1.taskId)).toBe(true);
            expect(result[0].children.some(child => child.taskId === child2.taskId)).toBe(true);
          });

          it('should return empty children when ownerExclusive: true but user owns zero child tasks', async () => {
            // Add user 2 to group 1
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }

            // Create parent task owned by user 1 in group 1
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            });

            // Create child tasks owned by user 2 only
            await createTask({
              description: 'Child owned by other user 1',
              dueDate: new Date('2024-11-15'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            await createTask({
              description: 'Child owned by other user 2',
              dueDate: new Date('2024-10-01'),
              ownerId: 2,
              groupId: null, // Will inherit from parent
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with ownerExclusive: true
            const result = await getAvailableTasks(1, 'group', undefined, 'dateCreated', { groupId: 1 }, {
              showChild: true,
              ownerExclusive: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(0); // No children owned by current user
          });
        });

        describe('sortChildren', () => {
          it('should follow dateCreated DESC when sortChildren: false', async () => {
            // Create parent task
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            });

            // Create child tasks with delays to ensure different created times
            const child1 = await createTask({
              description: 'First created child',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null,
              parentId: parent.taskId,
              completed: false
            });

            await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds

            const child2 = await createTask({
              description: 'Second created child',
              dueDate: new Date('2024-10-01'),
              ownerId: 1,
              groupId: null,
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks with sortChildren: false
            const result = await getAvailableTasks(1, 'personal', undefined, 'dueDate', undefined, {
              showChild: true,
              sortChildren: false
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2);
            // Should be sorted by dateCreated DESC
            expect(result[0].children[0].taskId).toBe(child2.taskId); // Latest created first
            expect(result[0].children[1].taskId).toBe(child1.taskId); // Earlier created second
          });

          it('should follow parent sorting method when sortChildren: true', async () => {
            // Create parent task
            const parent = await createTask({
              description: 'Parent Task',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            });

            // Create child tasks with different due dates
            const child1 = await createTask({
              description: 'Child with later due date',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null,
              parentId: parent.taskId,
              completed: false
            });

            const child2 = await createTask({
              description: 'Child with earlier due date',
              dueDate: new Date('2024-10-01'),
              ownerId: 1,
              groupId: null,
              parentId: parent.taskId,
              completed: false
            });

            // Get tasks sorted by dueDate with sortChildren: true
            const result = await getAvailableTasks(1, 'personal', undefined, 'dueDate', undefined, {
              showChild: true,
              sortChildren: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(2);
            // Should be sorted by dueDate ASC (following parent sorting)
            expect(result[0].children[0].taskId).toBe(child2.taskId); // Earlier due date first
            expect(result[0].children[1].taskId).toBe(child1.taskId); // Later due date second
          });

          it('should verify child sorting within each parent group works correctly', async () => {
            // Create two parent tasks
            const parent1 = await createTask({
              description: 'Parent Task 1',
              dueDate: new Date('2024-12-31'),
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            });

            const parent2 = await createTask({
              description: 'Parent Task 2',
              dueDate: new Date('2024-11-30'),
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            });

            // Create children for parent1 with different due dates
            const child1a = await createTask({
              description: 'Parent1 Child Late',
              dueDate: new Date('2024-11-15'),
              ownerId: 1,
              groupId: null,
              parentId: parent1.taskId,
              completed: false
            });

            const child1b = await createTask({
              description: 'Parent1 Child Early',
              dueDate: new Date('2024-10-01'),
              ownerId: 1,
              groupId: null,
              parentId: parent1.taskId,
              completed: false
            });

            // Create children for parent2 with different due dates
            const child2a = await createTask({
              description: 'Parent2 Child Late',
              dueDate: new Date('2024-09-15'),
              ownerId: 1,
              groupId: null,
              parentId: parent2.taskId,
              completed: false
            });

            const child2b = await createTask({
              description: 'Parent2 Child Early',
              dueDate: new Date('2024-08-01'),
              ownerId: 1,
              groupId: null,
              parentId: parent2.taskId,
              completed: false
            });

            // Get tasks sorted by dueDate with sortChildren: true
            const result = await getAvailableTasks(1, 'personal', undefined, 'dueDate', undefined, {
              showChild: true,
              sortChildren: true
            });

            expect(result).toHaveLength(2);
            
            // Verify parent1 children are sorted by due date ASC
            const parent1Result = result.find(r => r.task.taskId === parent1.taskId);
            expect(parent1Result!.children).toHaveLength(2);
            expect(parent1Result!.children[0].taskId).toBe(child1b.taskId); // Earlier due date first
            expect(parent1Result!.children[1].taskId).toBe(child1a.taskId); // Later due date second

            // Verify parent2 children are sorted by due date ASC
            const parent2Result = result.find(r => r.task.taskId === parent2.taskId);
            expect(parent2Result!.children).toHaveLength(2);
            expect(parent2Result!.children[0].taskId).toBe(child2b.taskId); // Earlier due date first
            expect(parent2Result!.children[1].taskId).toBe(child2a.taskId); // Later due date second
          });
        });
      });
    });
  });

  describe('Update Changes', () => {
    it('should NOT retrieve tasks with group_id even if owned by user', async () => {
      // Create personal task (no group)
      const personalTask = await createTask({
        description: 'Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Create group task owned by same user
      await createTask({
        description: 'Group Task Owned by User',
        dueDate: new Date('2024-11-15'),
        ownerId: 1,
        groupId: 1, // Has group_id
        parentId: null,
        completed: false
      });
  
      const result = await getAvailableTasks(1, 'personal');
  
      // Should only return personal task, not group task
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(personalTask.taskId);
      expect(result[0].task.groupId).toBeNull();
    });
  

  
    it('should retrieve group tasks where user is assigned AND is a group member', async () => {
      // Add users to group 1
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']  // Only add user 2
        );
      } finally {
        connection.release();
      }
  
      // Create group task
      const groupTask = await createTask({
        description: 'Group Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 2,
        groupId: 1,
        parentId: null,
        completed: false
      });
  
      // Assign task to user 1 (who IS in group 1)
      await assignOrWatchTask(groupTask.taskId!, 1, 2, 'assigned');
  
      const result = await getAvailableTasks(1, 'assigned');
  
      // Should return the task - user 1 is assigned AND group member
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(groupTask.taskId);
    });
  
    it('should retrieve non-group tasks where user is assigned and owns the task', async () => {
      // Create non-group task owned by user 1
      const personalTask = await createTask({
        description: 'Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Assign task to user 1 (self-assignment)
      await assignOrWatchTask(personalTask.taskId!, 1, 1, 'assigned');
  
      const result = await getAvailableTasks(1, 'assigned');
  
      // Should return the task - user owns non-group task
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(personalTask.taskId);
    });
  

    it('should handle corrupted data: filter out invalid assigned non-group tasks', async () => {
      // Create non-group task owned by user 2
      const otherPersonalTask = await createTask({
        description: 'Other Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 2,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Simulate data corruption by directly inserting invalid assignment
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_assigned (task_id, user_id) VALUES (?, ?)',
          [otherPersonalTask.taskId, 1]
        );
      } finally {
        connection.release();
      }
  
      const result = await getAvailableTasks(1, 'assigned');
  
      // Should NOT return the task - getAvailableTasks should filter corrupted data
      expect(result).toHaveLength(0);
    });
  
    it('should retrieve non-group tasks where user is watching and owns the task', async () => {
      // Create non-group task owned by user 1
      const personalTask = await createTask({
        description: 'Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Add user 1 as watcher (self-watching)
      await assignOrWatchTask(personalTask.taskId!, 1, 1, 'watcher');
  
      const result = await getAvailableTasks(1, 'watching');
  
      // Should return the task - user owns non-group task
      expect(result).toHaveLength(1);
      expect(result[0].task.taskId).toBe(personalTask.taskId);
    });
  
    it('should prevent watching of non-group tasks by users who do not own them', async () => {
      // Create non-group task owned by user 2
      const otherPersonalTask = await createTask({
        description: 'Other Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 2,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Try to add user 1 as watcher (who doesn't own it)
      // This should FAIL because non-group tasks can only be watched by owner
      await expect(
        assignOrWatchTask(otherPersonalTask.taskId!, 1, 2, 'watcher')
      ).rejects.toThrow('Insufficient privileges');
  
      const result = await getAvailableTasks(1, 'watching');
  
      // Should NOT return any tasks - watcher assignment was prevented
      expect(result).toHaveLength(0);
    });
  
    it('should handle corrupted data: filter out invalid watched non-group tasks', async () => {
      // Create non-group task owned by user 2
      const otherPersonalTask = await createTask({
        description: 'Other Personal Task',
        dueDate: new Date('2024-12-31'),
        ownerId: 2,
        groupId: null,
        parentId: null,
        completed: false
      });
  
      // Simulate data corruption by directly inserting invalid watcher
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_watchers (task_id, user_id) VALUES (?, ?)',
          [otherPersonalTask.taskId, 1]
        );
      } finally {
        connection.release();
      }
  
      const result = await getAvailableTasks(1, 'watching');
  
      // Should NOT return the task - getAvailableTasks should filter corrupted data
      expect(result).toHaveLength(0);
    });
  });

});


// Import statement should be added at the top of your test file
// import { ResultSetHeader } from 'mysql2/promise';

describe('getGroupsByUserId', () => {


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
    it('should retrieve groups for valid userId', async () => {
      // User 1 should already be in group 1 as admin from setup
      const result = await getGroupsByUserId(1);
      
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      
      // Check structure of returned groups
      const group = result[0];
      expect(group).toHaveProperty('groupId');
      expect(group).toHaveProperty('name');
      expect(group).toHaveProperty('description');
      expect(group).toHaveProperty('createdBy');
      expect(group).toHaveProperty('createdAt');
      expect(group).toHaveProperty('role');
      
      // Verify the user's role is included
      expect(['admin', 'member']).toContain(group.role);
    });

    it('should return empty array when user has no groups', async () => {
      // Create a new user who isn't in any groups
      const connection = await pool.getConnection();
      let newUserId;
      
      try {
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO users (username, password) VALUES (?, ?)',
          ['isolateduser', 'hashedpassword']
        );
        newUserId = result.insertId;
      } finally {
        connection.release();
      }

      const groups = await getGroupsByUserId(newUserId);
      
      expect(groups).toBeInstanceOf(Array);
      expect(groups).toHaveLength(0);
    });

    it('should include user role for each group', async () => {
      // Add user 1 to multiple groups with different roles
      const connection = await pool.getConnection();
      
      try {
        // Create additional group
        const [groupResult] = await connection.execute<ResultSetHeader>(
          'INSERT INTO task_groups (name, description, created_by) VALUES (?, ?, ?)',
          ['Test Group 2', 'Second test group', 1]
        );
        const group2Id = groupResult.insertId;
        
        // Add user 1 as member to the new group
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [group2Id, 1, 'member']
        );
      } finally {
        connection.release();
      }

      const groups = await getGroupsByUserId(1);
      
      expect(groups.length).toBeGreaterThanOrEqual(2);
      
      // Check that roles are present and valid
      groups.forEach(group => {
        expect(group.role).toBeDefined();
        expect(['admin', 'member']).toContain(group.role);
      });
      
      // Should have at least one admin role (from group 1) and one member role (from group 2)
      const roles = groups.map(g => g.role);
      expect(roles).toContain('admin');
      expect(roles).toContain('member');
    });

    it('should return groups sorted by created_at DESC', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create multiple groups with delays to ensure different timestamps
        const [group1Result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO task_groups (name, description, created_by) VALUES (?, ?, ?)',
          ['Older Group', 'Created first', 1]
        );
        const olderGroupId = group1Result.insertId;
        
        await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay
        
        const [group2Result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO task_groups (name, description, created_by) VALUES (?, ?, ?)',
          ['Newer Group', 'Created second', 1]
        );
        const newerGroupId = group2Result.insertId;
        
        // Add user 1 to both groups
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [olderGroupId, 1, 'admin']
        );
        
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [newerGroupId, 1, 'admin']
        );
      } finally {
        connection.release();
      }

      const groups = await getGroupsByUserId(1);
      
      expect(groups.length).toBeGreaterThanOrEqual(2);
      
      // Verify sorting by created_at DESC (newest first)
      for (let i = 0; i < groups.length - 1; i++) {
        const currentGroupTime = new Date(groups[i].createdAt).getTime();
        const nextGroupTime = new Date(groups[i + 1].createdAt).getTime();
        expect(currentGroupTime >= nextGroupTime).toBe(true);
      }
      
      // Verify the newest group appears first
      expect(groups[0].name).toBe('Newer Group');
    });

    it('should handle groups with null descriptions', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create group with null description
        const [groupResult] = await connection.execute<ResultSetHeader>(
          'INSERT INTO task_groups (name, description, created_by) VALUES (?, ?, ?)',
          ['No Description Group', null, 1]
        );
        const groupId = groupResult.insertId;
        
        // Add user 1 to the group
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [groupId, 1, 'admin']
        );
      } finally {
        connection.release();
      }

      const groups = await getGroupsByUserId(1);
      
      // Find the group with null description
      const nullDescGroup = groups.find(g => g.name === 'No Description Group');
      expect(nullDescGroup).toBeDefined();
      expect(nullDescGroup!.description).toBeNull();
      
      // Verify other properties are still present
      expect(nullDescGroup!.groupId).toBeDefined();
      expect(nullDescGroup!.name).toBe('No Description Group');
      expect(nullDescGroup!.createdBy).toBe(1);
      expect(nullDescGroup!.createdAt).toBeDefined();
      expect(nullDescGroup!.role).toBe('admin');
    });
  });

  describe('Failure', () => {
    it('should throw error when user doesn\'t exist', async () => {
      const nonExistentUserId = 99999;
      
      await expect(getGroupsByUserId(nonExistentUserId))
        .rejects
        .toThrow('User not found');
    });

    it('should check if user exists before retrieving groups', async () => {
      // Test with various non-existent user IDs
      await expect(getGroupsByUserId(0))
        .rejects
        .toThrow('User not found');
        
      await expect(getGroupsByUserId(-1))
        .rejects
        .toThrow('User not found');
        
      await expect(getGroupsByUserId(999999))
        .rejects
        .toThrow('User not found');
    });
  });







});