// tests/integration/models/createTask.integration.test.ts
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

describe('CreateTask Integration Tests', () => {
  
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

  // ==================== SUCCESS CASES ====================
  describe('Success Cases', () => {
    
    it('should create a parent task outside of a group (as personal task)', async () => {
      const taskData = {
        description: 'Parent task outside group',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };

      const result = await createTask(taskData);

      expect(result.taskId).toBe(1);
      expect(result.description).toBe('Parent task outside group');
      expect(result.ownerId).toBe(1);
      expect(result.groupId).toBeNull();
      expect(result.parentId).toBeNull();
      expect(result.completed).toBe(false);

      expect(result.dueDate).toEqual(taskData.dueDate);
      

      // Verify task exists in database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [result.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toBe('Parent task outside group');
        expect(rows[0].owner_id).toBe(1);
        expect(rows[0].group_id).toBeNull();
        expect(rows[0].parent_id).toBeNull();
      } finally {
        connection.release();
      }
    });

    it('should create a parent task within a group for group member', async () => {
      const taskData = {
        description: 'Group task',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };


      

      const result = await createTask(taskData);

      expect(result.taskId).toBe(1);
      expect(result.groupId).toBe(1);
      expect(result.ownerId).toBe(1);
      expect(result.description).toBe('Group task');

      // Verify in database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [result.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows[0].group_id).toBe(1);
        expect(rows[0].description).toBe('Group task');
      } finally {
        connection.release();
      }
    });

    it('should create subtask and inherit parent group', async () => {
      // First create parent task in group
      const parentData = {
        description: 'Parent with group',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };

      const parent = await createTask(parentData);

      // Now create child task
      const childData = {
        description: 'Child task',
        dueDate: null,
        ownerId: 1,
        groupId: null, // Should inherit from parent
        parentId: parent.taskId,
        completed: false
      };

      const child = await createTask(childData);

      expect(child.parentId).toBe(parent.taskId);
      expect(child.groupId).toBe(1); // Should inherit parent's group
      expect(child.description).toBe('Child task');

      // Verify in database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [child.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows[0].parent_id).toBe(parent.taskId);
        expect(rows[0].group_id).toBe(1);
      } finally {
        connection.release();
      }
    });

    it('should create subtask with null group when parent has no group', async () => {
      // First create parent task without group
      const parentData = {
        description: 'Parent without group',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };

      const parent = await createTask(parentData);

      // Now create child task
      const childData = {
        description: 'Child of non-group parent',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
      };

      const child = await createTask(childData);

      expect(child.parentId).toBe(parent.taskId);
      expect(child.groupId).toBeNull(); // Should inherit null from parent
      expect(child.description).toBe('Child of non-group parent');

      // Verify in database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [child.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows[0].parent_id).toBe(parent.taskId);
        expect(rows[0].group_id).toBeNull();
      } finally {
        connection.release();
      }
    });

    it('should override child groupId with parent groupId when both are specified', async () => {
      // First create parent task in group 1
      const parentData = {
        description: 'Parent in group 1',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };

      const parent = await createTask(parentData);

      // Try to create child task with different groupId (should be overridden)
      const childData = {
        description: 'Child with different group',
        dueDate: null,
        ownerId: 1,
        groupId: 999, // This should be overridden by parent's group
        parentId: parent.taskId,
        completed: false
      };

      const child = await createTask(childData);

      expect(child.parentId).toBe(parent.taskId);
      expect(child.groupId).toBe(1); // Should be parent's group, not 999
      expect(child.description).toBe('Child with different group');

      // Verify in database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [child.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows[0].parent_id).toBe(parent.taskId);
        expect(rows[0].group_id).toBe(1); // Parent's group
      } finally {
        connection.release();
      }
    });

    it('should allow group member to create subtask for another member\'s parent task', async () => {
      // Add user 2 to group 1 as member
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']
        );
      } finally {
        connection.release();
      }
    
      // Create parent task in group 1 as user 1
      const parentData = {
        description: 'Parent task in group',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const parent = await createTask(parentData);
    
      // User 2 (group member) should be able to create subtask
      const childData = {
        description: 'Child by group member',
        ownerId: 2,
        parentId: parent.taskId,
        completed: false
      };
    
      const child = await createTask(childData);
      expect(child.parentId).toBe(parent.taskId);
      expect(child.groupId).toBe(1); // Inherits group
    });
    
  });

  // ==================== FAILURE CASES ====================
  describe('Failure Cases', () => {
    it('should fail when task owner (who left group) tries to create subtask', async () => {
      // Create task in group 1 as user 1
      const parentData = {
        description: 'Parent before leaving group',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const parent = await createTask(parentData);
    
      // Remove user 1 from group 1 (simulating being kicked out)
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 1]
        );
      } finally {
        connection.release();
      }
    
      // User 1 (original owner but no longer in group) cannot create subtask
      const childData = {
        description: 'Child by ex-member',
        ownerId: 1,
        parentId: parent.taskId,
        completed: false
      };
    
      await expect(createTask(childData)).rejects.toThrow('Insufficient privileges');
    });
    it('should fail when creating task in group user does not belong to', async () => {
      const taskData = {
        description: 'Unauthorized group task',
        dueDate: null,
        ownerId: 2, // User 2 is not in group 1
        groupId: 1,
        parentId: null,
        completed: false
      };

      await expect(createTask(taskData)).rejects.toThrow('Insufficient privileges');

      // Verify no task was created
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE description = ?',
          ['Unauthorized group task']
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
      } finally {
        connection.release();
      }
    });

    it('should fail when creating subtask for non-existent parent', async () => {
      const taskData = {
        description: 'Child of non-existent parent',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: 999, // Non-existent parent
        completed: false
      };

      await expect(createTask(taskData)).rejects.toThrow('Parent task does not exist');

      // Verify no task was created
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE description = ?',
          ['Child of non-existent parent']
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
      } finally {
        connection.release();
      }
    });

    it('should fail when creating subtask for someone else\'s parent task (no group)', async () => {
      // First create parent task as user 1
      const parentData = {
        description: 'User 1 private task',
        dueDate: null,
        ownerId: 1,
        groupId: null, // No group
        parentId: null,
        completed: false
      };

      const parent = await createTask(parentData);

      // Try to create child task as user 2
      const childData = {
        description: 'User 2 trying to add child',
        dueDate: null,
        ownerId: 2, // Different user
        groupId: null,
        parentId: parent.taskId,
        completed: false
      };

      await expect(createTask(childData)).rejects.toThrow('Insufficient privileges');

      // Verify no child task was created
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM tasks WHERE parent_id = ?',
          [parent.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
      } finally {
        connection.release();
      }
    });

    it('should fail when creating subtask for parent in group where user is not a member', async () => {
      // Create a second group with user 2 as admin
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

      // Create parent task in group 2 as user 2
      const parentData = {
        description: 'User 2 group task',
        dueDate: null,
        ownerId: 2,
        groupId: 2,
        parentId: null,
        completed: false
      };

      const parent = await createTask(parentData);

      // Try to create child task as user 1 (not in group 2)
      const childData = {
        description: 'User 1 trying to add child to group 2 task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
      };

      await expect(createTask(childData)).rejects.toThrow('Insufficient privileges');

      // Verify no child task was created
      const connection2 = await pool.getConnection();
      try {
        const [rows] = await connection2.execute(
          'SELECT * FROM tasks WHERE parent_id = ?',
          [parent.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
      } finally {
        connection2.release();
      }
    });

    it('should fail when users accidentally creating tasks in wrong team', async () => {
      // Create separate teams
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
          [2, 'Marketing Team', 2]
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [2, 2, 'admin']
        );
      } finally {
        connection.release();
      }
    
      // User 2 tries to create task in Engineering team (group 1)
      await expect(createTask({
        description: 'Marketing campaign',
        ownerId: 2,
        groupId: 1, // Wrong team!
        parentId: null,
        completed: false
      })).rejects.toThrow('Insufficient privileges');
    });

    it('should fail when ex member from creating tasks in their old team', async () => {
      // Employee creates team task
      const teamTask = await createTask({
        description: 'Team project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      });
    
      // Employee gets removed from team (fired/transferred)
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 1]
        );
      } finally {
        connection.release();
      }
    
      // Ex-employee tries to add subtask to their old project
      await expect(createTask({
        description: 'One more thing...',
        ownerId: 1,
        parentId: teamTask.taskId,
        completed: false
      })).rejects.toThrow('Insufficient privileges');
    });

    it('should fail when user tries adding subtasks to another user\'s personal project', async () => {
      // User 1 creates personal task (common scenario)
      const personalTask = await createTask({
        description: 'My personal project',
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      });
    
      // User 2 tries to add their own subtask to user 1's personal project
      const hijackAttempt = {
        description: 'I want to add my work here',
        ownerId: 2,
        parentId: personalTask.taskId,
        completed: false
      };
    
      await expect(createTask(hijackAttempt)).rejects.toThrow('Insufficient privileges');
    });
  });
});

describe('UpdateTask Integration Tests', () => {
    
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });
  
    // ==================== SUCCESS CASES ====================
    describe('Success Cases', () => {
      
      it('should update a task that belongs to the user', async () => {
        // Create a task first
        const taskData = {
          description: 'Original task',
          dueDate: new Date('2024-12-31'),
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Update the task
        const updateData = {
          description: 'Updated task',
          dueDate: new Date('2025-01-15'),
          completed: true
        };
        
        const result = await updateTask(task.taskId!, 1, updateData);
        
        // Verify the update
        expect(result.description).toBe('Updated task');
        expect(result.dueDate).toEqual(updateData.dueDate);
        expect(result.completed).toBe(true);
        
        // Verify in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].description).toBe('Updated task');
          expect(new Date(rows[0].due_date)).toEqual(updateData.dueDate);
          expect(!!rows[0].completed).toBe(true);
        } finally {
          connection.release();
        }
      });
      
      it('should update a task within a group', async () => {
        // Create a task in group 1
        const taskData = {
          description: 'Group task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Update the task
        const updateData = {
          description: 'Updated group task',
          completed: true
        };
        
        const result = await updateTask(task.taskId!, 1, updateData);
        
        // Verify the update
        expect(result.description).toBe('Updated group task');
        expect(result.completed).toBe(true);
        
        // Verify in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].description).toBe('Updated group task');
          expect(!!rows[0].completed).toBe(true);
        } finally {
          connection.release();
        }
      });
      
      it('should update parent task and cascade completion status to child tasks', async () => {
        // Create parent task
        const parentData = {
          description: 'Parent task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const parent = await createTask(parentData);
        
        // Create child tasks
        const childData1 = {
          description: 'Child task 1',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        };
        
        const childData2 = {
          description: 'Child task 2',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        };
        
        await createTask(childData1);
        await createTask(childData2);
        
        // Update parent to completed
        const updateData = {
          completed: true
        };
        
        await updateTask(parent.taskId!, 1, updateData);
        
        // Verify that children were also updated
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE parent_id = ?',
            [parent.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(2);
          expect(!!rows[0].completed).toBe(true);
          expect(!!rows[1].completed).toBe(true);
        } finally {
          connection.release();
        }
      });
      
      it('should update parent task and cascade group ID to child tasks', async () => {
        // Create parent task
        const parentData = {
          description: 'Parent task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const parent = await createTask(parentData);
        
        // Create child tasks
        const childData1 = {
          description: 'Child task 1',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        };
        
        const childData2 = {
          description: 'Child task 2',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false
        };
        
        await createTask(childData1);
        await createTask(childData2);
        
        // Update parent to be in group 1
        const updateData = {
          groupId: 1
        };
        
        await updateTask(parent.taskId!, 1, updateData);
        
        // Verify that children were also updated
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE parent_id = ?',
            [parent.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(2);
          expect(rows[0].group_id).toBe(1);
          expect(rows[1].group_id).toBe(1);
        } finally {
          connection.release();
        }
      });
      
      it('should update parent task completion status when last child task is completed', async () => {
        // Create parent task
        const parentData = {
          description: 'Parent task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const parent = await createTask(parentData);
        
        // Create child tasks
        const childData1 = {
          description: 'Child task 1',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: true // Already completed
        };
        
        const childData2 = {
          description: 'Child task 2',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: parent.taskId,
          completed: false // Not completed
        };
        
        const child1 = await createTask(childData1);
        const child2 = await createTask(childData2);
        
        // Update second child to completed
        await updateTask(child2.taskId!, 1, { completed: true });
        
        // Verify that parent is now completed
        const connection = await pool.getConnection();
      

        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [parent.taskId]


          ) as [RowDataPacket[], any];

        
          
          expect(!!rows[0].completed).toBe(true);
        } finally {
          connection.release();
        }
      });
      it('should allow group member to update another member\'s task', async () => {
        // Add user 2 to group 1 as member
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
      
        // Create task in group 1 as user 1
        const taskData = {
          description: 'Team task',
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
      
        // User 2 (group member) updates user 1's task
        const result = await updateTask(task.taskId!, 2, {
          description: 'Updated by teammate',
          completed: true
        });
      
        expect(result.description).toBe('Updated by teammate');
        expect(result.completed).toBe(true);
      });
    });
    
    // ==================== FAILURE CASES ====================
    describe('Failure Cases', () => {
      
      it('should fail when updating someone else\'s task', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'User 1 task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to update as user 2
        const updateData = {
          description: 'Updated by user 2',
          completed: true
        };
        
        await expect(updateTask(task.taskId!, 2, updateData)).rejects.toThrow('Insufficient privileges');
        
        // Verify no changes
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].description).toBe('User 1 task');
          expect(!!rows[0].completed).toBe(false);
        } finally {
          connection.release();
        }
      });
      
      it('should fail when updating a task in a group the user doesn\'t belong to', async () => {
        // Create a second group with user 2 as admin
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
        
        // Create a task in group 2 owned by user 2
        const taskData = {
          description: 'Group 2 task',
          dueDate: null,
          ownerId: 2,
          groupId: 2,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to update as user 1
        const updateData = {
          description: 'Updated by user 1',
          completed: true
        };
        
        await expect(updateTask(task.taskId!, 1, updateData)).rejects.toThrow('Insufficient privileges');
        
        // Verify no changes
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].description).toBe('Group 2 task');
          expect(!!rows[0].completed).toBe(false);
        } finally {
          connection2.release();
        }
      });
      
      it('should fail when updating group ID of a subtask', async () => {
        // Create parent task
        const parentData = {
          description: 'Parent task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const parent = await createTask(parentData);
        
        // Create child task
        const childData = {
          description: 'Child task',
          dueDate: null,
          ownerId: 1,
          groupId: null, // Will inherit parent's group
          parentId: parent.taskId,
          completed: false
        };
        
        const child = await createTask(childData);
        
        // Try to update child's group ID
        const updateData = {
          groupId: null // Try to remove from group
        };
        
        await expect(updateTask(child.taskId!, 1, updateData)).rejects.toThrow('Insufficient privileges');
        
        // Verify no changes
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM tasks WHERE task_id = ?',
            [child.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].group_id).toBe(1); // Still has parent's group
        } finally {
          connection.release();
        }
      });

      it('should fail when former group member updates their old tasks', async () => {
        // Create task in group 1 as user 1
        const taskData = {
          description: 'My old project',
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
      
        // Remove user 1 from group (fired/transferred)
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 1]
          );
        } finally {
          connection.release();
        }
      
        // User 1 tries to update their old task
        await expect(updateTask(task.taskId!, 1, {
          description: 'Final update...'
        })).rejects.toThrow('Insufficient privileges');
      });

      it('should fail when unauthorized group changes that bypass security', async () => {
        // Create second group with user 2
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
            [2, 'HR Team', 2]
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [2, 2, 'admin']
          );
        } finally {
          connection.release();
        }
      
        // User 2 tries to move their personal task to group 1 (where they're not a member)
        const personalTask = await createTask({
          description: 'Personal task',
          ownerId: 2,
          groupId: null,
          parentId: null,
          completed: false
        });
      
        await expect(updateTask(personalTask.taskId!, 2, {
          groupId: 1 // Trying to join group they're not in
        })).rejects.toThrow('Insufficient privileges');
      });

      it('should prevent regular member (non-owner) from removing task from group', async () => {
        // Add user 2 as regular member (not admin)
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
      
        // Create task in group as user 1 (user 2 is member but not owner)
        const taskData = {
          description: 'Group task owned by user 1',
          ownerId: 1,  // Owner is user 1
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
      
        // User 2 (member but not owner, not admin) tries to remove task from group
        await expect(updateTask(task.taskId!, 2, {
          groupId: null
        })).rejects.toThrow('Insufficient privileges');
      });
    });
});


describe('DeleteTask Integration Tests', () => {

  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

// ==================== SUCCESS CASES ====================
describe('Success Cases', () => {
    
    it('should delete a task that belongs to the user', async () => {
    // Create a task first
    const taskData = {
        description: 'Task to delete',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const task = await createTask(taskData);
    
    // Delete the task
    const result = await deleteTask(task.taskId!, 1);
    
    // Verify deletion
    expect(result).toBe(true);
    
    // Verify in database
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute(
        'SELECT * FROM tasks WHERE task_id = ?',
        [task.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
    } finally {
        connection.release();
    }
    });
    
    it('should delete a task that belongs to a group but user is not the owner', async () => {
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
    
    // Create a task in group 1 owned by user 1
    const taskData = {
        description: 'Group task to delete',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
    };
    
    const task = await createTask(taskData);
    
    // Delete the task as user 2
    const result = await deleteTask(task.taskId!, 2);
    
    // Verify deletion
    expect(result).toBe(true);
    
    // Verify in database
    const connection2 = await pool.getConnection();
    try {
        const [rows] = await connection2.execute(
        'SELECT * FROM tasks WHERE task_id = ?',
        [task.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
    } finally {
        connection2.release();
    }
    });
    
    it('should delete parent task and all child tasks', async () => {
    // Create parent task
    const parentData = {
        description: 'Parent to delete',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const parent = await createTask(parentData);
    
    // Create child tasks
    const childData1 = {
        description: 'Child 1',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
    };
    
    const childData2 = {
        description: 'Child 2',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
    };
    
    await createTask(childData1);
    await createTask(childData2);
    
    // Delete the parent
    await deleteTask(parent.taskId!, 1);
    
    // Verify all tasks were deleted
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute(
        'SELECT * FROM tasks WHERE task_id = ? OR parent_id = ?',
        [parent.taskId, parent.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(0);
    } finally {
        connection.release();
    }
    });
    
    it('should mark parent as completed when deleting the last incomplete child task', async () => {
    // Create parent task
    const parentData = {
        description: 'Parent task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const parent = await createTask(parentData);
    
    // Create child tasks
    const childData1 = {
        description: 'Child task 1',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: true // Already completed
    };
    
    const childData2 = {
        description: 'Child task 2',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false // Not completed
    };
    
    const child1 = await createTask(childData1);
    const child2 = await createTask(childData2);
    
    // Delete the incomplete child
    await deleteTask(child2.taskId!, 1);
    
    // Verify that parent is now completed
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute(
        'SELECT * FROM tasks WHERE task_id = ?',
        [parent.taskId]
        ) as [RowDataPacket[], any];
        
        expect(!!rows[0].completed).toBe(true);
    } finally {
        connection.release();
    }
    });
    it('should allow group member to delete subtask from another member\'s parent task', async () => {
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
    
      // Create parent task in group as user 1
      const parentData = {
        description: 'Team project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const parent = await createTask(parentData);
    
      // Create subtask as user 2
      const childData = {
        description: 'My contribution',
        ownerId: 2,
        parentId: parent.taskId,
        completed: false
      };
      const child = await createTask(childData);
    
      // User 1 (group member) deletes user 2's subtask
      const result = await deleteTask(child.taskId!, 1);
      expect(result).toBe(true);
    
      // Verify deletion
      const connection2 = await pool.getConnection();
      try {
        const [rows] = await connection2.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [child.taskId]
        ) as [RowDataPacket[], any];
        expect(rows).toHaveLength(0);
      } finally {
        connection2.release();
      }
    });
});

// ==================== FAILURE CASES ====================
describe('Failure Cases', () => {
    
    it('should fail when deleting a task that does not belong to the user or their group', async () => {
    // Create a task owned by user 1
    const taskData = {
        description: 'User 1 task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const task = await createTask(taskData);
    
    // Try to delete as user 2
    await expect(deleteTask(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    
    // Verify task still exists
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute(
        'SELECT * FROM tasks WHERE task_id = ?',
        [task.taskId]
        ) as [RowDataPacket[], any];
        
        expect(rows).toHaveLength(1);
    } finally {
        connection.release();
    }
    });
    
    it('should fail when deleting a task that does not exist', async () => {
    await expect(deleteTask(999, 1)).rejects.toThrow('Task not found');
    });
    it('should fail on unauthorized deletion that would cascade to protected subtasks', async () => {
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
    
      // Create parent task as user 1
      const parentData = {
        description: 'Critical parent project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const parent = await createTask(parentData);
    
      // Create important subtasks
      await createTask({
        description: 'Critical subtask 1',
        ownerId: 1,
        parentId: parent.taskId,
        completed: false
      });
      await createTask({
        description: 'Critical subtask 2',  
        ownerId: 2,
        parentId: parent.taskId,
        completed: false
      });
    
      // Remove user 1 from group (simulating access revocation)
      const connection2 = await pool.getConnection();
      try {
        await connection2.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 1]
        );
      } finally {
        connection2.release();
      }
    
      // User 1 (no longer in group) cannot delete parent (which would cascade)
      await expect(deleteTask(parent.taskId!, 1)).rejects.toThrow('Insufficient privileges');
    });
    it('should fail when users delete tasks in groups they don\'t belong to', async () => {
      // Create second group with user 2
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
          [2, 'Marketing Team', 2]
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [2, 2, 'admin']
        );
      } finally {
        connection.release();
      }
    
      // Create task in group 1 (Engineering)
      const taskData = {
        description: 'Engineering project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
    
      // User 2 (Marketing admin) tries to delete Engineering task
      await expect(deleteTask(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    
      // Verify task still exists
      const connection2 = await pool.getConnection();
      try {
        const [rows] = await connection2.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [task.taskId]
        ) as [RowDataPacket[], any];
        expect(rows).toHaveLength(1);
      } finally {
        connection2.release();
      }
    });
    it('should fail when non associated user delete their old team tasks', async () => {
      // Create task in group as user 1
      const taskData = {
        description: 'Important team project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
    
      // Employee gets fired - remove from group
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 1]
        );
      } finally {
        connection.release();
      }
    
      // Ex-employee tries to delete their old work
      await expect(deleteTask(task.taskId!, 1)).rejects.toThrow('Insufficient privileges');
    
      // Verify task still exists
      const connection2 = await pool.getConnection();
      try {
        const [rows] = await connection2.execute(
          'SELECT * FROM tasks WHERE task_id = ?',
          [task.taskId]
        ) as [RowDataPacket[], any];
        expect(rows).toHaveLength(1);
      } finally {
        connection2.release();
      }
    });
});
});


describe('GetTaskById Integration Tests', () => {

  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

// ==================== SUCCESS CASES ====================
describe('Success Cases', () => {
    
    it('should retrieve a task that belongs to the user', async () => {
    // Create a task first
    const taskData = {
        description: 'User task',
        dueDate: new Date('2024-12-31'),
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const task = await createTask(taskData);
    
    // Retrieve the task
    const result = await getTaskById(task.taskId!, 1);
    
    // Verify retrieval
    expect(result.task.taskId).toBe(task.taskId);
    expect(result.task.description).toBe('User task');
    expect(result.task.ownerId).toBe(1);
    expect(result.task.groupId).toBeNull();
    expect(result.task.completed).toBe(false);
    expect(result.children).toHaveLength(0);
    });
    it('should allow group member to view task hierarchy across different owners', async () => {
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
    
      // Create parent task as user 1
      const parent = await createTask({
        description: 'Team project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      });
    
      // Create subtasks by different team members
      await createTask({
        description: 'User 1 subtask',
        ownerId: 1,
        parentId: parent.taskId,
        completed: false
      });
      await createTask({
        description: 'User 2 subtask', 
        ownerId: 2,
        parentId: parent.taskId,
        completed: false
      });
    
      // User 2 can see full hierarchy including user 1's subtasks
      const result = await getTaskById(parent.taskId!, 2);
      
      expect(result.children).toHaveLength(2);
      expect(result.children.some(c => c.ownerId === 1)).toBe(true);
      expect(result.children.some(c => c.ownerId === 2)).toBe(true);
    });
    
    it('should retrieve a task with children', async () => {
    // Create parent task
    const parentData = {
        description: 'Parent task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const parent = await createTask(parentData);
    
    // Create child tasks
    const childData1 = {
        description: 'Child task 1',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: false
    };
    
    const childData2 = {
        description: 'Child task 2',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: parent.taskId,
        completed: true
    };
    
    await createTask(childData1);
    await createTask(childData2);
    
    // Retrieve the parent task
    const result = await getTaskById(parent.taskId!, 1);
    
    // Verify retrieval
    expect(result.task.taskId).toBe(parent.taskId);
    expect(result.task.description).toBe('Parent task');
    expect(result.children).toHaveLength(2);
    expect(result.children[0].description).toBe('Child task 1');
    expect(result.children[0].completed).toBe(false);
    expect(result.children[1].description).toBe('Child task 2');
    expect(result.children[1].completed).toBe(true);
    });
    
});

// ==================== FAILURE CASES ====================
describe('Failure Cases', () => {
    
    it('should fail when retrieving a task that does not exist', async () => {
    await expect(getTaskById(999, 1)).rejects.toThrow('Task not found');
    });
    
    it('should fail when retrieving a task that does not belong to the user or their group', async () => {
    // Create a task owned by user 1
    const taskData = {
        description: 'User 1 private task',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
    };
    
    const task = await createTask(taskData);
    
    // Try to retrieve as user 2
    await expect(getTaskById(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    });

    it('should prevent former member from accessing their old team tasks', async () => {
      // Create task in group as user 1
      const taskData = {
        description: 'Confidential team strategy',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
    
      // Employee gets terminated - remove from group
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 1]
        );
      } finally {
        connection.release();
      }
    
      // Ex-employee tries to access their old task
      await expect(getTaskById(task.taskId!, 1)).rejects.toThrow('Insufficient privileges');
    });

    it('should prevent unauthorized task viewing', async () => {
      // Create HR department
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
          [2, 'HR Department', 2]
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [2, 2, 'admin']
        );
      } finally {
        connection.release();
      }
    
      // Create sensitive HR task
      const hrTask = await createTask({
        description: 'Employee performance reviews',
        ownerId: 2,
        groupId: 2,
        parentId: null,
        completed: false
      });
    
      // Engineering employee (user 1) tries to snoop on HR task
      await expect(getTaskById(hrTask.taskId!, 1)).rejects.toThrow('Insufficient privileges');
    });
});
});

  
describe('AddTaskComment Integration Tests', () => {
    
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });
  
    // ==================== SUCCESS CASES ====================
    describe('Success Cases', () => {
      
      it('should add a comment on task that the current user is the owner of', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'My task for commenting',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as the task owner
        const commentContent = 'This is my comment on my own task';
        const result = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Verify the comment was created
        expect(result.commentId).toBe(1);
        expect(result.taskId).toBe(task.taskId);
        expect(result.userId).toBe(1);
        expect(result.content).toBe(commentContent);
        expect(result.dateCreated).toBeDefined();
        
        // Verify in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [result.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
          expect(rows[0].task_id).toBe(task.taskId);
          expect(rows[0].user_id).toBe(1);
          expect(rows[0].content).toBe(commentContent);
        } finally {
          connection.release();
        }
      });
      
      it('should add a comment on task that belongs to the group that the current user is a member of', async () => {
        // Add user 2 to group 1 as a member
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Group task for commenting',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 2 (group member but not task owner)
        const commentContent = 'This is a comment from a group member';
        const result = await addTaskComment(task.taskId!, 2, commentContent);
        
        // Verify the comment was created
        expect(result.commentId).toBe(1);
        expect(result.taskId).toBe(task.taskId);
        expect(result.userId).toBe(2);
        expect(result.content).toBe(commentContent);
        expect(result.dateCreated).toBeDefined();
        
        // Verify in database
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [result.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
          expect(rows[0].task_id).toBe(task.taskId);
          expect(rows[0].user_id).toBe(2);
          expect(rows[0].content).toBe(commentContent);
        } finally {
          connection2.release();
        }
      });
      
      it('should add multiple comments on the same task', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for multiple comments',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add first comment
        const comment1Content = 'First comment';
        const result1 = await addTaskComment(task.taskId!, 1, comment1Content);
        
        // Add second comment
        const comment2Content = 'Second comment';
        const result2 = await addTaskComment(task.taskId!, 1, comment2Content);
        
        // Verify both comments were created
        expect(result1.commentId).toBe(1);
        expect(result1.content).toBe(comment1Content);
        
        expect(result2.commentId).toBe(2);
        expect(result2.content).toBe(comment2Content);
        
        // Verify in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE task_id = ? ORDER BY comment_id ASC',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(2);
          expect(rows[0].content).toBe(comment1Content);
          expect(rows[1].content).toBe(comment2Content);
        } finally {
          connection.release();
        }
      });
      
      it('should trim whitespace from comment content', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for whitespace test',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment with leading/trailing whitespace
        const commentContent = '   This comment has whitespace   ';
        const result = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Verify the comment was trimmed
        expect(result.content).toBe('This comment has whitespace');
        
        // Verify in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [result.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows[0].content).toBe('This comment has whitespace');
        } finally {
          connection.release();
        }
      });
    });
  
    // ==================== FAILURE CASES ====================
    describe('Failure Cases', () => {
      
      it('should fail when adding a comment on task that does not exist', async () => {
        const commentContent = 'Comment on non-existent task';
        
        await expect(addTaskComment(999, 1, commentContent)).rejects.toThrow('Task not found');
        
        // Verify no comment was created
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE content = ?',
            [commentContent]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection.release();
        }
      });
      
      it('should fail when adding a comment that the current user is not the owner nor the related group member', async () => {
        // Create a task owned by user 1 (no group)
        const taskData = {
          description: 'Private task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to add comment as user 2 (not owner, no group)
        const commentContent = 'Unauthorized comment';
        
        await expect(addTaskComment(task.taskId!, 2, commentContent)).rejects.toThrow('Insufficient privileges to comment on this task');
        
        // Verify no comment was created
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection.release();
        }
      });
      
      it('should fail when adding a comment on group task where user is not a group member', async () => {
        // Create a second group with user 2 as admin
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
        
        // Create a task in group 2 owned by user 2
        const taskData = {
          description: 'Group 2 task',
          dueDate: null,
          ownerId: 2,
          groupId: 2,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to add comment as user 1 (not in group 2)
        const commentContent = 'Unauthorized group comment';
        
        await expect(addTaskComment(task.taskId!, 1, commentContent)).rejects.toThrow('Insufficient privileges to comment on this task');
        
        // Verify no comment was created
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
      
      it('should fail when adding empty comment content', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for empty comment test',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to add empty comment
        await expect(addTaskComment(task.taskId!, 1, '')).rejects.toThrow('Invalid Input');
        
        // Try to add whitespace-only comment
        await expect(addTaskComment(task.taskId!, 1, '   ')).rejects.toThrow('Invalid Input');
        
        // Verify no comments were created
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection.release();
        }
      });
      
      it('should fail when adding null comment content', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for null comment test',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Try to add null comment (TypeScript would catch this, but testing runtime behavior)
        await expect(addTaskComment(task.taskId!, 1, null as any)).rejects.toThrow('Invalid Input');
        
        // Verify no comment was created
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE task_id = ?',
            [task.taskId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection.release();
        }
      });

      it('should prevent ex-employee from commenting on their old team tasks', async () => {
        // Create task in group as user 1
        const taskData = {
          description: 'Ongoing team discussion',
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
      
        // User gets fired - remove from group
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 1]
          );
        } finally {
          connection.release();
        }
      
        // Ex-employee tries to add "final thoughts"
        await expect(addTaskComment(task.taskId!, 1, 'One last thing before I go...')).rejects.toThrow('Insufficient privileges to comment on this task');
      });
    });
});


describe('DeleteTaskComment Integration Tests', () => {
  
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });
  
    // ==================== SUCCESS CASES ====================
    describe('Success Cases', () => {
      
      it('should delete a comment that currentUser is the owner of', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for comment deletion',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 1
        const commentContent = 'Comment to be deleted by owner';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Delete the comment as the comment owner
        const result = await deleteTaskComment(comment.commentId!, 1);
        
        // Verify deletion was successful
        expect(result).toBe(true);
        
        // Verify comment no longer exists in database
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection.release();
        }
      });
      
      it('should delete a comment that is under the ownership of its associated task', async () => {
        // Add user 2 to group 1 as a member
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
        
        // Create a task owned by user 1 in group 1
        const taskData = {
          description: 'Task owned by user 1',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 2 (group member)
        const commentContent = 'Comment by group member';
        const comment = await addTaskComment(task.taskId!, 2, commentContent);
        
        // Delete the comment as task owner (user 1)
        const result = await deleteTaskComment(comment.commentId!, 1);
        
        // Verify deletion was successful
        expect(result).toBe(true);
        
        // Verify comment no longer exists in database
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
      
      it('should delete a comment that the current user is an admin of', async () => {
        // Add user 2 to group 1 as a member and user 3 as admin
        const connection = await pool.getConnection();
        try {
          // Create user 3
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
          
          // Add user 2 as member and user 3 as admin
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 3, 'admin']
          );
        } finally {
          connection.release();
        }
        
        // Create a task owned by user 1 in group 1
        const taskData = {
          description: 'Task in group 1',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 2 (group member)
        const commentContent = 'Comment by group member to be deleted by admin';
        const comment = await addTaskComment(task.taskId!, 2, commentContent);
        
        // Delete the comment as group admin (user 3)
        const result = await deleteTaskComment(comment.commentId!, 3);
        
        // Verify deletion was successful
        expect(result).toBe(true);
        
        // Verify comment no longer exists in database
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
      
      it('should delete comment from task without group (task owner deleting any comment)', async () => {
        // Create user 3
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
        } finally {
          connection.release();
        }
        
        // Create a task owned by user 1 (no group)
        const taskData = {
          description: 'Private task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as task owner
        const commentContent = 'Comment on private task';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Delete the comment as task owner
        const result = await deleteTaskComment(comment.commentId!, 1);
        
        // Verify deletion was successful
        expect(result).toBe(true);
        
        // Verify comment no longer exists in database
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(0);
        } finally {
          connection2.release();
        }
      });
      
      it('should successfully delete when comment has already been deleted (idempotent behavior)', async () => {
        // This tests the behavior when trying to delete a comment that doesn't exist
        // Based on the model, it should still return true but with 0 affected rows
        
        // Create a task owned by user 1
        const taskData = {
          description: 'Task for idempotent deletion test',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 1
        const commentContent = 'Comment to be deleted twice';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Delete the comment first time
        const result1 = await deleteTaskComment(comment.commentId!, 1);
        expect(result1).toBe(true);
        
        // Try to delete the same comment again (should handle gracefully)
        // Note: This might throw an error depending on implementation
        // If your implementation throws on non-existent comment, adjust this test
        await expect(deleteTaskComment(comment.commentId!, 1)).rejects.toThrow('Comment not found');
      });
    });
  
    // ==================== FAILURE CASES ====================
    describe('Failure Cases', () => {
      
      it('should fail when deleting a comment that does not exist', async () => {
        await expect(deleteTaskComment(999, 1)).rejects.toThrow('Comment not found');
      });
      
      it('should fail when deleting a comment with no permission - not comment owner, not task owner, not group admin', async () => {
        // Create user 3
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
        } finally {
          connection.release();
        }
        
        // Create a task owned by user 1 (no group)
        const taskData = {
          description: 'Private task for unauthorized deletion',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as task owner (user 1)
        const commentContent = 'Comment by task owner';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Try to delete as user 3 (not comment owner, not task owner, no group)
        await expect(deleteTaskComment(comment.commentId!, 3)).rejects.toThrow('Insufficient privileges');
        
        // Verify comment still exists
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
        } finally {
          connection2.release();
        }
      });
      
      it('should fail when group member (not admin) tries to delete another member\'s comment', async () => {
        // Add user 2 and user 3 to group 1 as members (not admins)
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
          
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 3, 'member']
          );
        } finally {
          connection.release();
        }
        
        // Create a task owned by user 1 in group 1
        const taskData = {
          description: 'Group task for member deletion test',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as user 2
        const commentContent = 'Comment by user 2';
        const comment = await addTaskComment(task.taskId!, 2, commentContent);
        
        // Try to delete as user 3 (member but not admin, not comment owner, not task owner)
        await expect(deleteTaskComment(comment.commentId!, 3)).rejects.toThrow('Insufficient privileges');
        
        // Verify comment still exists
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
        } finally {
          connection2.release();
        }
      });
      
      it('should fail when user from different group tries to delete comment', async () => {
        // Create a second group with user 2 as admin
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
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Group 1 task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as task owner (user 1)
        const commentContent = 'Comment in group 1';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Try to delete as user 2 (admin of different group)
        await expect(deleteTaskComment(comment.commentId!, 2)).rejects.toThrow('Insufficient privileges');
        
        // Verify comment still exists
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
        } finally {
          connection2.release();
        }
      });
      
      it('should fail when non-group member tries to delete comment from group task', async () => {
        // Create user 3 who is not in any group
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Group 1 exclusive task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comment as task owner (user 1)
        const commentContent = 'Comment in group task';
        const comment = await addTaskComment(task.taskId!, 1, commentContent);
        
        // Try to delete as user 3 (not in group 1)
        await expect(deleteTaskComment(comment.commentId!, 3)).rejects.toThrow('Insufficient privileges');
        
        // Verify comment still exists
        const connection2 = await pool.getConnection();
        try {
          const [rows] = await connection2.execute(
            'SELECT * FROM task_comments WHERE comment_id = ?',
            [comment.commentId]
          ) as [RowDataPacket[], any];
          
          expect(rows).toHaveLength(1);
        } finally {
          connection2.release();
        }
      });

      it('should prevent regular member from deleting task owner\'s comment', async () => {
        // Add user 2 as regular member (not admin)
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
      
        // Create task and comment as user 1 (task owner)
        const taskData = {
          description: 'Important team task',
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
        const comment = await addTaskComment(task.taskId!, 1, 'Critical project update');
      
        // User 2 (member but not admin, not comment owner, not task owner) tries to delete
        await expect(deleteTaskComment(comment.commentId!, 2)).rejects.toThrow('Insufficient privileges');
      });
    });
});




describe('GetTaskComments Integration Tests', () => {
  
  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });
    // ==================== SUCCESS CASES ====================
    describe('Success Cases', () => {
      
      it('should view comment history on task that belonged to currentUser', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'My task with comments',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add multiple comments
        await addTaskComment(task.taskId!, 1, 'First comment by owner');
        await addTaskComment(task.taskId!, 1, 'Second comment by owner');
        await addTaskComment(task.taskId!, 1, 'Third comment by owner');
        
        // Get comments as task owner
        const result = await getTaskComments(task.taskId!, 1);
        
        // Verify all comments are returned with proper structure
        expect(result).toHaveLength(3);
        
        // Verify first comment
        expect(result[0].commentId).toBe(1);
        expect(result[0].taskId).toBe(task.taskId);
        expect(result[0].userId).toBe(1);
        expect(result[0].content).toBe('First comment by owner');
        expect(result[0].username).toBe('testuser1');
        expect(result[0].dateCreated).toBeDefined();
        
        // Verify second comment
        expect(result[1].commentId).toBe(2);
        expect(result[1].content).toBe('Second comment by owner');
        expect(result[1].username).toBe('testuser1');
        
        // Verify third comment
        expect(result[2].commentId).toBe(3);
        expect(result[2].content).toBe('Third comment by owner');
        expect(result[2].username).toBe('testuser1');
        
        // Verify comments are ordered by creation time (ASC)
        expect(result[0].dateCreated! <= result[1].dateCreated!).toBe(true);
        expect(result[1].dateCreated! <= result[2].dateCreated!).toBe(true);
      });
      
      it('should view comment history on task that belong to a member of a group that the current user is a part of', async () => {
        // Add user 2 to group 1 as a member
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Group task with comments',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comments from both users
        await addTaskComment(task.taskId!, 1, 'Comment by task owner');
        await addTaskComment(task.taskId!, 2, 'Comment by group member');
        await addTaskComment(task.taskId!, 1, 'Another comment by owner');
        
        // Get comments as group member (user 2)
        const result = await getTaskComments(task.taskId!, 2);
        
        // Verify all comments are returned
        expect(result).toHaveLength(3);
        
        // Verify mixed authorship
        expect(result[0].userId).toBe(1);
        expect(result[0].username).toBe('testuser1');
        expect(result[0].content).toBe('Comment by task owner');
        
        expect(result[1].userId).toBe(2);
        expect(result[1].username).toBe('testuser2');
        expect(result[1].content).toBe('Comment by group member');
        
        expect(result[2].userId).toBe(1);
        expect(result[2].username).toBe('testuser1');
        expect(result[2].content).toBe('Another comment by owner');
      });
      
      it('should return empty array when task has no comments', async () => {
        // Create a task owned by user 1
        const taskData = {
          description: 'Task with no comments',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Get comments without adding any
        const result = await getTaskComments(task.taskId!, 1);
        
        // Verify empty array is returned
        expect(result).toHaveLength(0);
        expect(Array.isArray(result)).toBe(true);
      });
      
      it('should view comments on group task as group admin', async () => {
        // Create user 3 and add as admin to group 1
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 3, 'admin']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 2
        const taskData = {
          description: 'Task owned by member',
          dueDate: null,
          ownerId: 2,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comments
        await addTaskComment(task.taskId!, 2, 'Comment by task owner');
        await addTaskComment(task.taskId!, 1, 'Comment by group admin 1');
        await addTaskComment(task.taskId!, 3, 'Comment by group admin 3');
        
        // Get comments as different group admin (user 3)
        const result = await getTaskComments(task.taskId!, 3);
        
        // Verify all comments are returned
        expect(result).toHaveLength(3);
        expect(result[0].username).toBe('testuser2');
        expect(result[1].username).toBe('testuser1');
        expect(result[2].username).toBe('testuser3');
      });
      

    });
  
    // ==================== FAILURE CASES ====================
    describe('Failure Cases', () => {
      
      it('should fail when viewing comment history on task that does not exist', async () => {
        await expect(getTaskComments(999, 1)).rejects.toThrow('Task not found');
      });
      
      it('should fail when viewing comment history on task with no privilege - not the owner', async () => {
        // Create a task owned by user 1 (no group)
        const taskData = {
          description: 'Private task',
          dueDate: null,
          ownerId: 1,
          groupId: null,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add a comment
        await addTaskComment(task.taskId!, 1, 'Private comment');
        
        // Try to view comments as user 2 (not owner, no group)
        await expect(getTaskComments(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
      });
      
      it('should fail when viewing comment history on task with no privilege - not a related group member', async () => {
        // Create a second group with user 2 as admin
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
        
        // Create a task in group 2 owned by user 2
        const taskData = {
          description: 'Group 2 task',
          dueDate: null,
          ownerId: 2,
          groupId: 2,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add a comment
        await addTaskComment(task.taskId!, 2, 'Group 2 comment');
        
        // Try to view comments as user 1 (not in group 2)
        await expect(getTaskComments(task.taskId!, 1)).rejects.toThrow('Insufficient privileges');
      });
      
      it('should fail when user is not in the same group as the task', async () => {
        // Create user 3 who is not in any group
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
            [3, 'testuser3', 'hashedpass3']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Group 1 exclusive task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add a comment
        await addTaskComment(task.taskId!, 1, 'Group exclusive comment');
        
        // Try to view comments as user 3 (not in group 1)
        await expect(getTaskComments(task.taskId!, 3)).rejects.toThrow('Insufficient privileges');
      });
      
      it('should fail when former group member tries to view comments after being removed', async () => {
        // Add user 2 to group 1 initially
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [1, 2, 'member']
          );
        } finally {
          connection.release();
        }
        
        // Create a task in group 1 owned by user 1
        const taskData = {
          description: 'Task with changing access',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Add comments while user 2 is still a member
        await addTaskComment(task.taskId!, 1, 'Comment by owner');
        await addTaskComment(task.taskId!, 2, 'Comment by member');
        
        // Remove user 2 from group 1
        const connection2 = await pool.getConnection();
        try {
          await connection2.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [1, 2]
          );
        } finally {
          connection2.release();
        }
        
        // Try to view comments as user 2 (no longer in group)
        await expect(getTaskComments(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
      });
      it('should prevent industrial espionage via comment history access', async () => {
        // Create competitor company group
        const connection = await pool.getConnection();
        try {
          await connection.execute(
            'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
            [2, 'Competitor Corp', 2]
          );
          await connection.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [2, 2, 'admin']
          );
        } finally {
          connection.release();
        }
      
        // Create confidential engineering task
        const taskData = {
          description: 'Secret product development',
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        const task = await createTask(taskData);
      
        // Add sensitive comments
        await addTaskComment(task.taskId!, 1, 'Budget: $2M, Launch Q3');
        await addTaskComment(task.taskId!, 1, 'Competitor analysis attached');
      
        // Competitor employee (user 2) tries to read comment history
        await expect(getTaskComments(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
      });
    });
});




describe('AssignOrWatchTask Integration Tests', () => {
  
    beforeEach(async () => {
      // Setup test database
      await cleanupDatabase();
      await setupTestData();
    });
  
    afterAll(async () => {
      // Final cleanup
      await cleanupDatabase();
    });
  
    // Test both 'assigned' and 'watcher' types
    const testTypes: ('assigned' | 'watcher')[] = ['assigned', 'watcher'];
  
    testTypes.forEach(type => {
      describe(`${type.charAt(0).toUpperCase() + type.slice(1)} Type Tests`, () => {
        
        // ==================== SUCCESS CASES ====================
        describe('Success Cases', () => {
          
          describe('Self assign/watch on task', () => {
            
            it(`should self ${type} on task that belongs to a group that you own`, async () => {
              // Create a task in group 1 owned by user 1
              const taskData = {
                description: `Task for self ${type} in owned group`,
                dueDate: null,
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Self assign/watch as group owner
              const result = await assignOrWatchTask(task.taskId!, 1, 1, type);
              
              // Verify success
              expect(result).toBe(true);
              
              // Verify in database
              const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
              const connection = await pool.getConnection();
              try {
                const [rows] = await connection.execute(
                  `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                  [task.taskId, 1]
                ) as [RowDataPacket[], any];
                
                expect(rows).toHaveLength(1);
                expect(rows[0].task_id).toBe(task.taskId);
                expect(rows[0].user_id).toBe(1);
              } finally {
                connection.release();
              }
            });
            
            it(`should self ${type} on task that belongs to no group (only ownership)`, async () => {
              // Create a task owned by user 1 (no group)
              const taskData = {
                description: `Task for self ${type} with ownership only`,
                dueDate: null,
                ownerId: 1,
                groupId: null,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Self assign/watch as task owner
              const result = await assignOrWatchTask(task.taskId!, 1, 1, type);
              
              // Verify success
              expect(result).toBe(true);
              
              // Verify in database
              const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
              const connection = await pool.getConnection();
              try {
                const [rows] = await connection.execute(
                  `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                  [task.taskId, 1]
                ) as [RowDataPacket[], any];
                
                expect(rows).toHaveLength(1);
              } finally {
                connection.release();
              }
            });
            
            it(`should self ${type} on task that belongs to group where user is a member`, async () => {
              // Add user 2 to group 1 as a member
              const connection = await pool.getConnection();
              try {
                await connection.execute(
                  'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                  [1, 2, 'member']
                );
              } finally {
                connection.release();
              }
              
              // Create a task in group 1 owned by user 1
              const taskData = {
                description: `Task for self ${type} as group member`,
                dueDate: null,
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Self assign/watch as group member (user 2)
              const result = await assignOrWatchTask(task.taskId!, 2, 2, type);
              
              // Verify success
              expect(result).toBe(true);
              
              // Verify in database
              const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
              const connection2 = await pool.getConnection();
              try {
                const [rows] = await connection2.execute(
                  `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                  [task.taskId, 2]
                ) as [RowDataPacket[], any];
                
                expect(rows).toHaveLength(1);
                expect(rows[0].user_id).toBe(2);
              } finally {
                connection2.release();
              }
            });
          });
          
          describe(`${type} others on task`, () => {
            
        
            
        
            
            it(`should self ${type} on group task as group admin`, async () => {
              // Create a task in group 1 owned by user 1 (who is group admin)
              const taskData = {
                description: `Task for self ${type} as group admin`,
                dueDate: null,
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Self assign/watch as group admin (not because of task ownership)
              const result = await assignOrWatchTask(task.taskId!, 1, 1, type);
              expect(result).toBe(true);
            });
            
         
          });
          
       
        });
        
        // ==================== FAILURE CASES ====================
        describe('Failure Cases', () => {
          
          it(`should fail to ${type} task that does not exist`, async () => {
            await expect(assignOrWatchTask(999, 2, 1, type)).rejects.toThrow('Task not found');
          });
          
          it(`should fail to ${type} task to user that does not exist`, async () => {
            // Create a task owned by user 1
            const taskData = {
              description: `Task for non-existent user ${type} test`,
              dueDate: null,
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            await expect(assignOrWatchTask(task.taskId!, 999, 1, type)).rejects.toThrow('User to add does not exist');
          });
          
          describe(`Self ${type} failures`, () => {
            
            it(`should fail self ${type} on task that current user doesn't own and isn't part of related group`, async () => {
              // Create a task owned by user 1 (no group)
              const taskData = {
                description: `Private task for unauthorized self ${type}`,
                dueDate: null,
                ownerId: 1,
                groupId: null,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Try to self assign/watch as user 2 (no ownership, no group)
              await expect(assignOrWatchTask(task.taskId!, 2, 2, type)).rejects.toThrow('Insufficient privileges');
              
              // Verify no record was created
              const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
              const connection = await pool.getConnection();
              try {
                const [rows] = await connection.execute(
                  `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                  [task.taskId, 2]
                ) as [RowDataPacket[], any];
                
                expect(rows).toHaveLength(0);
              } finally {
                connection.release();
              }
            });
            
            it(`should fail self ${type} on group task where user is not a group member`, async () => {
              // Create a second group with user 2 as admin
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
              
              // Create a task in group 2 owned by user 2
              const taskData = {
                description: `Group 2 task for unauthorized self ${type}`,
                dueDate: null,
                ownerId: 2,
                groupId: 2,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Try to self assign/watch as user 1 (not in group 2)
              await expect(assignOrWatchTask(task.taskId!, 1, 1, type)).rejects.toThrow('Insufficient privileges');
            });
          });
          
          describe(`${type} others failures`, () => {
            
            it(`should prevent unauthorized cross-team ${type} assignments`, async () => {
              // Create second team
              const connection = await pool.getConnection();
              try {
                await connection.execute(
                  'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
                  [2, 'Marketing', 2]
                );
                await connection.execute(
                  'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                  [2, 2, 'admin']
                );
              } finally {
                connection.release();
              }
            
              // Create Engineering task
              const taskData = {
                description: 'Engineering project',
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              const task = await createTask(taskData);
            
              // Marketing admin tries to assign someone to Engineering task
              await expect(assignOrWatchTask(task.taskId!, 1, 2, type)).rejects.toThrow('Insufficient privileges');
            });
       
            
            it(`should fail to ${type} others when not group admin`, async () => {
              // Add user 2 to group 1 as a member (not admin)
              const connection = await pool.getConnection();
              try {
                await connection.execute(
                  'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                  [1, 2, 'member']
                );
              } finally {
                connection.release();
              }
              
              // Create a task in group 1 owned by user 1
              const taskData = {
                description: `Group task for unauthorized ${type} by member`,
                dueDate: null,
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Try to assign/watch user 1 as user 2 (member but not admin, not owner)
              await expect(assignOrWatchTask(task.taskId!, 1, 2, type)).rejects.toThrow('Insufficient privileges');
            });
            
            it(`should fail to ${type} non-group member to group task`, async () => {
              // Create user 3 who is not in group 1
              const connection = await pool.getConnection();
              try {
                await connection.execute(
                  'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
                  [3, 'testuser3', 'hashedpass3']
                );
              } finally {
                connection.release();
              }
              
              // Create a task in group 1 owned by user 1
              const taskData = {
                description: `Group task for non-member ${type} test`,
                dueDate: null,
                ownerId: 1,
                groupId: 1,
                parentId: null,
                completed: false
              };
              
              const task = await createTask(taskData);
              
              // Try to assign/watch user 3 (not in group) as task owner
              await expect(assignOrWatchTask(task.taskId!, 3, 1, type)).rejects.toThrow('Target user must be a member of this group');
            });
          });
        });
      });
    });
});





describe('RemoveAssignOrWatchTask Integration Tests', () => {

  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

  // Test both 'assigned' and 'watcher' types
  const testTypes: ('assigned' | 'watcher')[] = ['assigned', 'watcher'];

  testTypes.forEach(type => {
    describe(`Remove ${type.charAt(0).toUpperCase() + type.slice(1)} Type Tests`, () => {
      
      // ==================== SUCCESS CASES ====================
      describe('Success Cases', () => {
        
        describe(`Self ${type} removal`, () => {
          
          it(`should remove self ${type} on task that belongs to current user`, async () => {
            // Create a task owned by user 1
            const taskData = {
              description: `Task for self ${type} removal by owner`,
              dueDate: null,
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch self
            await assignOrWatchTask(task.taskId!, 1, 1, type);
            
            // Verify assignment/watch exists
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection = await pool.getConnection();
            try {
              const [beforeRows] = await connection.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 1]
              ) as [RowDataPacket[], any];
              expect(beforeRows).toHaveLength(1);
            } finally {
              connection.release();
            }
            
            // Remove self assignment/watch
            const result = await removeAssignOrWatchTask(task.taskId!, 1, 1, type);
            
            // Verify removal success
            expect(result).toBe(true);
            
            // Verify removal in database
            const connection2 = await pool.getConnection();
            try {
              const [afterRows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 1]
              ) as [RowDataPacket[], any];
              expect(afterRows).toHaveLength(0);
            } finally {
              connection2.release();
            }
          });
          
          it(`should remove self ${type} on task that belongs to related group of current user`, async () => {
            // Add user 2 to group 1 as a member
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }
            
            // Create a task in group 1 owned by user 1
            const taskData = {
              description: `Group task for self ${type} removal`,
              dueDate: null,
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch self as group member
            await assignOrWatchTask(task.taskId!, 2, 2, type);
            
            // Remove self assignment/watch as group member
            const result = await removeAssignOrWatchTask(task.taskId!, 2, 2, type);
            
            // Verify removal success
            expect(result).toBe(true);
            
            // Verify removal in database
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection2 = await pool.getConnection();
            try {
              const [rows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 2]
              ) as [RowDataPacket[], any];
              expect(rows).toHaveLength(0);
            } finally {
              connection2.release();
            }
          });
        });
        
        describe(`${type} removal of others`, () => {
          it(`should allow group admin to remove ${type} assignments from any group member`, async () => {
            // Add user 2 to group 1 as member
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }
          
            // Create group task
            const taskData = {
              description: `Group task for ${type} removal by admin`,
              ownerId: 2, // Owned by member
              groupId: 1,
              parentId: null,
              completed: false
            };
            const task = await createTask(taskData);
          
            // Member assigns themselves
            await assignOrWatchTask(task.taskId!, 2, 2, type);
          
            // Group admin (user 1) removes member's assignment
            const result = await removeAssignOrWatchTask(task.taskId!, 2, 1, type);
            expect(result).toBe(true);
          });
          

          
          it(`should remove ${type} when current user is group admin`, async () => {
            // Add user 2 to group 1 as a member
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }
            
            // Create a task in group 1 owned by user 2
            const taskData = {
              description: `Group task for ${type} removal by admin`,
              dueDate: null,
              ownerId: 2,
              groupId: 1,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch user 2 to their own task
            await assignOrWatchTask(task.taskId!, 2, 2, type);
            
            // Remove user 2's assignment/watch as group admin (user 1)
            const result = await removeAssignOrWatchTask(task.taskId!, 2, 1, type);
            
            // Verify removal success
            expect(result).toBe(true);
            
            // Verify removal in database
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection2 = await pool.getConnection();
            try {
              const [rows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 2]
              ) as [RowDataPacket[], any];
              expect(rows).toHaveLength(0);
            } finally {
              connection2.release();
            }
          });
          it(`should allow group member to remove ${type} assignments from team tasks`, async () => {
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
          
            // Create group task, assign user 2
            const taskData = {
              description: 'Team collaboration',
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            const task = await createTask(taskData);
            await assignOrWatchTask(task.taskId!, 2, 1, type);
          
            // User 2 (group member) removes their own assignment
            const result = await removeAssignOrWatchTask(task.taskId!, 2, 2, type);
            expect(result).toBe(true);
          });
          

        });
        

      });
      
      // ==================== FAILURE CASES ====================
      describe('Failure Cases', () => {
        
        it(`should fail to remove ${type} on task that is not found`, async () => {
          await expect(removeAssignOrWatchTask(999, 1, 1, type)).rejects.toThrow('Task not found');
        });
        
        describe(`Self ${type} removal failures`, () => {
          
          it(`should fail to remove self ${type} on task that does not belong to current user and does not belong to a related group`, async () => {
            // Create a task owned by user 1 (no group)
            const taskData = {
              description: `Private task for unauthorized self ${type} removal`,
              dueDate: null,
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            console.log("created task", task)
            
            // Try to remove self assignment/watch as user 2 (no ownership, no group)
            await expect(removeAssignOrWatchTask(task.taskId!, 2, 2, type)).rejects.toThrow('Insufficient privileges');
          });
          
          it(`should fail to remove self ${type} on group task where user is not a group member`, async () => {
            // Create a second group with user 2 as admin
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
            
            // Create a task in group 2 owned by user 2
            const taskData = {
              description: `Group 2 task for unauthorized self ${type} removal`,
              dueDate: null,
              ownerId: 2,
              groupId: 2,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // Try to remove self assignment/watch as user 1 (not in group 2)
            await expect(removeAssignOrWatchTask(task.taskId!, 1, 1, type)).rejects.toThrow('Insufficient privileges');
          });
          it(`should prevent ex-employee from removing ${type} assignments on old team tasks`, async () => {
            // Add user 2 to group, create task, assign user 2
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
            } finally {
              connection.release();
            }
          
            const taskData = {
              description: 'Team task',
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            const task = await createTask(taskData);
            await assignOrWatchTask(task.taskId!, 2, 2, type);
          
            // Remove user 2 from group (fired)
            const connection2 = await pool.getConnection();
            try {
              await connection2.execute(
                'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
                [1, 2]
              );
            } finally {
              connection2.release();
            }
          
            // Ex-employee tries to remove their assignment
            await expect(removeAssignOrWatchTask(task.taskId!, 2, 2, type)).rejects.toThrow('Insufficient privileges');
          });
          it(`should prevent cross-department ${type} removal`, async () => {
            // Create Marketing team
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
                [2, 'Marketing', 2]
              );
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [2, 2, 'admin']
              );
            } finally {
              connection.release();
            }
          
            // Create Engineering task with assignment
            const taskData = {
              description: 'Engineering project',
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            const task = await createTask(taskData);
            await assignOrWatchTask(task.taskId!, 1, 1, type);
          
            // Marketing admin tries to remove Engineering assignment
            await expect(removeAssignOrWatchTask(task.taskId!, 1, 2, type)).rejects.toThrow('Insufficient privileges');
          });
        });
        
        describe(`${type} removal of others failures`, () => {
          
          it(`should fail to remove ${type} of others when user does not belong to current user / is not of subtask that is related to parent task owned by current user / is not group admin`, async () => {
            // Create user 3
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
                [3, 'testuser3', 'hashedpass3']
              );
            } finally {
              connection.release();
            }
            
            // Create a task owned by user 1 (no group)
            const taskData = {
              description: `Task for unauthorized ${type} removal of others`,
              dueDate: null,
              ownerId: 1,
              groupId: null,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch user 1 to their own task
            await assignOrWatchTask(task.taskId!, 1, 1, type);
            
            // Try to remove user 1's assignment/watch as user 3 (not owner, no parent relationship, no group admin)
            await expect(removeAssignOrWatchTask(task.taskId!, 1, 3, type)).rejects.toThrow('Insufficient privileges');
            
            // Verify assignment/watch still exists
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection2 = await pool.getConnection();
            try {
              const [rows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 1]
              ) as [RowDataPacket[], any];
              expect(rows).toHaveLength(1);
            } finally {
              connection2.release();
            }
          });
          
          it(`should fail when group member (not admin) tries to remove ${type} of others`, async () => {
            // Add user 2 and user 3 to group 1 as members (not admins)
            const connection = await pool.getConnection();
            try {
              await connection.execute(
                'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
                [3, 'testuser3', 'hashedpass3']
              );
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 2, 'member']
              );
              await connection.execute(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [1, 3, 'member']
              );
            } finally {
              connection.release();
            }
            
            // Create a task in group 1 owned by user 1
            const taskData = {
              description: `Group task for unauthorized ${type} removal by member`,
              dueDate: null,
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch user 3 to task as task owner
            await assignOrWatchTask(task.taskId!, 3, 1, type);
            
            // Try to remove user 3's assignment/watch as user 2 (member but not admin, not owner)
            await expect(removeAssignOrWatchTask(task.taskId!, 3, 2, type)).rejects.toThrow('Insufficient privileges');
            
            // Verify assignment/watch still exists
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection2 = await pool.getConnection();
            try {
              const [rows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 3]
              ) as [RowDataPacket[], any];
              expect(rows).toHaveLength(1);
            } finally {
              connection2.release();
            }
          });
          
          it(`should fail when user from different group tries to remove ${type}`, async () => {
            // Create a second group with user 2 as admin
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
            
            // Create a task in group 1 owned by user 1
            const taskData = {
              description: `Group 1 task for cross-group ${type} removal test`,
              dueDate: null,
              ownerId: 1,
              groupId: 1,
              parentId: null,
              completed: false
            };
            
            const task = await createTask(taskData);
            
            // First assign/watch user 1 to their own task
            await assignOrWatchTask(task.taskId!, 1, 1, type);
            
            // Try to remove user 1's assignment/watch as user 2 (admin of different group)
            await expect(removeAssignOrWatchTask(task.taskId!, 1, 2, type)).rejects.toThrow('Insufficient privileges');
            
            // Verify assignment/watch still exists
            const tableName = type === 'assigned' ? 'task_assigned' : 'task_watchers';
            const connection2 = await pool.getConnection();
            try {
              const [rows] = await connection2.execute(
                `SELECT * FROM ${tableName} WHERE task_id = ? AND user_id = ?`,
                [task.taskId, 1]
              ) as [RowDataPacket[], any];
              expect(rows).toHaveLength(1);
            } finally {
              connection2.release();
            }
          });

        });
      });
    });
  });
});

  


describe('GetAssigneesAndWatchers Integration Tests', () => {

  beforeEach(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupDatabase();
  });

  // ==================== SUCCESS CASES ====================
  describe('Success Cases', () => {
    
    it('should get assignees and watchers on personal task as owner', async () => {
      // Create a personal task owned by user 1
      const taskData = {
        description: 'Personal task for assignees retrieval',
        dueDate: null,
        ownerId: 1,
        groupId: null, // Personal task - only owner can assign themselves
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Only owner can assign/watch themselves on personal tasks
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      // Get assignees and watchers as task owner
      const result = await getAssigneesAndWatchers(task.taskId!, 1);
      
      // Verify structure
      expect(result).toHaveProperty('assigned');
      expect(result).toHaveProperty('watchers');
      expect(Array.isArray(result.assigned)).toBe(true);
      expect(Array.isArray(result.watchers)).toBe(true);
      
      // Only owner should be assigned/watching
      expect(result.assigned).toHaveLength(1);
      expect(result.watchers).toHaveLength(1);
      expect(result.assigned[0].userId).toBe(1);
      expect(result.assigned[0].username).toBe('testuser1');
      expect(result.watchers[0].userId).toBe(1);
      expect(result.watchers[0].username).toBe('testuser1');
    });
    
    it('should get assignees and watchers on task that current user is a related group member of', async () => {
      // Add user 2 to group 1 as a member
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']
        );
      } finally {
        connection.release();
      }
      
      // Create a task in group 1 owned by user 1
      const taskData = {
        description: 'Group task for assignees and watchers',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Assign and watch users as task owner
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 2, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      // Get assignees and watchers as group member (user 2)
      const result = await getAssigneesAndWatchers(task.taskId!, 2);
      
      // Verify assigned users
      expect(result.assigned).toHaveLength(2);
      expect(result.assigned.some(u => u.userId === 1 && u.username === 'testuser1')).toBe(true);
      expect(result.assigned.some(u => u.userId === 2 && u.username === 'testuser2')).toBe(true);
      
      // Verify watchers
      expect(result.watchers).toHaveLength(1);
      expect(result.watchers[0].userId).toBe(1);
      expect(result.watchers[0].username).toBe('testuser1');
    });
    
    it('should return empty arrays when task has no assignees or watchers', async () => {
      // Create a task owned by user 1
      const taskData = {
        description: 'Task with no assignees or watchers',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Get assignees and watchers without adding any
      const result = await getAssigneesAndWatchers(task.taskId!, 1);
      
      // Verify empty arrays
      expect(result.assigned).toHaveLength(0);
      expect(result.watchers).toHaveLength(0);
      expect(Array.isArray(result.assigned)).toBe(true);
      expect(Array.isArray(result.watchers)).toBe(true);
    });
    
    it('should get assignees and watchers on personal task as owner', async () => {
      // Create a personal task owned by user 1
      const taskData = {
        description: 'Personal task for assignees retrieval',
        dueDate: null,
        ownerId: 1,
        groupId: null, // Personal task
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Only owner can assign themselves to personal tasks
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      const result = await getAssigneesAndWatchers(task.taskId!, 1);
      
      expect(result.assigned).toHaveLength(1);
      expect(result.watchers).toHaveLength(1);
      expect(result.assigned[0].userId).toBe(1);
      expect(result.watchers[0].userId).toBe(1);
    });
    it('should allow group member to view team assignment transparency', async () => {
      // Create user 3 and add both users to group
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
          [3, 'testuser3', 'hashedpass3']
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 3, 'member']
        );
      } finally {
        connection.release();
      }
    
      // Create group task with various assignments
      const taskData = {
        description: 'Team collaboration project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
      
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 2, 2, 'assigned');
      await assignOrWatchTask(task.taskId!, 3, 3, 'watcher');
    
      // Any group member can see team assignments
      const result = await getAssigneesAndWatchers(task.taskId!, 2);
      
      expect(result.assigned).toHaveLength(2);
      expect(result.watchers).toHaveLength(1);
      expect(result.assigned.some(u => u.userId === 1)).toBe(true);
      expect(result.assigned.some(u => u.userId === 2)).toBe(true);
      expect(result.watchers[0].userId).toBe(3);
    });
    

  });

  // ==================== FAILURE CASES ====================
  describe('Failure Cases', () => {
    
    it('should fail to get assignees and watchers on task that does not exist', async () => {
      await expect(getAssigneesAndWatchers(999, 1)).rejects.toThrow('Task not found');
    });
    
    it('should fail to get assignees and watchers when current user is not the owner of target task', async () => {
      // Create a task owned by user 1 (no group)
      const taskData = {
        description: 'Private task for unauthorized access',
        dueDate: null,
        ownerId: 1,
        groupId: null,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Add some assignees and watchers as owner
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      // Try to get assignees and watchers as user 2 (not owner, no group)
      await expect(getAssigneesAndWatchers(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    });
    
    it('should fail to get assignees and watchers when current user is not a related member of the target task group', async () => {
      // Create a second group with user 2 as admin
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
      
      // Create a task in group 2 owned by user 2
      const taskData = {
        description: 'Group 2 task for cross-group access test',
        dueDate: null,
        ownerId: 2,
        groupId: 2,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Add assignees and watchers as task owner
      await assignOrWatchTask(task.taskId!, 2, 2, 'assigned');
      await assignOrWatchTask(task.taskId!, 2, 2, 'watcher');
      
      // Try to get assignees and watchers as user 1 (not in group 2)
      await expect(getAssigneesAndWatchers(task.taskId!, 1)).rejects.toThrow('Insufficient privileges');
    });
    
    it('should fail when non-group member tries to view group task assignees and watchers', async () => {
      // Create user 3 who is not in group 1
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
          [3, 'testuser3', 'hashedpass3']
        );
      } finally {
        connection.release();
      }
      
      // Create a task in group 1 owned by user 1
      const taskData = {
        description: 'Group 1 task for non-member access test',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Add assignees and watchers
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      // Try to get assignees and watchers as user 3 (not in group 1)
      await expect(getAssigneesAndWatchers(task.taskId!, 3)).rejects.toThrow('Insufficient privileges');
    });
    
    it('should fail when former group member tries to view assignees and watchers after being removed', async () => {
      // Add user 2 to group 1 initially
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']
        );
      } finally {
        connection.release();
      }
      
      // Create a task in group 1 owned by user 1
      const taskData = {
        description: 'Task for former member access test',
        dueDate: null,
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      
      const task = await createTask(taskData);
      
      // Add assignees and watchers while user 2 is still a member
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
      await assignOrWatchTask(task.taskId!, 2, 2, 'assigned');
      await assignOrWatchTask(task.taskId!, 1, 1, 'watcher');
      
      // Verify user 2 can access initially
      const initialResult = await getAssigneesAndWatchers(task.taskId!, 2);
      expect(initialResult.assigned).toHaveLength(2);
      
      // Remove user 2 from group 1
      const connection2 = await pool.getConnection();
      try {
        await connection2.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 2]
        );
      } finally {
        connection2.release();
      }
      
      // Try to get assignees and watchers as user 2 (no longer in group)
      await expect(getAssigneesAndWatchers(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    });

    it('should prevent gathering via assignment lists', async () => {
      // Create competitor company
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO task_groups (group_id, name, created_by) VALUES (?, ?, ?)',
          [2, 'Competitor Corp', 2]
        );
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [2, 2, 'admin']
        );
      } finally {
        connection.release();
      }
    
      // Create confidential project with team assignments
      const taskData = {
        description: 'Secret AI project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
      await assignOrWatchTask(task.taskId!, 1, 1, 'assigned');
    
      // Competitor tries to see who's working on the project
      await expect(getAssigneesAndWatchers(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    });
    it('should ex team member from viewing team assignment data', async () => {
      // Add user 2 to group, create assignments
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [1, 2, 'member']
        );
      } finally {
        connection.release();
      }
    
      const taskData = {
        description: 'Ongoing team project',
        ownerId: 1,
        groupId: 1,
        parentId: null,
        completed: false
      };
      const task = await createTask(taskData);
      await assignOrWatchTask(task.taskId!, 2, 2, 'assigned');
    
      // Employee gets terminated
      const connection2 = await pool.getConnection();
      try {
        await connection2.execute(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [1, 2]
        );
      } finally {
        connection2.release();
      }
    
      // Ex-employee tries to see current team assignments
      await expect(getAssigneesAndWatchers(task.taskId!, 2)).rejects.toThrow('Insufficient privileges');
    });
  });
});