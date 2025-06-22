// Mock the database module BEFORE importing anything that uses it
jest.mock('../../../src/config/database', () => ({
    pool: require('../../mock/database').mockPool,
    testConnection: jest.fn().mockResolvedValue(undefined),
    initializeDatabase: jest.fn().mockResolvedValue(undefined)
  }));
  
  // Now import the models and helpers
  import { createTask, updateTask, deleteTask, getTaskById } from '../../../src/models/task';
  import { 
    mockConnection, 
    mockPool,
    mockSuccessfulInsert, 
    mockSuccessfulSelect, 
    mockSuccessfulUpdate,
    mockSuccessfulDelete,
    mockExecuteError,
    createMockRowDataPacket,
    resetMocks
  } from '../../mock/database';
  
  describe('Task Model - Comprehensive Tests', () => {
    
    beforeEach(() => {
      resetMocks();
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
    
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
  
          // Setup mocks for the sequence of operations
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock the INSERT operation
          mockSuccessfulInsert(1);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
          
          // Mock the SELECT to fetch the created task
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
  
        it('should add a parent task within a group that you belong to', async () => {
          const taskData = {
            description: 'Parent task in group',
            dueDate: null,
            ownerId: 1,
            groupId: 2,
            parentId: null,
            completed: false
          };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock group membership check - user is member of group
          mockSuccessfulSelect([{ user_id: 1 }]); 
          
          // Mock INSERT
          mockSuccessfulInsert(1);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
          
          // Mock SELECT for created task
          mockSuccessfulSelect([{
            task_id: 1,
            description: 'Parent task in group',
            due_date: null,
            owner_id: 1,
            group_id: 2,
            parent_id: null,
            completed: false,
            date_created: new Date()
          }]);
  
          const result = await createTask(taskData);
  
          expect(result.taskId).toBe(1);
          expect(result.groupId).toBe(2);
          expect(mockConnection.commit).toHaveBeenCalled();
        });
  
        it('should add a subtask and check if subtask inherits parent group', async () => {
          const taskData = {
            description: 'Child task',
            dueDate: null,
            ownerId: 1,
            groupId: null,
            parentId: 1,
            completed: false
          };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock parent task check - parent has group_id = 2
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: 2
          }]);
          
          // Mock checkTaskPrivilege checks
          // First check: owner privilege
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: 2
          }]);
          
          // Mock INSERT
          mockSuccessfulInsert(2);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
          
          // Mock SELECT for created task
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
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock group membership check - user is NOT a member
          mockSuccessfulSelect([]); // Empty result = not a member
          
          mockConnection.rollback.mockResolvedValueOnce(undefined);
  
          await expect(createTask(taskData)).rejects.toThrow('Insufficient privileges');
          expect(mockConnection.rollback).toHaveBeenCalled();
        });
  
        it('should fail when adding a subtask to another person\'s parent task', async () => {
          const taskData = {
            description: 'Subtask to foreign parent',
            dueDate: null,
            ownerId: 2,
            groupId: null,
            parentId: 1,
            completed: false
          };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock parent task owned by user 1, but current user is 2
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1, // Different owner
            group_id: null
          }]);
          
          // Mock checkTaskPrivilege - owner check fails
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
          
          // Mock checkTaskPrivilege - member check (no group, so fails)
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
          
          mockConnection.rollback.mockResolvedValueOnce(undefined);
  
          await expect(createTask(taskData)).rejects.toThrow('Insufficient privileges');
          expect(mockConnection.rollback).toHaveBeenCalled();
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
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock task retrieval - owned by user
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null,
            description: 'Original task',
            due_date: null,
            completed: false,
            parent_id: null,
            date_created: new Date()
          }]);
          
          // Mock checkTaskPrivilege - owner check succeeds
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
  
          // Mock UPDATE
          mockSuccessfulUpdate(1);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
          
          // Mock final SELECT
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
  
        it('should update parent task and cascade updates to children', async () => {
          const taskId = 1;
          const userId = 1;
          const updateData = { completed: true, groupId: 3 };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock parent task retrieval
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: 2,
            description: 'Parent task',
            due_date: null,
            completed: false,
            parent_id: null,
            date_created: new Date()
          }]);
          
          // Mock owner privilege check
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: 2
          }]);
          
          // Mock group membership check for new group
          mockSuccessfulSelect([{ user_id: 1 }]);
  
          // Mock parent UPDATE
          mockSuccessfulUpdate(1);
          
          // Mock cascade UPDATE for group change
          mockSuccessfulUpdate(2); // Assuming 2 child tasks updated
          
          // Mock cascade UPDATE for completion status
          mockSuccessfulUpdate(2); // Assuming 2 child tasks updated
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
          
          // Mock final SELECT
          mockSuccessfulSelect([{
            task_id: 1,
            description: 'Parent task',
            due_date: null,
            owner_id: 1,
            group_id: 3,
            parent_id: null,
            completed: true,
            date_created: new Date()
          }]);
  
          const result = await updateTask(taskId, userId, updateData);
  
          expect(result.completed).toBe(true);
          expect(result.groupId).toBe(3);
          expect(mockConnection.commit).toHaveBeenCalled();
        });
      });
  
      describe('Failure Cases', () => {
        it('should fail when updating someone else\'s task', async () => {
          const taskId = 1;
          const userId = 2;
          const updateData = { description: 'Unauthorized update' };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock task owned by different user
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null,
            description: 'Private task',
            due_date: null,
            completed: false,
            parent_id: null,
            date_created: new Date()
          }]);
          
          // Mock checkTaskPrivilege - owner check fails
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
          
          // Mock checkTaskPrivilege - member check fails (no group)
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
          
          mockConnection.rollback.mockResolvedValueOnce(undefined);
  
          await expect(updateTask(taskId, userId, updateData)).rejects.toThrow('Insufficient privileges');
          expect(mockConnection.rollback).toHaveBeenCalled();
        });
  
        it('should fail when updating subtask groupId', async () => {
          const taskId = 2;
          const userId = 1;
          const updateData = { groupId: 3 };
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
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
          
          mockConnection.rollback.mockResolvedValueOnce(undefined);
  
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
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock task owned by user
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null,
            parent_id: null,
            completed: false
          }]);
          
          // Mock checkTaskPrivilege - owner check
          mockSuccessfulSelect([{
            task_id: 1,
            owner_id: 1,
            group_id: null
          }]);
  
          // Mock DELETE
          mockSuccessfulDelete(1);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
  
          const result = await deleteTask(taskId, userId);
  
          expect(result).toBe(true);
          expect(mockConnection.commit).toHaveBeenCalled();
        });
  
        it('should delete child task and update parent completion status', async () => {
          const taskId = 2;
          const userId = 1;
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock child task
          mockSuccessfulSelect([{
            task_id: 2,
            owner_id: 1,
            group_id: null,
            parent_id: 1,
            completed: false
          }]);
          
          // Mock checkTaskPrivilege - owner check
          mockSuccessfulSelect([{
            task_id: 2,
            owner_id: 1,
            group_id: null
          }]);
  
          // Mock DELETE
          mockSuccessfulDelete(1);
  
          // Mock sibling check - all remaining completed
          mockSuccessfulSelect([{
            total: 1,
            completed: 1
          }]);
          
          // Mock UPDATE parent to completed
          mockSuccessfulUpdate(1);
          
          mockConnection.commit.mockResolvedValueOnce(undefined);
  
          const result = await deleteTask(taskId, userId);
  
          expect(result).toBe(true);
          expect(mockConnection.commit).toHaveBeenCalled();
        });
      });
  
      describe('Failure Cases', () => {
        it('should fail when deleting a task that does not exist', async () => {
          const taskId = 999;
          const userId = 1;
  
          mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
          
          // Mock empty result - task doesn't exist
          mockSuccessfulSelect([]);
          
          mockConnection.rollback.mockResolvedValueOnce(undefined);
  
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
            owner_id: 1,
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
  
        it('should view a task with children', async () => {
          const taskId = 1;
          const userId = 1;
  
          // Mock parent task
          mockSuccessfulSelect([{
            task_id: 1,
            description: 'Parent task',
            due_date: null,
            owner_id: 1,
            group_id: null,
            parent_id: null,
            completed: false,
            date_created: new Date()
          }]);
  
          // Mock children retrieval
          mockSuccessfulSelect([
            {
              task_id: 2,
              description: 'Child task 1',
              due_date: null,
              owner_id: 1,
              group_id: null,
              parent_id: 1,
              completed: false,
              date_created: new Date()
            },
            {
              task_id: 3,
              description: 'Child task 2',
              due_date: null,
              owner_id: 1,
              group_id: null,
              parent_id: 1,
              completed: true,
              date_created: new Date()
            }
          ]);
  
          const result = await getTaskById(taskId, userId);
  
          expect(result.task.taskId).toBe(1);
          expect(result.children).toHaveLength(2);
          expect(result.children[0].description).toBe('Child task 1');
          expect(result.children[1].description).toBe('Child task 2');
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
  
        it('should fail when viewing a private task', async () => {
          const taskId = 1;
          const userId = 2;
  
          // Mock task not owned by user and not in group
          mockSuccessfulSelect([{
            task_id: 1,
            description: 'Private task',
            due_date: null,
            owner_id: 1,
            group_id: null,
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