import mongoose from 'mongoose';
import net from 'net';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongodInstance = null;

/**
 * Check if a TCP port is actively listening
 */
function isPortListening(port, host = '127.0.0.1', timeout = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Connect to MongoDB using environment MONGODB_URI or an embedded MongoMemoryServer
 * Ensures persistent, real Mongoose/MongoDB connection across local, testing, and cloud environments.
 */
/**
 * Extract the database name from a MongoDB URI (e.g. `.../my-db?...` -> `my-db`).
 * Falls back to `task-management` when absent or unparseable.
 */
function dbNameFromUri(uri) {
  const match = typeof uri === 'string' && uri.match(/\/([^/?]+)(\?|$)/);
  return (match && match[1]) || 'task-management';
}

export async function connectDB(uri = process.env.MONGODB_URI) {
  try {
    let connectionUri = uri;
    // Respect the DB name from MONGODB_URI (via .env) for the embedded fallback.
    const fallbackDbName = dbNameFromUri(connectionUri);

    // Check if target is a local MongoDB instance (127.0.0.1 or localhost)
    const isLocalUri =
      !connectionUri ||
      connectionUri.includes('127.0.0.1:27017') ||
      connectionUri.includes('localhost:27017');

    if (isLocalUri) {
      const isExternalMongodActive = await isPortListening(27017, '127.0.0.1');

      if (!isExternalMongodActive && !mongodInstance) {
        console.log('[Database] Starting embedded MongoDB server on port 27017...');
        try {
          mongodInstance = await MongoMemoryServer.create({
            instance: {
              port: 27017,
              dbName: fallbackDbName,
            },
          });
          connectionUri = `mongodb://127.0.0.1:27017/${fallbackDbName}`;
          console.log('[Database] Embedded MongoDB running on port 27017');
        } catch (memErr) {
          // Fallback to random available port if port 27017 cannot be bound
          console.log('[Database] Binding on dynamic port for embedded MongoDB...');
          mongodInstance = await MongoMemoryServer.create({
            instance: {
              dbName: fallbackDbName,
            },
          });
          connectionUri = mongodInstance.getUri(fallbackDbName);
        }
      } else if (!isExternalMongodActive && mongodInstance) {
        connectionUri = mongodInstance.getUri();
      }
    }

    if (!connectionUri) {
      if (!mongodInstance) {
        mongodInstance = await MongoMemoryServer.create({
          instance: { dbName: fallbackDbName },
        });
      }
      connectionUri = mongodInstance.getUri(fallbackDbName);
    }

    const conn = await mongoose.connect(connectionUri, {
      autoIndex: process.env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[Database] MongoDB Connected successfully to: ${conn.connection.host}:${conn.connection.port || 27017}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    // If connection failed, attempt recovery with dynamic memory server in non-production
    if (!mongodInstance && process.env.NODE_ENV !== 'production') {
      try {
        console.log('[Database] Recovering with embedded MongoDB instance...');
        mongodInstance = await MongoMemoryServer.create({
          instance: { dbName: 'task-management-recovery' },
        });
        const fallbackUri = mongodInstance.getUri();
        const conn = await mongoose.connect(fallbackUri);
        console.log(`[Database] Connected to recovery MongoDB at ${fallbackUri}`);
        return conn;
      } catch (fallbackError) {
        console.error(`[Database Error] Recovery failed: ${fallbackError.message}`);
        throw fallbackError;
      }
    }
    console.error(`[Database Error] Connection failed: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect and cleanup database resources
 */
export async function disconnectDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongodInstance) {
      await mongodInstance.stop();
      mongodInstance = null;
    }
    console.log('[Database] Disconnected and cleaned up.');
  } catch (error) {
    console.error(`[Database Error] Disconnection error: ${error.message}`);
  }
}

/**
 * Check if the database connection is currently active
 */
export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
