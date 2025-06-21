import express, { Request, Response } from 'express';
import { categoryMiddleware } from '../middleware/categoryHeader';
import { ApiCategory } from '../utils/apiResponse';
// Import controller functions
import { 
  createGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup
} from '../controller/group';
import { authenticator } from '../middleware/auth';

const groupRouter = express.Router();

// Apply authenticator middleware to all group routes
groupRouter.use(authenticator);
groupRouter.use(categoryMiddleware(ApiCategory.GROUP));

// Group operations
groupRouter.post('/', createGroup);
groupRouter.delete('/:id', deleteGroup);  // Changed from /:groupId to /:id

// Group user management
groupRouter.post('/:id/users/:targetUserId', addUserToGroup);     // Changed to match task pattern
groupRouter.delete('/:id/users/:targetUserId', removeUserFromGroup); // Changed to match task pattern

export { groupRouter };