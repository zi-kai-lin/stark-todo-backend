import express, { Request, Response } from 'express';

// Import controller functions (to be implemented later)
import { 
  createTask, 
  updateTask, 
  deleteTask, 
  getTaskById, 
  getTaskComments, 
  addTaskComment,
  createAssignOrWatchTask,
  removeAssignOrWatchTask,

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
taskRouter.post('/:taskId/watchers', createAssignOrWatchTask("watcher"));
taskRouter.delete('/:taskId/watchers/:userId', removeAssignOrWatchTask("watcher"));

// Task assignments
taskRouter.post('/:taskId/assigned', createAssignOrWatchTask("assigned"));
taskRouter.delete('/:taskId/assigned/:userId', removeAssignOrWatchTask("watcher"));


export { taskRouter };