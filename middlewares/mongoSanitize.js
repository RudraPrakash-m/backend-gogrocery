/**
 * Express 5 compatible NoSQL Query Injection Sanitizer
 * Recursively strips keys starting with '$' or containing '.' from request body and parameters
 */
const sanitize = (val) => {
  if (!val || typeof val !== 'object') return val;

  if (Array.isArray(val)) {
    return val.map(sanitize);
  }

  for (const key of Object.keys(val)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete val[key];
    } else {
      val[key] = sanitize(val[key]);
    }
  }
  return val;
};

const mongoSanitizeMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitize(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    sanitize(req.params);
  }
  next();
};

module.exports = mongoSanitizeMiddleware;
