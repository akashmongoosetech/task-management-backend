import { Task } from '../models/Task.js';

/**
 * Escape special characters in string for safe RegExp query
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Task Service handles business logic and explicit safe MongoDB queries
 */
export const taskService = {
  /**
   * Retrieve tasks with validated filtering, search, and sorting
   */
  async getTasks({ search, status, priority, sort = 'newest', page = 1, limit = 50 }) {
    const filter = {};

    // Safe Search over title and description (capped at 100 chars by validator)
    if (search && search.trim() !== '') {
      const sanitizedSearch = escapeRegex(search.trim().slice(0, 100));
      const regex = new RegExp(sanitizedSearch, 'i');
      filter.$or = [{ title: regex }, { description: regex }];
    }

    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Priority filter
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    // Pagination bounds (validator caps limit 1-100, page 1-1000)
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (safePage - 1) * safeLimit;

    // Safe sort construction
    let sortOptions = { createdAt: -1 }; // default newest
    if (sort === 'oldest') {
      sortOptions = { createdAt: 1 };
    } else if (sort === 'dueDate') {
      // Sort tasks by due date ascending (null due dates placed last)
      sortOptions = { dueDate: 1, createdAt: -1 };
    } else if (sort === 'priority') {
      // In MongoDB, we can sort or do custom order; we sort priority and createdAt
      sortOptions = { priority: 1, createdAt: -1 };
    }

    const total = await Task.countDocuments(filter).exec();
    // lean() for read-only JSON; keeps virtuals (id) via toObject transform
    const tasks = await Task.find(filter).sort(sortOptions).skip(skip).limit(safeLimit).lean({ virtuals: true }).exec();

    // If sorting by priority, we can ensure high > medium > low order
    if (sort === 'priority') {
      const priorityWeights = { high: 1, medium: 2, low: 3 };
      tasks.sort((a, b) => {
        const weightA = priorityWeights[a.priority] || 4;
        const weightB = priorityWeights[b.priority] || 4;
        if (weightA !== weightB) return weightA - weightB;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    // If sorting by dueDate, place tasks with no due date at the end
    if (sort === 'dueDate') {
      tasks.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    }

    // lean() skips toJSON transform, so ensure `id` exists for frontend contract
    for (const t of tasks) {
      if (!t.id && t._id) t.id = t._id.toString();
      delete t.__v;
    }

    return { tasks, total, page: safePage, limit: safeLimit };
  },

  /**
   * Retrieve task by ID
   */
  async getTaskById(id) {
    const task = await Task.findById(id).lean({ virtuals: true }).exec();
    if (task) {
      if (!task.id && task._id) task.id = task._id.toString();
      delete task.__v;
    }
    return task;
  },

  /**
   * Create a new task
   */
  async createTask(taskData) {
    const task = new Task({
      title: taskData.title,
      description: taskData.description || '',
      status: taskData.status,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
    });
    return await task.save();
  },

  /**
   * Update task fields (atomic to avoid lost updates)
   */
  async updateTask(id, updateData) {
    const allowed = {};
    if (updateData.title !== undefined) allowed.title = updateData.title;
    if (updateData.description !== undefined) allowed.description = updateData.description;
    if (updateData.status !== undefined) allowed.status = updateData.status;
    if (updateData.priority !== undefined) allowed.priority = updateData.priority;
    if (updateData.dueDate !== undefined) allowed.dueDate = updateData.dueDate;

    return await Task.findByIdAndUpdate(id, allowed, { new: true, runValidators: true }).exec();
  },

  /**
   * Update task status only (atomic)
   */
  async updateTaskStatus(id, status) {
    return await Task.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).exec();
  },

  /**
   * Delete a task
   */
  async deleteTask(id) {
    const task = await Task.findByIdAndDelete(id).exec();
    return task;
  },

  /**
   * Aggregate dashboard statistics
   */
  async getStats() {
    const stats = await Task.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
          inProgress: [{ $match: { status: 'in-progress' } }, { $count: 'count' }],
          completed: [{ $match: { status: 'completed' } }, { $count: 'count' }],
        },
      },
    ]);

    const result = stats[0] || {};
    return {
      total: result.total?.[0]?.count || 0,
      pending: result.pending?.[0]?.count || 0,
      inProgress: result.inProgress?.[0]?.count || 0,
      completed: result.completed?.[0]?.count || 0,
    };
  },
};
