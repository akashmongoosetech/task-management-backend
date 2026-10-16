import express from 'express';
import { taskController } from '../controllers/taskController.js';
import {
  validateBody,
  validateQuery,
  validateObjectId,
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  queryTaskSchema,
} from '../validators/taskValidator.js';

const router = express.Router();

/**
 * Task Routes
 * Base path: /api/tasks
 */

// Retrieve dashboard statistics
router.get('/stats', taskController.getStats);

// List tasks with optional query filters (search, status, priority, sort)
router.get('/', validateQuery(queryTaskSchema), taskController.getTasks);

// Retrieve a single task by ID
router.get('/:id', validateObjectId('id'), taskController.getTaskById);

// Create a new task
router.post('/', validateBody(createTaskSchema), taskController.createTask);

// Update task details
router.patch('/:id', validateObjectId('id'), validateBody(updateTaskSchema), taskController.updateTask);

// Update task status specifically
router.patch('/:id/status', validateObjectId('id'), validateBody(updateStatusSchema), taskController.updateTaskStatus);

// Delete task
router.delete('/:id', validateObjectId('id'), taskController.deleteTask);

export default router;
