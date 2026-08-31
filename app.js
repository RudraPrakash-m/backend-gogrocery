const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const { healthController } = require('./controllers');
const { errorHandler } = require('./middlewares');

const app = express();

// Security and middleware setup
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true
}));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health route
app.get('/health', healthController.getHealthStatus);

// API routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
