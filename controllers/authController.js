const { Shop } = require('../schemas');
const { decryptPayload, generateToken } = require('../encryptions');
const { generateUniqueShopCode, generateOtp } = require('../utils');
const { emailService } = require('../services');

/**
 * Helper to generate JWT token, set HTTP-Only cookie, and send response
 */
const sendTokenResponse = (shop, statusCode, res, message = 'Success') => {
  // Generate JWT token
  const token = generateToken({
    id: shop._id,
    shopCode: shop.shopCode,
    email: shop.email
  });

  // Cookie options
  const cookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    httpOnly: true, // Prevents XSS attacks
    secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };

  const shopData = {
    id: shop._id,
    storeName: shop.storeName,
    email: shop.email,
    phone: shop.phone,
    shopCode: shop.shopCode,
    address: shop.address,
    gstin: shop.gstin,
    plan: shop.plan || 'pro',
    isVerified: shop.isVerified
  };

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      status: 'success',
      message,
      token,
      data: shopData,
      user: shopData,
      shop: shopData
    });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new Shop with encrypted/plain payload, hash password, generate unique shopCode, and send verification OTP
 * @access  Public
 */
const registerShop = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body);

    const { storeName, email, phone, password, address, gstin, plan } = payload || {};

    if (!storeName || !email || !phone || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide storeName, email, phone, and password'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if shop already exists
    let shop = await Shop.findOne({ email: normalizedEmail });

    if (shop && shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'A registered shop already exists with this email address.'
      });
    }

    // Generate unique shopCode
    const shopCode = shop ? shop.shopCode : await generateUniqueShopCode(Shop);

    // Generate 6-digit OTP code (valid for 15 minutes)
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    if (shop) {
      // Update existing unverified shop
      shop.storeName = storeName;
      shop.phone = phone;
      shop.password = password; // Pre-save hook will hash
      shop.address = address || shop.address;
      shop.gstin = gstin || shop.gstin;
      if (plan) shop.plan = plan;
      shop.otp = otp;
      shop.otpExpires = otpExpires;
      await shop.save();
    } else {
      // Create new unverified shop
      shop = await Shop.create({
        storeName,
        email: normalizedEmail,
        phone,
        password, // Pre-save hook will hash
        shopCode,
        address,
        gstin,
        plan: plan || 'pro',
        isVerified: false,
        otp,
        otpExpires
      });
    }

    // Send OTP email via Nodemailer
    await emailService.sendOtpEmail(normalizedEmail, otp, storeName);

    res.status(201).json({
      status: 'success',
      message: 'Registration initiated. OTP code sent to your email address.',
      data: {
        storeName: shop.storeName,
        email: shop.email,
        shopCode: shop.shopCode,
        isVerified: false
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify registration OTP, set isVerified=true, send unique shopCode email, store token in HTTP-only cookie, and return shop details
 * @access  Public
 */
const verifyOtp = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body);
    const { email, otp } = payload || {};

    if (!email || !otp) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide both email and OTP'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find shop with OTP fields selected
    const shop = await Shop.findOne({ email: normalizedEmail }).select('+otp +otpExpires');

    if (!shop) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shop account not found with this email'
      });
    }

    if (shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop is already verified. Please proceed to login.'
      });
    }

    // Validate OTP and Expiry
    if (!shop.otp || shop.otp !== String(otp).trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid OTP code provided.'
      });
    }

    if (!shop.otpExpires || shop.otpExpires < new Date()) {
      return res.status(400).json({
        status: 'fail',
        message: 'OTP code has expired. Please request a new OTP.'
      });
    }

    // Mark as verified and clear OTP fields
    shop.isVerified = true;
    shop.otp = undefined;
    shop.otpExpires = undefined;
    await shop.save();

    // Send Registration Success Email containing unique shopCode
    await emailService.sendRegistrationSuccessEmail(shop.email, shop.storeName, shop.shopCode);

    // Set cookie and send response
    sendTokenResponse(shop, 200, res, 'OTP verified successfully. Your shop registration is complete!');
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend a new OTP to email for unverified shop
 * @access  Public
 */
const resendOtp = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body);
    const { email } = payload || {};

    if (!email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email address'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const shop = await Shop.findOne({ email: normalizedEmail });

    if (!shop) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shop account not found'
      });
    }

    if (shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop is already verified.'
      });
    }

    const otp = generateOtp();
    shop.otp = otp;
    shop.otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await shop.save();

    await emailService.sendOtpEmail(normalizedEmail, otp, shop.storeName);

    res.status(200).json({
      status: 'success',
      message: 'New OTP code sent to your email address.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate shop using email or shopCode & password, store token in HTTP-only cookie, and return shop details
 * @access  Public
 */
const loginShop = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body);
    const { email, shopCode, identifier, password } = payload || {};

    const loginId = (email || shopCode || identifier || '').trim().toLowerCase();

    if (!loginId || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email/shopCode and password'
      });
    }

    // Find shop by email or shopCode with password selected
    const shop = await Shop.findOne({
      $or: [
        { email: loginId },
        { shopCode: loginId.toUpperCase() }
      ]
    }).select('+password');

    if (!shop) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email/shopCode or password'
      });
    }

    // Check if account is verified
    if (!shop.isVerified) {
      return res.status(401).json({
        status: 'fail',
        message: 'Your shop account is not verified yet. Please complete OTP verification first.'
      });
    }

    // Compare password
    const isPasswordMatch = await shop.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email/shopCode or password'
      });
    }

    // Set cookie and send response
    sendTokenResponse(shop, 200, res, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Clear token HTTP-Only cookie and log out shop
 * @access  Public
 */
const logoutShop = async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
};

/**
 * @route   GET /api/auth/me
 * @desc    Get currently logged in shop profile using HTTP-only cookie or Bearer token
 * @access  Private (Protected)
 */
const getMe = async (req, res) => {
  const shop = req.shop;

  const shopData = {
    id: shop._id,
    storeName: shop.storeName,
    email: shop.email,
    phone: shop.phone,
    shopCode: shop.shopCode,
    address: shop.address,
    gstin: shop.gstin,
    plan: shop.plan || 'pro',
    isVerified: shop.isVerified,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt
  };

  res.status(200).json({
    status: 'success',
    data: shopData,
    user: shopData,
    shop: shopData
  });
};

module.exports = {
  registerShop,
  verifyOtp,
  resendOtp,
  loginShop,
  logoutShop,
  getMe
};
