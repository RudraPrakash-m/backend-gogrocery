const { protect } = require('./auth');
const { apiLimiter, authLimiter, otpLimiter } = require('./rateLimiter');
const mongoSanitize = require('./mongoSanitize');

const errorHandler = (err, req, res, next) => {
  console.error(err.stack || err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  protect,
  errorHandler,
  apiLimiter,
  authLimiter,
  otpLimiter,
  mongoSanitize
};
