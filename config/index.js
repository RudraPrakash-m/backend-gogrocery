// Configuration exports
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/gogrocery',
  jwtSecret: process.env.JWT_SECRET || 'default_jwt_secret',
  jwtExpire: process.env.JWT_EXPIRE || '30d',
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionSecretKey: process.env.ENCRYPTION_SECRET_KEY || 'gogrocery_crypto_secret_32bytes_key!!',
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    from: process.env.EMAIL_FROM || '"GoGrocery Team" <rudra.aashdit@gmail.com>'
  }
};
