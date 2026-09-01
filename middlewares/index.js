const { protect } = require('./auth');
const { apiLimiter, authLimiter, otpLimiter } = require('./rateLimiter');
const mongoSanitize = require('./mongoSanitize');

/**
 * Production-hardened global error handler
 * Catches database errors, validation errors, JWT auth errors, parsing errors, and uncaught exceptions.
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.name = err.name;
  error.code = err.code;

  const isProd = process.env.NODE_ENV === 'production';

  // Safe Production Logging (never log passwords, tokens, cookies, or keys)
  const logMessage = `[API Error] Path: ${req.method} ${req.originalUrl} | Status: ${error.statusCode || err.status || 500} | Error: ${error.name || 'Error'} - ${error.message}`;
  if (!isProd) {
    console.error(logMessage, '\n', err.stack || err);
  } else {
    console.error(logMessage);
  }

  // 1. Mongoose Invalid ObjectId (CastError)
  if (err.name === 'CastError') {
    error.statusCode = 400;
    error.status = 'fail';
    error.message = `Invalid resource identifier: ${err.value}`;
  }

  // 2. Mongoose Duplicate Key Error (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    error.statusCode = 400;
    error.status = 'fail';
    error.message = `A record with this ${field} '${value}' already exists.`;
  }

  // 3. Mongoose Schema Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((val) => val.message);
    error.statusCode = 400;
    error.status = 'fail';
    error.message = messages.join('. ') || 'Validation error on input data.';
  }

  // 4. JWT Verification Error
  if (err.name === 'JsonWebTokenError') {
    error.statusCode = 401;
    error.status = 'fail';
    error.message = 'Invalid authentication token. Please log in again.';
  }

  // 5. JWT Token Expired Error
  if (err.name === 'TokenExpiredError') {
    error.statusCode = 401;
    error.status = 'fail';
    error.message = 'Authentication token expired. Please log in again.';
  }

  // 6. Express Body Parser Malformed JSON Syntax Error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error.statusCode = 400;
    error.status = 'fail';
    error.message = 'Invalid JSON payload. Please check the syntax of your request body.';
  }

  const statusCode = error.statusCode || err.status || 500;
  const status = error.status || (statusCode >= 400 && statusCode < 500 ? 'fail' : 'error');

  res.status(statusCode).json({
    success: false,
    status,
    message: error.message || (statusCode === 500 ? 'Internal Server Error' : 'An unexpected error occurred.'),
    ...(!isProd && { stack: err.stack })
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
