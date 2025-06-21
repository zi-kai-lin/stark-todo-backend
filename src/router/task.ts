import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory } from '../utils/apiResponse';

// Import controller functions (to be implemented later)
import { 
  createTask, 
  updateTask, 
  deleteTask, 
  getTaskById, 
  getTaskComments, 
  addTaskComment,
  deleteTaskComment,
  getAssigneesAndWatchers,
  createAssignOrWatchTask,
  removeAssignOrWatchTask,

} from '../controller/task';
import { authenticator } from '../middleware/auth';


const taskRouter = express.Router();

// Apply authenticator middleware to all task routes
taskRouter.use(authenticator);
taskRouter.use(categoryMiddleware(ApiCategory.TASK));



// Basic Task CRUD operations
taskRouter.post(`/`, createTask);
taskRouter.get('/:id', getTaskById);
taskRouter.patch('/:id', updateTask);
taskRouter.delete('/:id', deleteTask);

// Task Comment Routes
taskRouter.get('/:id/comments', getTaskComments);
taskRouter.post('/:id/comments', addTaskComment);
taskRouter.delete('/:id/comments/:commentId', deleteTaskComment)

// Task Watcher Assignment
taskRouter.post('/:id/watchers/:targetUserId', createAssignOrWatchTask("watcher"));
taskRouter.delete('/:id/watchers/:targetUserId', removeAssignOrWatchTask("watcher"));

// Task Assignees Assignment
taskRouter.post('/:id/assigned/:targetUserId', createAssignOrWatchTask("assigned"));
taskRouter.delete('/:id/assigned/:targetUserId', removeAssignOrWatchTask("assigned"));

/* Get both assigned and watchers for task*/
taskRouter.get('/:id/assigneesAndWatchers', getAssigneesAndWatchers);


export { taskRouter };