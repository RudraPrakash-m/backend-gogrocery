const rateLimit = require('express-rate-limit');

/**
 * General API Rate Limiter (500 requests per 15 minutes)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: 'fail',
    message: 'Too many requests from this IP. Please try again later.'
  }
});

/**
 * Strict Rate Limiter for Authentication endpoints (30 requests per 15 minutes)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: 'fail',
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
  }
});

/**
 * Extra Strict Rate Limiter for OTP Generation / Resend (10 requests per 15 minutes)
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: 'fail',
    message: 'Too many OTP requests from this IP. Please wait before requesting another OTP.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  otpLimiter
};
