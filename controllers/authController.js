const { Shop } = require('../schemas');
const { decryptPayload, generateToken } = require('../encryptions');
const { generateUniqueShopCode, generateOtp } = require('../utils');
const { emailService } = require('../services');
const {
  validateChangePinPayload,
  validateUpdateStoreDetailsPayload,
  validateForgotPasswordPayload,
  validateResetPasswordPayload
} = require('../validations');



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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  };

  const req = res.req;
  const userAgent = req?.headers?.['user-agent'] || 'Unknown Agent';
  const isiPhone = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  const deviceTag = isiPhone ? '📱 iPhone/iOS' : isAndroid ? '🤖 Android' : '💻 Desktop/Other';

  console.log(`\n============== 🔐 LOGIN RESPONSE [${deviceTag}] ==============`);
  console.log(`[LOGIN SUCCESS] Shop: ${shop.storeName} (${shop.email})`);
  console.log(`[LOGIN DEBUG] User-Agent: ${userAgent}`);
  console.log(`[LOGIN DEBUG] Cookie Options:`, cookieOptions);
  console.log(`============================================================\n`);

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
    const normalizedPhone = phone.trim();

    // Check if shop already exists with this email
    let shop = await Shop.findOne({ email: normalizedEmail });

    if (shop && shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'A registered shop already exists with this email address.'
      });
    }

    // Check if shop already exists with this phone number
    const shopByPhone = await Shop.findOne({ phone: normalizedPhone, isVerified: true });
    if (shopByPhone && (!shop || String(shopByPhone._id) !== String(shop._id))) {
      return res.status(400).json({
        status: 'fail',
        message: 'A registered shop already exists with this phone number.'
      });
    }

    // Format GSTIN: defaults to empty string "" if not sent or empty
    const normalizedGstin = (gstin && typeof gstin === 'string') ? gstin.trim().toUpperCase() : '';

    // Check if shop already exists with this GSTIN (if non-empty)
    if (normalizedGstin) {
      const shopByGstin = await Shop.findOne({ gstin: normalizedGstin, isVerified: true });
      if (shopByGstin && (!shop || String(shopByGstin._id) !== String(shop._id))) {
        return res.status(400).json({
          status: 'fail',
          message: 'A registered shop already exists with this GSTIN number.'
        });
      }
    }

    // Generate unique shopCode
    const shopCode = shop ? shop.shopCode : await generateUniqueShopCode(Shop);

    // Generate 6-digit OTP code (valid for 15 minutes)
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    if (shop) {
      // Update existing unverified shop
      shop.storeName = storeName;
      shop.phone = normalizedPhone;
      shop.password = password; // Pre-save hook will hash
      shop.address = address || shop.address;
      shop.gstin = normalizedGstin;
      if (plan) shop.plan = plan;
      shop.otp = otp;
      shop.otpExpires = otpExpires;
      await shop.save();
    } else {
      // Create new unverified shop
      shop = await Shop.create({
        storeName,
        email: normalizedEmail,
        phone: normalizedPhone,
        password, // Pre-save hook will hash
        shopCode,
        address: address || '',
        gstin: normalizedGstin,
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
 * @desc    Resend a new OTP to email for unverified registration or password reset
 * @access  Public
 */
const resendOtp = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body);
    const { email, shopCode, identifier, phone } = payload || {};

    const queryId = (identifier || email || shopCode || phone || '').trim();

    if (!queryId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide shopCode, email, or identifier'
      });
    }

    const shop = await Shop.findOne({
      $or: [
        { email: queryId.toLowerCase() },
        { shopCode: queryId.toUpperCase() },
        { phone: queryId }
      ]
    });

    if (!shop) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shop account not found'
      });
    }

    const otp = generateOtp();
    shop.otp = otp;
    shop.otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await shop.save();

    if (shop.isVerified) {
      await emailService.sendPasswordResetOtpEmail(shop.email, otp, shop.storeName);
      return res.status(200).json({
        status: 'success',
        message: 'OTP verification code sent to your registered email',
        email: shop.email
      });
    } else {
      await emailService.sendOtpEmail(shop.email, otp, shop.storeName);
      return res.status(200).json({
        status: 'success',
        message: 'New OTP code sent to your email address.',
        email: shop.email
      });
    }
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

    // Find shop by email, shopCode, or phone with password selected
    const shop = await Shop.findOne({
      $or: [
        { email: loginId },
        { shopCode: loginId.toUpperCase() },
        { phone: loginId }
      ]
    }).select('+password');

    if (!shop) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email, shopCode, phone, or password'
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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
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

/**
 * @route   POST /api/auth/change-pin
 * @route   PUT /api/auth/change-pin
 * @route   POST /api/auth/change-password
 * @route   PUT /api/auth/change-password
 * @desc    Change security PIN / password for logged-in shop user without sending OTP
 * @access  Private (Protected)
 */
const changePin = async (req, res, next) => {
  try {
    // 1. Decrypt incoming payload (supports CryptoJS OpenSSL, Hex IV, or plain JSON)
    const payload = decryptPayload(req.body) || {};

    // 2. Validate decrypted payload
    const validation = validateChangePinPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        status: 'fail',
        message: validation.error
      });
    }

    const { currentPin, newPin } = validation.data;

    // 3. User ID is extracted from authenticated token session (req.shop._id)
    const shopId = req.shop?._id || req.user?._id || payload.id;
    if (!shopId) {
      return res.status(401).json({
        success: false,
        status: 'fail',
        message: 'Authentication session expired or invalid shop ID.'
      });
    }

    // 4. Fetch shop document with password field selected
    const shop = await Shop.findById(shopId).select('+password');
    if (!shop) {
      return res.status(404).json({
        success: false,
        status: 'fail',
        message: 'Shop account not found.'
      });
    }

    // 5. Verify current PIN / password
    const isCurrentPinMatch = await shop.comparePassword(currentPin);
    if (!isCurrentPinMatch) {
      return res.status(400).json({
        success: false,
        status: 'fail',
        message: 'Current security PIN is incorrect.'
      });
    }

    // 6. Update password with new PIN (pre-save hook will hash it)
    shop.password = newPin;
    await shop.save();

    // 7. Return exact response format required
    return res.status(200).json({
      success: true,
      status: 'success',
      message: 'Security PIN updated successfully',
      data: {
        shopCode: shop.shopCode,
        updatedAt: shop.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/auth/store-details
 * @route   POST /api/auth/store-details
 * @route   PUT /api/auth/profile
 * @route   POST /api/auth/profile
 * @route   PUT /api/auth/update-details
 * @route   POST /api/auth/update-details
 * @desc    Update store details (storeName, address, gstin, phone) for logged-in shop
 * @access  Private (Protected)
 */
const updateStoreDetails = async (req, res, next) => {
  try {
    // 1. Decrypt incoming payload (supports encrypted CryptoJS, Hex IV, or plain JSON)
    const payload = decryptPayload(req.body) || {};

    // 2. Validate payload
    const validation = validateUpdateStoreDetailsPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        status: 'fail',
        message: validation.error,
        errors: validation.issues
      });
    }

    const { storeName, address, gstin, phone, plan } = validation.data;

    // 3. User ID from authenticated session (req.shop._id)
    const shopId = req.shop?._id || req.user?._id || payload.id;
    if (!shopId) {
      return res.status(401).json({
        success: false,
        status: 'fail',
        message: 'Authentication session expired. Please log in again.'
      });
    }

    // 4. Fetch shop document
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        status: 'fail',
        message: 'Shop account not found.'
      });
    }

    // 5. Check uniqueness and update fields if provided
    if (storeName !== undefined && storeName.trim() !== '') {
      shop.storeName = storeName.trim();
    }
    if (address !== undefined) {
      shop.address = typeof address === 'string' ? address.trim() : address;
    }
    if (phone !== undefined && phone.trim() !== '') {
      const normalizedPhone = phone.trim();
      const existingPhoneShop = await Shop.findOne({
        _id: { $ne: shopId },
        phone: normalizedPhone,
        isVerified: true
      });
      if (existingPhoneShop) {
        return res.status(400).json({
          success: false,
          status: 'fail',
          message: 'This phone number is already registered with another shop.'
        });
      }
      shop.phone = normalizedPhone;
    }
    if (gstin !== undefined) {
      const normalizedGstin = gstin.trim().toUpperCase();
      if (normalizedGstin !== '') {
        const existingGstinShop = await Shop.findOne({
          _id: { $ne: shopId },
          gstin: normalizedGstin
        });
        if (existingGstinShop) {
          return res.status(400).json({
            success: false,
            status: 'fail',
            message: 'This GSTIN number is already registered with another shop.'
          });
        }
        shop.gstin = normalizedGstin;
      } else {
        shop.gstin = '';
      }
    }
    if (plan !== undefined) {
      shop.plan = plan;
    }

    await shop.save();


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

    // 6. Return response
    return res.status(200).json({
      success: true,
      status: 'success',
      message: 'Store details updated successfully',
      data: shopData,
      shop: shopData,
      user: shopData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/forgot-password
 * @route   POST /api/auth/forgot-pin
 * @route   POST /api/auth/send-reset-otp
 * @desc    Request password / PIN reset OTP using shopCode, email, or identifier
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body) || {};

    const validation = validateForgotPasswordPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: validation.error
      });
    }

    const { identifier } = validation.data;

    // Find verified shop by email, shopCode, or phone
    const shop = await Shop.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { shopCode: identifier.toUpperCase() },
        { phone: identifier }
      ]
    });

    if (!shop) {
      return res.status(404).json({
        status: 'fail',
        message: 'No shop account found with this identifier'
      });
    }

    if (!shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop account is not verified yet. Please complete registration verification first.'
      });
    }

    // Generate 6-digit OTP code (valid for 15 minutes)
    const otp = generateOtp();
    shop.otp = otp;
    shop.otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await shop.save();

    // Send password reset OTP email
    await emailService.sendPasswordResetOtpEmail(shop.email, otp, shop.storeName);

    return res.status(200).json({
      status: 'success',
      message: 'OTP verification code sent to your registered email',
      email: shop.email
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/reset-password
 * @route   POST /api/auth/reset-pin
 * @desc    Verify OTP and reset security PIN / password
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const payload = decryptPayload(req.body) || {};

    const validation = validateResetPasswordPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: validation.error
      });
    }

    const { identifier, otp, newPin } = validation.data;

    // Find shop with OTP fields selected
    const shop = await Shop.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { shopCode: identifier.toUpperCase() },
        { phone: identifier }
      ]
    }).select('+otp +otpExpires');

    if (!shop) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shop account not found'
      });
    }

    if (!shop.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop account is not verified yet.'
      });
    }

    // Verify OTP code & expiration
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

    // Set new password (pre-save hook will hash it)
    shop.password = newPin;
    shop.otp = undefined;
    shop.otpExpires = undefined;
    await shop.save();

    return res.status(200).json({
      status: 'success',
      message: 'Security PIN reset successfully. Please log in with your new PIN.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerShop,
  verifyOtp,
  resendOtp,
  loginShop,
  logoutShop,
  getMe,
  changePin,
  updateStoreDetails,
  forgotPassword,
  resetPassword
};



