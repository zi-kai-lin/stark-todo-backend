// tests/integration/models/createTask.integration.test.ts
import { 
    
    createTask,
    updateTask,
    deleteTask,
    getTaskById



 } from '../../../src/models/task';
import { pool } from '../../../src/config/database';
import { RowDataPacket } from 'mysql2';

// Helper function to clean up database
async function cleanupDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.execute('DELETE FROM task_comments WHERE 1=1');
    await connection.execute('DELETE FROM task_assigned WHERE 1=1');
    await connection.execute('DELETE FROM task_watchers WHERE 1=1');
    await connection.execute('DELETE FROM tasks WHERE 1=1');
    await connection.execute('DELETE FROM group_members WHERE 1=1');
    await connection.execute('DELETE FROM task_groups WHERE 1=1');
    await connection.execute('DELETE FROM users WHERE 1=1');
    await connection.execute('ALTER TABLE tasks AUTO_INCREMENT = 1');
    await connection.execute('ALTER TABLE users AUTO_INCREMENT = 1');
    await connection.execute('ALTER TABLE task_groups AUTO_INCREMENT = 1');
  } finally {
    connection.release();
  }
}

// Helper function to setup test data
async function setupTestData() {

  const connection = await pool.getConnection();
  try {
    // Create test users
    await connection.execute(
      'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
      [1, 'testuser1', 'hashedpass1']
    );
    await connection.execute(
      'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
      [2, 'testuser2', 'hashedpass2']
    );

    // Create test group
    await connection.execute(
      'INSERT INTO task_groups (group_id, name, description, created_by) VALUES (?, ?, ?, ?)',
      [1, 'Test Group', 'A test group', 1]
    );

    // Add user 1 to group as admin
    await connection.execute(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [1, 1, 'admin']
    );
  } finally {
    connection.release();
  }
}


describe('CreateTask Integration Tests', () => {
  
  beforeAll(async () => {
    // Setup test database
    await cleanupDatabase();
    await setupTestData();
  });

  beforeEach(async () => {
    // Clean tasks before each test but keep users and groups
    const connection = await pool.getConnection();
    try {
      await connection.execute('DELETE FROM task_comments WHERE 1=1');
      await connection.execute('DELETE FROM task_assigned WHERE 1=1');
      await connection.execute('DELETE FROM task_watchers WHERE 1=1');
      await connection.execute('DELETE FROM tasks WHERE 1=1');
      await connection.execute('ALTER TABLE tasks AUTO_INCREMENT = 1');
    } finally {
      connection.release();
    }
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
  });

  // ==================== FAILURE CASES ====================
  describe('Failure Cases', () => {
    
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
  });
});



describe('UpdateTask Integration Tests', () => {
    
    beforeAll(async () => {
      // Setup test database
      await cleanupDatabase();
      await setupTestData();
    });
  
    beforeEach(async () => {
      // Clean tasks before each test but keep users and groups
      const connection = await pool.getConnection();
      try {
        await connection.execute('DELETE FROM task_comments WHERE 1=1');
        await connection.execute('DELETE FROM task_assigned WHERE 1=1');
        await connection.execute('DELETE FROM task_watchers WHERE 1=1');
        await connection.execute('DELETE FROM tasks WHERE 1=1');
        await connection.execute('ALTER TABLE tasks AUTO_INCREMENT = 1');
      } finally {
        connection.release();
      }
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
    });
  });


  describe('DeleteTask Integration Tests', () => {
  
    beforeAll(async () => {
      // Setup test database
      await cleanupDatabase();
      await setupTestData();
    });
  
    beforeEach(async () => {
      // Clean tasks before each test but keep users and groups
      const connection = await pool.getConnection();
      try {
        await connection.execute('DELETE FROM task_comments WHERE 1=1');
        await connection.execute('DELETE FROM task_assigned WHERE 1=1');
        await connection.execute('DELETE FROM task_watchers WHERE 1=1');
        await connection.execute('DELETE FROM tasks WHERE 1=1');
        await connection.execute('ALTER TABLE tasks AUTO_INCREMENT = 1');
      } finally {
        connection.release();
      }
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
    });
  });


  describe('GetTaskById Integration Tests', () => {
  
    beforeAll(async () => {
      // Setup test database
      await cleanupDatabase();
      await setupTestData();
    });
  
    beforeEach(async () => {
      // Clean tasks before each test but keep users and groups
      const connection = await pool.getConnection();
      try {
        await connection.execute('DELETE FROM task_comments WHERE 1=1');
        await connection.execute('DELETE FROM task_assigned WHERE 1=1');
        await connection.execute('DELETE FROM task_watchers WHERE 1=1');
        await connection.execute('DELETE FROM tasks WHERE 1=1');
        await connection.execute('ALTER TABLE tasks AUTO_INCREMENT = 1');
      } finally {
        connection.release();
      }
    });
  
    afterAll(async () => {
      // Final cleanup
      await cleanupDatabase();
      await pool.end();
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
      
      it('should retrieve a task that belongs to a group the user is a member of', async () => {
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
          description: 'Group task',
          dueDate: null,
          ownerId: 1,
          groupId: 1,
          parentId: null,
          completed: false
        };
        
        const task = await createTask(taskData);
        
        // Retrieve as user 2
        const result = await getTaskById(task.taskId!, 2);
        
        // Verify retrieval
        expect(result.task.taskId).toBe(task.taskId);
        expect(result.task.description).toBe('Group task');
        expect(result.task.ownerId).toBe(1);
        expect(result.task.groupId).toBe(1);
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
    });
  });