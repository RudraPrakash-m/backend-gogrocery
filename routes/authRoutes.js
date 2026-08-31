const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const { protect, authLimiter, otpLimiter } = require('../middlewares');

// Public Auth Routes (Protected with Rate Limiting)
router.post('/register', authLimiter, authController.registerShop);
router.post('/verify-otp', authLimiter, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);
router.post('/login', authLimiter, authController.loginShop);
router.post('/logout', authController.logoutShop);

// Password / PIN Reset Routes (Public with Rate Limiting)
router.post('/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/forgot-pin', otpLimiter, authController.forgotPassword);
router.post('/send-reset-otp', otpLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.post('/reset-pin', authLimiter, authController.resetPassword);



// Protected Auth Routes
router.get('/me', protect, authController.getMe);
router.get('/check-auth', protect, authController.getMe);
router.post('/change-pin', protect, authController.changePin);
router.put('/change-pin', protect, authController.changePin);
router.post('/change-password', protect, authController.changePin);
router.put('/change-password', protect, authController.changePin);

// Store Details & Profile Routes
router.put('/store-details', protect, authController.updateStoreDetails);
router.post('/store-details', protect, authController.updateStoreDetails);
router.put('/profile', protect, authController.updateStoreDetails);
router.post('/profile', protect, authController.updateStoreDetails);
router.put('/update-details', protect, authController.updateStoreDetails);
router.post('/update-details', protect, authController.updateStoreDetails);
router.put('/update-profile', protect, authController.updateStoreDetails);
router.post('/update-profile', protect, authController.updateStoreDetails);

module.exports = router;


