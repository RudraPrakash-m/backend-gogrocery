const mongoose = require('mongoose');

/**
 * Lightweight health check endpoint suitable for load balancer & deployment readiness probes
 */
const getHealthStatus = (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isHealthy = dbState === 1; // 1 = connected

  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const responsePayload = {
    success: isHealthy,
    status: isHealthy ? 'success' : 'fail',
    message: isHealthy ? 'GoGrocery API Server is healthy' : 'GoGrocery API Server is degraded (Database disconnected)',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: {
      status: dbStatusMap[dbState] || 'unknown',
      readyState: dbState
    },
    environment: process.env.NODE_ENV || 'development'
  };

  res.status(isHealthy ? 200 : 503).json(responsePayload);
};

module.exports = {
  getHealthStatus
};
