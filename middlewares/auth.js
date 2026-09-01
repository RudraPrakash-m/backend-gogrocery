const { verifyToken } = require('../encryptions');
const { Shop } = require('../schemas');

/**
 * Middleware to protect routes and verify JWT token from cookies or Authorization header
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    // Debug logs for Render Dashboard (inspect iPhone cookie / auth header delivery)
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Auth Middleware Debug] Path: ${req.originalUrl}`);
      console.log('[Auth Middleware Debug] Cookies:', req.cookies);
      console.log('[Auth Middleware Debug] Cookie Token:', req.cookies?.token);
      console.log('[Auth Middleware Debug] Auth Header:', req.headers.authorization);
    }

    // 1. Extract token from HTTP-only cookie
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // 2. Fallback to Authorization header (Bearer token)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token || token === 'none') {
      return res.status(401).json({
        status: 'fail',
        message: 'Access denied. Please log in to access this resource.'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Find shop in database
    const shop = await Shop.findById(decoded.id);

    if (!shop) {
      return res.status(401).json({
        status: 'fail',
        message: 'The shop user belonging to this token no longer exists.'
      });
    }

    if (!shop.isVerified) {
      return res.status(401).json({
        status: 'fail',
        message: 'Shop account is not verified.'
      });
    }

    // Attach shop to request object
    req.shop = shop;
    req.user = shop;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or expired token. Please log in again.'
    });
  }
};

module.exports = {
  protect
};
