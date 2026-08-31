const crypto = require('crypto');
const config = require('../config');

/**
 * Normalizes a secret key to 32 bytes for AES-256
 */
const getEncryptionKey = () => {
  return crypto.createHash('sha256').update(String(config.encryptionSecretKey)).digest();
};

/**
 * Decrypts CryptoJS default OpenSSL format (CryptoJS.AES.encrypt(text, password).toString())
 */
const decryptCryptoJS = (base64Str, passphrase) => {
  const cipherBuffer = Buffer.from(base64Str, 'base64');

  // Check OpenSSL header "Salted__"
  if (cipherBuffer.subarray(0, 8).toString('utf8') !== 'Salted__') {
    throw new Error('Not OpenSSL salted format');
  }

  const salt = cipherBuffer.subarray(8, 16);
  const ciphertext = cipherBuffer.subarray(16);

  // EVP_BytesToKey MD5 derivation (Standard OpenSSL method used by CryptoJS)
  const passwordBuf = Buffer.from(passphrase, 'utf8');
  let hashBuffer = Buffer.alloc(0);
  let currentHash = Buffer.alloc(0);

  while (hashBuffer.length < 48) { // 32 bytes key + 16 bytes IV
    const md5 = crypto.createHash('md5');
    md5.update(currentHash);
    md5.update(passwordBuf);
    md5.update(salt);
    currentHash = md5.digest();
    hashBuffer = Buffer.concat([hashBuffer, currentHash]);
  }

  const key = hashBuffer.subarray(0, 32);
  const iv = hashBuffer.subarray(32, 48);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Decrypts encrypted payload from frontend.
 * Universally supports:
 * 1. CryptoJS default string: "U2FsdGVkX1..." (OpenSSL format)
 * 2. Object with encrypted data: { encryptedData: "U2FsdGVkX1..." } or { data: "U2FsdGVkX1..." } or { cipherText: "U2FsdGVkX1..." }
 * 3. Custom Hex object: { iv, encryptedData }
 * 4. Combined Hex string: "ivHex:encryptedHex"
 * 5. Unencrypted object / JSON string (pass-through)
 */
const decryptPayload = (payload) => {
  try {
    if (!payload) return null;

    // 1. Pass-through plain objects if already unencrypted
    if (typeof payload === 'object' && 
        !payload.encryptedData && 
        !payload.ciphertext && 
        !payload.cipherText && 
        !payload.data && 
        (payload.storeName || payload.email || payload.phone || payload.shopCode || payload.identifier)) {
      return payload;
    }

    let rawStringCandidate = '';

    // Handle object wrappers
    if (typeof payload === 'object') {
      // Custom Hex format with explicit IV
      if (payload.iv && (payload.encryptedData || payload.ciphertext || payload.cipherText)) {
        const ivHex = payload.iv;
        const encryptedHex = payload.encryptedData || payload.ciphertext || payload.cipherText;
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
      }

      // Check single encrypted string inside object keys
      rawStringCandidate = payload.encryptedData || payload.ciphertext || payload.cipherText || payload.data || payload.payload;
    } else if (typeof payload === 'string') {
      rawStringCandidate = payload.trim();
    }

    if (!rawStringCandidate && typeof payload === 'object') {
      return payload;
    }

    // Try parsing string as JSON first in case it's a JSON string of { iv, encryptedData }
    try {
      const parsed = JSON.parse(rawStringCandidate);
      if (parsed && typeof parsed === 'object' && (parsed.iv || parsed.encryptedData)) {
        return decryptPayload(parsed);
      }
    } catch (e) {
      // Not JSON string, continue to cipher decryption
    }

    // Check if combined "ivHex:encryptedHex"
    if (rawStringCandidate.includes(':')) {
      const parts = rawStringCandidate.split(':');
      const ivHex = parts[0];
      const encryptedHex = parts[1];
      const key = getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
    }

    // Check if CryptoJS OpenSSL default format (starts with base64 "U2FsdGVkX1")
    if (rawStringCandidate.startsWith('U2FsdGVkX1') || rawStringCandidate.startsWith('U2FsdGVk')) {
      const decryptedText = decryptCryptoJS(rawStringCandidate, String(config.encryptionSecretKey));
      return typeof decryptedText === 'string' ? JSON.parse(decryptedText) : decryptedText;
    }

    // Fallback: Try decrypting as raw hex or raw base64 string
    const key = getEncryptionKey();
    const iv = Buffer.alloc(16, 0); // zero IV fallback
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(rawStringCandidate, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;

  } catch (error) {
    console.error('Payload decryption error:', error.message);
    throw new Error('Failed to decrypt request payload. Please verify encryption format and secret key.');
  }
};

/**
 * Encrypts payload for testing / response encryption.
 */
const encryptPayload = (data) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    combined: `${iv.toString('hex')}:${encrypted}`
  };
};

module.exports = {
  decryptPayload,
  encryptPayload,
  decryptCryptoJS
};
