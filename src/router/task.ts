import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory } from '../utils/apiResponse';

/* Routes speicific to task (任務) */


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



// Basic Task CRUD operations 增刪改查
taskRouter.post(`/`, createTask);
taskRouter.get('/:id', getTaskById);
taskRouter.patch('/:id', updateTask);
taskRouter.delete('/:id', deleteTask);

// Task Comment Routes 評論在歷史紀錄中
taskRouter.get('/:id/comments', getTaskComments);
taskRouter.post('/:id/comments', addTaskComment);
taskRouter.delete('/:id/comments/:commentId', deleteTaskComment)

// Task Watcher Assignment 指派關注人
taskRouter.post('/:id/watchers/:targetUserId', createAssignOrWatchTask("watcher"));
taskRouter.delete('/:id/watchers/:targetUserId', removeAssignOrWatchTask("watcher"));

// Task Assignees Assignment 指派執行人
taskRouter.post('/:id/assigned/:targetUserId', createAssignOrWatchTask("assigned"));
taskRouter.delete('/:id/assigned/:targetUserId', removeAssignOrWatchTask("assigned"));

/* Get both assigned and watchers for task 查看任務執行人 & 關注人*/ 
taskRouter.get('/:id/assigneesAndWatchers', getAssigneesAndWatchers);


export { taskRouter };