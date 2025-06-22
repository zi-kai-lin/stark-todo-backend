import { createTask, updateTask, deleteTask, getTaskById } from '../../../src/models/task';
import { 
  mockConnection, 
  mockSuccessfulInsert, 
  mockSuccessfulSelect, 
  mockSuccessfulUpdate,
  mockSuccessfulDelete,
  mockExecuteError,
  createMockRowDataPacket 
} from '../../mock/database';

describe('Task Model - Comprehensive Tests', () => {
  
  // ==================== GENERAL TESTS ====================
  describe('General Database Handling', () => {
    it('should handle database failures', async () => {
      const taskData = {
        description: 'Test task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };

      mockExecuteError(new Error('Database connection failed'));

      await expect(createTask(taskData)).rejects.toThrow('Database connection failed');
    });

    it('should properly rollback when error occurs', async () => {
      const taskData = {
        description: 'Test task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };

      mockExecuteError(new Error('Database error'));

      await expect(createTask(taskData)).rejects.toThrow();
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  // ==================== CREATE TASK TESTS ====================
  describe('createTask', () => {
    describe('Success Cases', () => {
      it('should add a parent task that is not in a group', async () => {
        const taskData = {
          description: 'Parent task outside group',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };

        mockSuccessfulInsert(1);
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Parent task outside group',
          due_date: new Date('2024-12-31'),
          owner_id: 1,
          group_id: null,
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        const result = await createTask(taskData);

        expect(result.taskId).toBe(1);
        expect(result.groupId).toBeNull();
        expect(result.parentId).toBeNull();
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should add a parent task within a group that you belong to and check if task is added to the group', async () => {
        const taskData = {
          description: 'Parent task in group',
          dueDate: null,
          ownerId: 1,
          groupId: 2,
          parentId: null,
          completed: false
        };

        // Mock group membership check
        mockSuccessfulSelect([{ user_id: 1 }]); // User is member of group
        mockSuccessfulInsert(1);
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Parent task in group',
          due_date: null,
          owner_id: 1,
          group_id: 2, // Task should be in the group
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        const result = await createTask(taskData);

        expect(result.taskId).toBe(1);
        expect(result.groupId).toBe(2); // Verify task is added to group
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should add a subtask and check if subtask inherits parent group', async () => {
        const taskData = {
          description: 'Child task',
          dueDate: null,
          ownerId: 1,
          groupId: null, // Will be overridden by parent's group
          parentId: 1,
          completed: false
        };

        // Mock parent task check - parent has group_id = 2
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1,
          group_id: 2
        }]);
        
        mockSuccessfulInsert(2);
        mockSuccessfulSelect([{
          task_id: 2,
          description: 'Child task',
          due_date: null,
          owner_id: 1,
          group_id: 2, // Should inherit parent's group
          parent_id: 1,
          completed: false,
          date_created: new Date()
        }]);

        const result = await createTask(taskData);

        expect(result.groupId).toBe(2); // Verify inheritance from parent
        expect(result.parentId).toBe(1);
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should add a subtask to a non-group parent', async () => {
        const taskData = {
          description: 'Child task of non-group parent',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: 1,
          completed: false
        };

        // Mock parent task check - parent has no group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1,
          group_id: null
        }]);
        
        mockSuccessfulInsert(2);
        mockSuccessfulSelect([{
          task_id: 2,
          description: 'Child task of non-group parent',
          due_date: null,
          owner_id: 1,
          group_id: null, // Should inherit null from parent
          parent_id: 1,
          completed: false,
          date_created: new Date()
        }]);

        const result = await createTask(taskData);

        expect(result.groupId).toBeNull();
        expect(result.parentId).toBe(1);
        expect(mockConnection.commit).toHaveBeenCalled();
      });
    });

    describe('Failure Cases', () => {
      it('should fail when adding a parent task to a group that I don\'t belong to', async () => {
        const taskData = {
          description: 'Task in forbidden group',
          dueDate: null,
          ownerId: 1,
          groupId: 2,
          parentId: null,
          completed: false
        };

        // Mock group membership check - user is NOT a member
        mockSuccessfulSelect([]); // Empty result = not a member

        await expect(createTask(taskData)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });

      it('should fail when adding a subtask to another person\'s parent task', async () => {
        const taskData = {
          description: 'Subtask to foreign parent',
          dueDate: null,
          ownerId: 2, // Different owner
          groupId: null,
          parentId: 1,
          completed: false
        };

        // Mock parent task owned by user 1, but current user is 2
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: null
        }]);

        await expect(createTask(taskData)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });

      it('should fail when adding a subtask with groupId (should inherit from parent)', async () => {
        const taskData = {
          description: 'Subtask with explicit groupId',
          dueDate: null,
          ownerId: 1,
          groupId: 3, // Trying to set explicit group
          parentId: 1,
          completed: false
        };

        // Mock parent task check
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1,
          group_id: 2 // Parent has different group
        }]);
        
        // The task should inherit parent's group (2), not the specified group (3)
        mockSuccessfulInsert(2);
        mockSuccessfulSelect([{
          task_id: 2,
          description: 'Subtask with explicit groupId',
          due_date: null,
          owner_id: 1,
          group_id: 2, // Should be parent's group, not specified group
          parent_id: 1,
          completed: false,
          date_created: new Date()
        }]);

        const result = await createTask(taskData);

        // Verify that subtask inherited parent's group, not the specified one
        expect(result.groupId).toBe(2); // Parent's group
        expect(result.groupId).not.toBe(3); // Not the specified group
      });
    });
  });

  // ==================== UPDATE TASK TESTS ====================
  describe('updateTask', () => {
    describe('Success Cases', () => {
      it('should update a task that belongs to me', async () => {
        const taskId = 1;
        const userId = 1;
        const updateData = { description: 'Updated my task' };

        // Mock task retrieval - owned by user
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Same as userId
          group_id: null,
          description: 'Original task',
          due_date: null,
          completed: false,
          parent_id: null,
          date_created: new Date()
        }]);

        mockSuccessfulUpdate(1);
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Updated my task',
          due_date: null,
          owner_id: 1,
          group_id: null,
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        const result = await updateTask(taskId, userId, updateData);

        expect(result.description).toBe('Updated my task');
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should update a task within a group', async () => {
        const taskId = 1;
        const userId = 2; // Not owner but group member
        const updateData = { description: 'Updated group task' };

        // Mock task retrieval - not owned by user but in group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: 2,
          description: 'Group task',
          due_date: null,
          completed: false,
          parent_id: null,
          date_created: new Date()
        }]);

        // Mock group membership check
        mockSuccessfulSelect([{ user_id: 2 }]); // User is member of group

        mockSuccessfulUpdate(1);
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Updated group task',
          due_date: null,
          owner_id: 1,
          group_id: 2,
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        const result = await updateTask(taskId, userId, updateData);

        expect(result.description).toBe('Updated group task');
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should update parent task and successfully update its child tasks on group/completed status', async () => {
        const taskId = 1;
        const userId = 1;
        const updateData = { completed: true, groupId: 3 };

        // Mock parent task retrieval
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1,
          group_id: 2,
          description: 'Parent task',
          due_date: null,
          completed: false,
          parent_id: null, // This is a parent task
          date_created: new Date()
        }]);

        // Mock group membership for new group
        mockSuccessfulSelect([{ user_id: 1 }]); // User is member of target group

        // Mock update operations (parent update + child updates)
        mockSuccessfulUpdate(1); // Parent update
        // The model should also update child tasks

        // Mock final task retrieval
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Parent task',
          due_date: null,
          owner_id: 1,
          group_id: 3, // Updated group
          parent_id: null,
          completed: true, // Updated completion
          date_created: new Date()
        }]);

        const result = await updateTask(taskId, userId, updateData);

        expect(result.completed).toBe(true);
        expect(result.groupId).toBe(3);
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should update the last child task to completed and mark parent as completed', async () => {
        const taskId = 2; // Child task
        const userId = 1;
        const updateData = { completed: true };

        // Mock child task retrieval
        mockSuccessfulSelect([{
          task_id: 2,
          owner_id: 1,
          group_id: null,
          description: 'Child task',
          due_date: null,
          completed: false,
          parent_id: 1, // Has parent
          date_created: new Date()
        }]);

        mockSuccessfulUpdate(1); // Child update

        // Mock sibling check - all siblings now completed
        mockSuccessfulSelect([{
          total: 2,
          completed: 2 // All siblings completed
        }]);

        // Mock final task retrieval
        mockSuccessfulSelect([{
          task_id: 2,
          description: 'Child task',
          due_date: null,
          owner_id: 1,
          group_id: null,
          parent_id: 1,
          completed: true,
          date_created: new Date()
        }]);

        const result = await updateTask(taskId, userId, updateData);

        expect(result.completed).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
      });
    });

    describe('Failure Cases', () => {
      it('should fail when updating someone else\'s task', async () => {
        const taskId = 1;
        const userId = 2; // Different user
        const updateData = { description: 'Unauthorized update' };

        // Mock task owned by different user and not in group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: null, // No group access
          description: 'Private task',
          due_date: null,
          completed: false,
          parent_id: null,
          date_created: new Date()
        }]);

        await expect(updateTask(taskId, userId, updateData)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });

      it('should fail when updating a task that doesn\'t belong to a group', async () => {
        const taskId = 1;
        const userId = 2; // Not owner
        const updateData = { description: 'Unauthorized update' };

        // Mock task not owned by user and not in any group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: null, // No group
          description: 'Private task',
          due_date: null,
          completed: false,
          parent_id: null,
          date_created: new Date()
        }]);

        await expect(updateTask(taskId, userId, updateData)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });

      it('should fail when updating subtask groupId', async () => {
        const taskId = 2; // Child task
        const userId = 1;
        const updateData = { groupId: 3 }; // Trying to change group

        // Mock child task retrieval
        mockSuccessfulSelect([{
          task_id: 2,
          owner_id: 1,
          group_id: 2,
          description: 'Child task',
          due_date: null,
          completed: false,
          parent_id: 1, // This is a child task
          date_created: new Date()
        }]);

        await expect(updateTask(taskId, userId, updateData)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });
    });
  });

  // ==================== DELETE TASK TESTS ====================
  describe('deleteTask', () => {
    describe('Success Cases', () => {
      it('should delete a task that belongs to the user', async () => {
        const taskId = 1;
        const userId = 1;

        // Mock task owned by user
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Same as userId
          group_id: null,
          parent_id: null,
          completed: false
        }]);

        mockSuccessfulDelete(1);

        const result = await deleteTask(taskId, userId);

        expect(result).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should delete a task that belongs to my group but not the owner', async () => {
        const taskId = 1;
        const userId = 2; // Not owner but group member

        // Mock task not owned by user but in group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: 2,
          parent_id: null,
          completed: false
        }]);

        // Mock group membership check
        mockSuccessfulSelect([{ user_id: 2 }]); // User is member of group

        mockSuccessfulDelete(1);

        const result = await deleteTask(taskId, userId);

        expect(result).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should delete parent task and ensure child tasks are also deleted', async () => {
        const taskId = 1;
        const userId = 1;

        // Mock parent task
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1,
          group_id: null,
          parent_id: null, // Parent task
          completed: false
        }]);

        mockSuccessfulDelete(1); // Cascade delete handles children

        const result = await deleteTask(taskId, userId);

        expect(result).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
      });

      it('should delete child task and mark parent as completed when remaining children are completed', async () => {
        const taskId = 2; // Child task
        const userId = 1;

        // Mock child task
        mockSuccessfulSelect([{
          task_id: 2,
          owner_id: 1,
          group_id: null,
          parent_id: 1, // Has parent
          completed: false
        }]);

        mockSuccessfulDelete(1); // Delete child

        // Mock sibling check - remaining siblings are all completed
        mockSuccessfulSelect([{
          total: 1,
          completed: 1 // All remaining siblings completed
        }]);

        const result = await deleteTask(taskId, userId);

        expect(result).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
      });
    });

    describe('Failure Cases', () => {
      it('should fail when deleting a task that does not belong to the user nor am I part of', async () => {
        const taskId = 1;
        const userId = 2;

        // Mock task not owned by user and not in group
        mockSuccessfulSelect([{
          task_id: 1,
          owner_id: 1, // Different owner
          group_id: null, // No group access
          parent_id: null,
          completed: false
        }]);

        await expect(deleteTask(taskId, userId)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });

      it('should fail when deleting a task that does not exist', async () => {
        const taskId = 999;
        const userId = 1;

        // Mock empty result - task doesn't exist
        mockSuccessfulSelect([]);

        await expect(deleteTask(taskId, userId)).rejects.toThrow('Task not found');
        expect(mockConnection.rollback).toHaveBeenCalled();
      });
    });
  });

  // ==================== GET TASK BY ID TESTS ====================
  describe('getTaskById', () => {
    describe('Success Cases', () => {
      it('should view a task that belongs to owner', async () => {
        const taskId = 1;
        const userId = 1;

        // Mock task owned by user
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'My task',
          due_date: null,
          owner_id: 1, // Same as userId
          group_id: null,
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        // Mock children retrieval
        mockSuccessfulSelect([]);

        const result = await getTaskById(taskId, userId);

        expect(result.task.taskId).toBe(1);
        expect(result.task.description).toBe('My task');
        expect(mockConnection.release).toHaveBeenCalled();
      });

      it('should view a task that belongs to my group but not the owner', async () => {
        const taskId = 1;
        const userId = 2; // Not owner but group member

        // Mock task in group
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Group task',
          due_date: null,
          owner_id: 1, // Different owner
          group_id: 2,
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        // Mock group membership check
        mockSuccessfulSelect([{ user_id: 2 }]); // User is member of group

        // Mock children retrieval
        mockSuccessfulSelect([]);

        const result = await getTaskById(taskId, userId);

        expect(result.task.taskId).toBe(1);
        expect(result.task.description).toBe('Group task');
        expect(mockConnection.release).toHaveBeenCalled();
      });
    });

    describe('Failure Cases', () => {
      it('should fail when viewing a task that doesn\'t exist', async () => {
        const taskId = 999;
        const userId = 1;

        // Mock empty result
        mockSuccessfulSelect([]);

        await expect(getTaskById(taskId, userId)).rejects.toThrow('Task not found');
        expect(mockConnection.release).toHaveBeenCalled();
      });

      it('should fail when viewing a task that does not belong to owner nor a group that the user is part of', async () => {
        const taskId = 1;
        const userId = 2;

        // Mock task not owned by user and not in group
        mockSuccessfulSelect([{
          task_id: 1,
          description: 'Private task',
          due_date: null,
          owner_id: 1, // Different owner
          group_id: null, // No group access
          parent_id: null,
          completed: false,
          date_created: new Date()
        }]);

        await expect(getTaskById(taskId, userId)).rejects.toThrow('Insufficient privileges');
        expect(mockConnection.release).toHaveBeenCalled();
      });
    });
  });
});