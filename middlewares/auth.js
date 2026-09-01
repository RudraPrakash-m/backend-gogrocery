const { verifyToken } = require('../encryptions');
const { Shop } = require('../schemas');

/**
 * Middleware to protect routes and verify JWT token from cookies or Authorization header
 * Stateless & multi-instance ready with sanitized logging.
 */
const protect = async (req, res, next) => {
  try {
    let token = null;
    let tokenSource = 'NONE';

    const userAgent = req.headers['user-agent'] || 'Unknown Agent';
    const isiPhone = /iphone|ipad|ipod/i.test(userAgent);
    const isAndroid = /android/i.test(userAgent);
    const deviceTag = isiPhone ? '📱 iPhone/iOS' : isAndroid ? '🤖 Android' : '💻 Desktop/Other';

    // 1. Extract token from HTTP-only cookie
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
      tokenSource = 'Cookie';
    } 
    // 2. Fallback to Authorization header (Bearer token)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      tokenSource = 'Bearer Header';
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Auth Check] ${req.method} ${req.originalUrl} | Device: ${deviceTag} | Source: ${tokenSource}`);
    }

    if (!token || token === 'none') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Auth Check ❌] Access denied: No token provided in Cookie or Header.`);
      }
      return res.status(401).json({
        success: false,
        status: 'fail',
        message: 'Access denied. Please log in to access this resource.'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        status: 'fail',
        message: 'Invalid or malformed authentication token.'
      });
    }

    // Find shop in database
    const shop = await Shop.findById(decoded.id);

    if (!shop) {
      return res.status(401).json({
        success: false,
        status: 'fail',
        message: 'The shop user belonging to this token no longer exists.'
      });
    }

    if (!shop.isVerified) {
      return res.status(401).json({
        success: false,
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
      success: false,
      status: 'fail',
      message: 'Invalid or expired authentication token. Please log in again.'
    });
  }
};

module.exports = {
  protect
};
