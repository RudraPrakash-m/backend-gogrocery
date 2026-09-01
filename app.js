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

// Trust reverse proxy (Required for Render, Heroku, Nginx to handle HTTPS & secure cookies)
app.set('trust proxy', 1);

// 1. Core Security Headers
app.use(helmet());

// 2. CORS Configuration
const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : true;
app.use(cors({
  origin: frontendUrl,
  credentials: true
}));

// 3. Response Compression (Gzip / Deflate for fast JSON transfers)
app.use(compression());

// 4. Request Logging (Environment-Aware)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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

// Root health route (For cloud load balancers & uptime monitors)
app.get('/health', healthController.getHealthStatus);

// API routes
app.use('/api', routes);

// 9. Catch-all 404 Handler for Undefined Routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    status: 'fail',
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found.`
  });
});

// 10. Global Error Handler
app.use(errorHandler);

module.exports = app;
