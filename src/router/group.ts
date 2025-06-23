import express, { Request, Response } from 'express';
import { authenticator } from '../middleware/auth';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory } from '../utils/apiResponse';


/* Route specific to Task Groups (分享任務的團隊) */


// Controller imports
import { 
  createGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup
} from '../controller/group';

const groupRouter = express.Router();

// Middleware Application
groupRouter.use(authenticator);
groupRouter.use(categoryMiddleware(ApiCategory.GROUP));

// Group Specific Operation 團隊創立刪除
groupRouter.post('/', createGroup);
groupRouter.delete('/:id', deleteGroup); 

// Group-user operations 團隊邀請 & 踢出
groupRouter.post('/:id/users/:targetUserId', addUserToGroup);   
groupRouter.delete('/:id/users/:targetUserId', removeUserFromGroup); 

export { groupRouter };