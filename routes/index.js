const express = require('express');
const router = express.Router();
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');

// Mount routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

module.exports = router;
