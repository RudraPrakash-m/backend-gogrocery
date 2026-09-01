const app = require('./app');
const config = require('./config');
const mongoose = require('mongoose');

// Safe, production-ready Mongoose connection options with connection pooling
const mongooseOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 to prevent IPv6 DNS delay and SSL handshake timeouts
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10', 10), // Connection pool limit per instance
  minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '2', 10)
};

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, mongooseOptions);
    console.log('[Database] MongoDB connected successfully');
  } catch (err) {
    console.error('[Database Error] Connection failed:', err.message);
    console.log('[Database] Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[Database Warning] Connection lost. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('[Database] Reconnected successfully!');
});

// Connect Database
connectDB();

// Start Server
const PORT = config.port;
const server = app.listen(PORT, () => {
  console.log(`[Server] Running in ${config.nodeEnv} mode on port ${PORT}`);
});

/**
 * Graceful Shutdown Handler for Render, Nginx, Docker, SIGTERM, SIGINT
 */
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

  // Force close after 10 seconds if active connections do not drain
  const forceExitTimeout = setTimeout(() => {
    console.error('[Server Error] Could not close connections in time, forcing process exit');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    console.log('[Server] HTTP server closed. Draining database connections...');
    try {
      await mongoose.connection.close(false);
      console.log('[Database] MongoDB connection pool closed cleanly.');
      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (err) {
      console.error('[Database Error] Error during MongoDB shutdown:', err.message);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  });
};

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err.message || err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process Error] Unhandled Rejection:', reason?.message || reason);
  gracefulShutdown('unhandledRejection');
});
