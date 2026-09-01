const { verifyToken } = require('../encryptions');
const { Shop } = require('../schemas');

/**
 * Middleware to protect routes and verify JWT token from cookies or Authorization header
 * Contains structured Android vs iPhone device detection and debug logging.
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
      tokenSource = 'Cookie (req.cookies.token)';
    } 
    // 2. Fallback to Authorization header (Bearer token)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      tokenSource = 'Header (Authorization: Bearer)';
    }

    // Structured Console Debug Logging for Render Dashboard
    console.log(`\n-------------- 🛡️ AUTH CHECK [${deviceTag}] --------------`);
    console.log(`[AUTH CHECK] Method & Path : ${req.method} ${req.originalUrl}`);
    console.log(`[AUTH CHECK] Origin        : ${req.headers.origin || 'No Origin Header'}`);
    console.log(`[AUTH CHECK] Raw Cookie Hdr: ${req.headers.cookie ? 'PRESENT' : 'MISSING (No Cookie Sent!)'}`);
    console.log(`[AUTH CHECK] Parsed Cookies:`, req.cookies);
    console.log(`[AUTH CHECK] Auth Header   : ${req.headers.authorization || 'MISSING'}`);
    console.log(`[AUTH CHECK] Token Source  : ${tokenSource}`);

    if (!token || token === 'none') {
      console.log(`[AUTH CHECK ❌ FAILED] REASON: No Token provided via Cookie or Bearer Header.`);
      console.log(`-------------------------------------------------------------\n`);
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
      console.log(`[AUTH CHECK ❌ FAILED] REASON: Shop ID ${decoded.id} not found in database.`);
      console.log(`-------------------------------------------------------------\n`);
      return res.status(401).json({
        status: 'fail',
        message: 'The shop user belonging to this token no longer exists.'
      });
    }

    if (!shop.isVerified) {
      console.log(`[AUTH CHECK ❌ FAILED] REASON: Shop account is not verified.`);
      console.log(`-------------------------------------------------------------\n`);
      return res.status(401).json({
        status: 'fail',
        message: 'Shop account is not verified.'
      });
    }

    console.log(`[AUTH CHECK ✅ SUCCESS] Authenticated as: ${shop.storeName} (${shop.email})`);
    console.log(`-------------------------------------------------------------\n`);

    // Attach shop to request object
    req.shop = shop;
    req.user = shop;
    next();
  } catch (error) {
    console.log(`[AUTH CHECK ❌ FAILED] REASON: JWT Verification Error - ${error.message}`);
    console.log(`-------------------------------------------------------------\n`);
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or expired token. Please log in again.'
    });
  }
};

module.exports = {
  protect
};
