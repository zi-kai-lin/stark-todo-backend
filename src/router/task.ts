import express, { Request, Response } from 'express';

// Import controller functions (to be implemented later)
import { 
  createTask, 
  updateTask, 
  deleteTask, 
  getTaskById, 
  getTaskComments, 
  addTaskComment,
  addWatcherToTask,
  addAssignedToTask,
  removeWatcherFromTask,
  removeAssignedFromTask
} from '../controller/task';
import { authenticator } from '../middleware/auth';

const taskRouter = express.Router();

// Apply authenticator middleware to all task routes
taskRouter.use(authenticator);

// Task CRUD operations
taskRouter.post('/', createTask);
taskRouter.get('/:taskId', getTaskById);
taskRouter.put('/:taskId', updateTask);
taskRouter.delete('/:taskId', deleteTask);

// Task comments
taskRouter.get('/:taskId/comments', getTaskComments);
taskRouter.post('/:taskId/comments', addTaskComment);

// Task watchers
taskRouter.post('/:taskId/watchers', addWatcherToTask);
taskRouter.delete('/:taskId/watchers/:userId', removeWatcherFromTask);

// Task assignments
taskRouter.post('/:taskId/assigned', addAssignedToTask);
taskRouter.delete('/:taskId/assigned/:userId', removeAssignedFromTask);


export { taskRouter };