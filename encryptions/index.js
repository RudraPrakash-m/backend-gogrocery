const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { decryptPayload, encryptPayload } = require('./crypto');

// Password Hashing
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Password Verification
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// JWT Token Generation
const generateToken = (payload, expiresIn = config.jwtExpire) => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
};

// JWT Token Verification
const verifyToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  decryptPayload,
  encryptPayload
};
