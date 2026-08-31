const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const { protect } = require('../middlewares');

router.post('/register', authController.registerShop);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/login', authController.loginShop);
router.post('/logout', authController.logoutShop);

// Password / PIN Reset Routes (Public)
router.post('/forgot-password', authController.forgotPassword);
router.post('/forgot-pin', authController.forgotPassword);
router.post('/send-reset-otp', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/reset-pin', authController.resetPassword);


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


