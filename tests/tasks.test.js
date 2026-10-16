import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Task } from '../models/Task.js';

describe('Task Manager REST API Integration Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
  });

  afterAll(async () => {
    await Task.deleteMany({});
    await disconnectDB();
  });

  beforeEach(async () => {
    await Task.deleteMany({});
  });

  // 1. Health endpoint
  it('1. GET /api/health should return 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.database).toBe('connected');
  });

  // 2. Successful task creation
  it('2. POST /api/tasks should create a task with defaults', async () => {
    const payload = {
      title: 'Complete assessment documentation',
      description: 'Document the backend architecture and video notes',
      priority: 'high',
      status: 'pending',
      dueDate: '2026-10-20',
    };

    const res = await request(app).post('/api/tasks').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe(payload.title);
    expect(res.body.data.description).toBe(payload.description);
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.status).toBe('pending'); // default
    expect(res.body.data.id).toBeDefined();
  });

  // 3. Missing title validation
  it('3. POST /api/tasks should fail with 400 when title is missing or empty', async () => {
    const res = await request(app).post('/api/tasks').send({
      description: 'Missing title task',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Validation failed');
    expect(res.body.errors.some((e) => e.field === 'title')).toBe(true);
  });

  // 4. Invalid status or priority
  it('4. POST /api/tasks should fail with 400 when status or priority is invalid', async () => {
    const res = await request(app).post('/api/tasks').send({
      title: 'Invalid task values',
      status: 'super-done',
      priority: 'ultra-high',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
  });

  // 4b. Missing due date, priority, or status
  it('4b. POST /api/tasks should fail with 400 when dueDate, priority, or status is missing', async () => {
    const noDueDate = await request(app).post('/api/tasks').send({
      title: 'Missing due date',
      priority: 'high',
      status: 'pending',
    });
    expect(noDueDate.status).toBe(400);
    expect(noDueDate.body.success).toBe(false);

    const noPriority = await request(app).post('/api/tasks').send({
      title: 'Missing priority',
      status: 'pending',
      dueDate: '2026-10-20',
    });
    expect(noPriority.status).toBe(400);
    expect(noPriority.body.success).toBe(false);

    const noStatus = await request(app).post('/api/tasks').send({
      title: 'Missing status',
      priority: 'high',
      dueDate: '2026-10-20',
    });
    expect(noStatus.status).toBe(400);
    expect(noStatus.body.success).toBe(false);
  });

  // 5. Retrieval of tasks
  it('5. GET /api/tasks should retrieve all tasks', async () => {
    await Task.create([
      { title: 'Task Alpha', priority: 'low', dueDate: new Date('2026-10-20') },
      { title: 'Task Beta', priority: 'high', dueDate: new Date('2026-10-21') },
    ]);

    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  // 6. Retrieval of a single task
  it('6. GET /api/tasks/:id should retrieve specific task by ID', async () => {
    const created = await Task.create({ title: 'Task to Find', priority: 'medium', dueDate: new Date('2026-10-20') });

    const res = await request(app).get(`/api/tasks/${created._id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Task to Find');
  });

  // 7. Update of task details
  it('7. PATCH /api/tasks/:id should update task details', async () => {
    const created = await Task.create({ title: 'Initial Title', priority: 'low', dueDate: new Date('2026-10-20') });

    const res = await request(app)
      .patch(`/api/tasks/${created._id}`)
      .send({ title: 'Updated Title', priority: 'high', description: 'Added description' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.description).toBe('Added description');
  });

  // 8. Status change
  it('8. PATCH /api/tasks/:id/status should update task status', async () => {
    const created = await Task.create({ title: 'Status Task', status: 'pending', dueDate: new Date('2026-10-20') });

    const res = await request(app)
      .patch(`/api/tasks/${created._id}/status`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
  });

  // 9. Successful deletion
  it('9. DELETE /api/tasks/:id should delete task', async () => {
    const created = await Task.create({ title: 'Task to Delete', dueDate: new Date('2026-10-20') });

    const res = await request(app).delete(`/api/tasks/${created._id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created._id.toString());

    const check = await Task.findById(created._id);
    expect(check).toBeNull();
  });

  // 10. Retrieval or update of nonexistent task
  it('10. GET and PATCH on nonexistent ID should return 404', async () => {
    const nonExistentId = '507f1f77bcf86cd799439011';
    const getRes = await request(app).get(`/api/tasks/${nonExistentId}`);
    expect(getRes.status).toBe(404);
    expect(getRes.body.success).toBe(false);

    const patchRes = await request(app)
      .patch(`/api/tasks/${nonExistentId}`)
      .send({ title: 'New Title' });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.success).toBe(false);
  });

  // 11. Invalid task ID
  it('11. /api/tasks/:id with malformed ObjectId should return 400', async () => {
    const res = await request(app).get('/api/tasks/invalid-not-hex-id');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not a valid MongoDB ObjectId');
  });

  // 12. Search and filter behavior
  it('12. GET /api/tasks with search and filters should filter correctly', async () => {
    await Task.create([
      { title: 'Buy groceries', description: 'Milk and eggs', status: 'pending', priority: 'low', dueDate: new Date('2026-10-20') },
      { title: 'Fix bug in auth', description: 'JWT expiration issue', status: 'in-progress', priority: 'high', dueDate: new Date('2026-10-21') },
      { title: 'Deploy release', description: 'Deploy to Cloud Run', status: 'completed', priority: 'high', dueDate: new Date('2026-10-22') },
    ]);

    // Search query
    const searchRes = await request(app).get('/api/tasks?search=groceries');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].title).toBe('Buy groceries');

    // Filter by status and priority
    const filterRes = await request(app).get('/api/tasks?status=in-progress&priority=high');
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data).toHaveLength(1);
    expect(filterRes.body.data[0].title).toBe('Fix bug in auth');
  });

  // 13. Sorting behavior
  it('13. GET /api/tasks with sort should sort properly', async () => {
    const t1 = await Task.create({ title: 'Task Low', priority: 'low', dueDate: new Date('2026-10-20'), createdAt: new Date('2026-01-01') });
    const t2 = await Task.create({ title: 'Task High', priority: 'high', dueDate: new Date('2026-10-21'), createdAt: new Date('2026-01-02') });

    const priorityRes = await request(app).get('/api/tasks?sort=priority');
    expect(priorityRes.status).toBe(200);
    expect(priorityRes.body.data[0].priority).toBe('high');

    const oldestRes = await request(app).get('/api/tasks?sort=oldest');
    expect(oldestRes.status).toBe(200);
    expect(oldestRes.body.data[0].title).toBe('Task Low');
  });

  // 14. Error handling for malformed requests
  it('14. PATCH /api/tasks/:id with empty payload should return 400', async () => {
    const created = await Task.create({ title: 'Task for Empty Patch', dueDate: new Date('2026-10-20') });
    const res = await request(app).patch(`/api/tasks/${created._id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
