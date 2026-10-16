import { z } from 'zod';
import mongoose from 'mongoose';

// Validation constants
const VALID_STATUSES = ['pending', 'in-progress', 'completed'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const VALID_SORT_OPTIONS = ['newest', 'oldest', 'dueDate', 'priority'];

/**
 * Validate MongoDB ObjectId
 */
export const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}: '${id}' is not a valid MongoDB ObjectId`,
        errors: [{ field: paramName, message: 'Must be a 24-character hexadecimal string' }],
      });
    }
    next();
  };
};

/**
 * Schema for creating a task
 */
export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, 'Task title cannot be empty')
    .max(150, 'Task title cannot exceed 150 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional()
    .default(''),
  status: z.enum(VALID_STATUSES, {
    errorMap: (issue) =>
      issue.code === 'invalid_type' && issue.received === 'undefined'
        ? { message: 'Task status is required' }
        : { message: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
  }),
  priority: z.enum(VALID_PRIORITIES, {
    errorMap: (issue) =>
      issue.code === 'invalid_type' && issue.received === 'undefined'
        ? { message: 'Task priority is required' }
        : { message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
  }),
  dueDate: z
    .union(
      [
        z.string().datetime({ offset: true }),
        z.string().datetime({ offset: false }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD or ISO 8601'),
        z.date(),
      ],
      {
        errorMap: (issue) =>
          issue.code === 'invalid_type' && issue.received === 'undefined'
            ? { message: 'Due date is required (YYYY-MM-DD or ISO 8601)' }
            : { message: 'Due date is required (YYYY-MM-DD or ISO 8601)' },
      }
    )
    .transform((val, ctx) => {
      const d = val instanceof Date ? val : new Date(val);
      if (isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid dueDate: must be YYYY-MM-DD or ISO 8601' });
        return z.NEVER;
      }
      return d;
    }),
});

/**
 * Schema for updating a task
 */
export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Task title cannot be empty')
      .max(150, 'Task title cannot exceed 150 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional(),
    status: z
      .enum(VALID_STATUSES, {
        errorMap: () => ({ message: `Status must be one of: ${VALID_STATUSES.join(', ')}` }),
      })
      .optional(),
    priority: z
      .enum(VALID_PRIORITIES, {
        errorMap: () => ({ message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` }),
      })
      .optional(),
    dueDate: z
      .union([
        z.string().datetime({ offset: true }),
        z.string().datetime({ offset: false }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD or ISO 8601'),
        z.date(),
        z.null(),
        z.literal(''),
      ])
      .optional()
      .transform((val, ctx) => {
        if (val === undefined) return undefined;
        if (!val || val === '') return null;
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid dueDate: must be YYYY-MM-DD or ISO 8601' });
          return z.NEVER;
        }
        return d;
      }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

/**
 * Schema for updating task status
 */
export const updateStatusSchema = z.object({
  status: z.enum(VALID_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${VALID_STATUSES.join(', ')}` }),
  }),
});

/**
 * Schema for task query filters
 */
export const queryTaskSchema = z.object({
  search: z.string().trim().max(100, 'Search cannot exceed 100 characters').optional(),
  status: z
    .enum(['all', ...VALID_STATUSES], {
      errorMap: () => ({ message: `Invalid status filter` }),
    })
    .optional(),
  priority: z
    .enum(['all', ...VALID_PRIORITIES], {
      errorMap: () => ({ message: `Invalid priority filter` }),
    })
    .optional(),
  sort: z
    .enum(VALID_SORT_OPTIONS, {
      errorMap: () => ({ message: `Sort must be one of: ${VALID_SORT_OPTIONS.join(', ')}` }),
    })
    .optional()
    .default('newest'),
  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(1),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50),
});

/**
 * Express middleware generator for Zod schemas
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (err) {
      if (err.name === 'ZodError' || err.issues) {
        const errors = (err.errors || err.issues || []).map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }
      next(err);
    }
  };
};

/**
 * Express middleware generator for query schemas
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed;
      next();
    } catch (err) {
      if (err.name === 'ZodError' || err.issues) {
        const errors = (err.errors || err.issues || []).map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors,
        });
      }
      next(err);
    }
  };
};
