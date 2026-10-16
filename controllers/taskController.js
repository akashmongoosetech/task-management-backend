import { taskService } from '../services/taskService.js';

export const taskController = {
  /**
   * Get all tasks with query filters
   */
  async getTasks(req, res, next) {
    try {
      const { search, status, priority, sort, page, limit } = req.query;
      const { tasks, total, page: safePage, limit: safeLimit } = await taskService.getTasks({ search, status, priority, sort, page, limit });
      res.status(200).json({
        success: true,
        message: 'Tasks retrieved successfully',
        data: tasks,
        pagination: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 0 },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a single task by ID
   */
  async getTaskById(req, res, next) {
    try {
      const { id } = req.params;
      const task = await taskService.getTaskById(id);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: `Task with ID '${id}' was not found`,
          errors: [{ field: 'id', message: 'Task does not exist' }],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Task retrieved successfully',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new task
   */
  async createTask(req, res, next) {
    try {
      const task = await taskService.createTask(req.body);
      const taskId = task._id ? task._id.toString() : task.id;
      res.location(`/api/tasks/${taskId}`).status(201).json({
        success: true,
        message: 'Task created successfully',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update task fields
   */
  async updateTask(req, res, next) {
    try {
      const { id } = req.params;
      const updatedTask = await taskService.updateTask(id, req.body);
      if (!updatedTask) {
        return res.status(404).json({
          success: false,
          message: `Task with ID '${id}' was not found`,
          errors: [{ field: 'id', message: 'Task does not exist' }],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update task status
   */
  async updateTaskStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updatedTask = await taskService.updateTaskStatus(id, status);
      if (!updatedTask) {
        return res.status(404).json({
          success: false,
          message: `Task with ID '${id}' was not found`,
          errors: [{ field: 'id', message: 'Task does not exist' }],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Task status updated successfully',
        data: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a task
   */
  async deleteTask(req, res, next) {
    try {
      const { id } = req.params;
      const deletedTask = await taskService.deleteTask(id);
      if (!deletedTask) {
        return res.status(404).json({
          success: false,
          message: `Task with ID '${id}' was not found`,
          errors: [{ field: 'id', message: 'Task does not exist' }],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Task deleted successfully',
        data: {
          id: deletedTask._id.toString(),
          title: deletedTask.title,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get task counts and stats for dashboard
   */
  async getStats(req, res, next) {
    try {
      const stats = await taskService.getStats();
      res.status(200).json({
        success: true,
        message: 'Task statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
};
