const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const { protect } = require('../middlewares');

router.post('/register', authController.registerShop);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/login', authController.loginShop);
router.post('/logout', authController.logoutShop);

// Protected Auth Check Routes
router.get('/me', protect, authController.getMe);
router.get('/check-auth', protect, authController.getMe);

module.exports = router;
