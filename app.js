import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import taskRoutes from './routes/taskRoutes.js';
import { isDBConnected } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow Vite HMR and frontend scripts in dev/iframe
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration (split mode: frontend :5173, backend :5000)
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const defaultOrigins =
  envOrigins.length > 0 ? envOrigins : ['http://localhost:5173'];
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...defaultOrigins.filter((o) => o !== process.env.FRONTEND_URL)]
  : defaultOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Request body parsers with strict size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request logging (skip during automated test runs)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

/**
 * Health Check Endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  const dbStatus = isDBConnected() ? 'connected' : 'disconnected';
  const isHealthy = isDBConnected();

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    message: isHealthy ? 'TaskFlow API service is operational' : 'Database connection unavailable',
    data: {
      status: isHealthy ? 'UP' : 'DEGRADED',
      database: dbStatus,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

/**
 * Task API routes
 */
app.use('/api/tasks', taskRoutes);

/**
 * 404 & Centralized Error Handlers for API
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
