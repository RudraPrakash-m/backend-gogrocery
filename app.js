const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const routes = require('./routes');
const { healthController } = require('./controllers');
const { errorHandler, apiLimiter, mongoSanitize } = require('./middlewares');

const app = express();

// 1. Core Security Headers
app.use(helmet());

// 2. CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true
}));

// 3. Response Compression (Gzip / Deflate for fast JSON transfers)
app.use(compression());

// 4. Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 5. Cookie Parser
app.use(cookieParser());

// 6. Body Parsers with Memory Limits (Prevent RAM denial-of-service)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 7. Data Sanitization against NoSQL query injection
app.use(mongoSanitize);

// 8. General API Rate Limiting
app.use('/api', apiLimiter);

// Root health route
app.get('/health', healthController.getHealthStatus);

// API routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
