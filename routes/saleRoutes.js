const express = require('express');
const router = express.Router();
const { saleController } = require('../controllers');
const { protect } = require('../middlewares');

// All sales routes are private and protected by cookie/bearer JWT authentication
router.use(protect);

// 1. Process Batch Checkout Sale Transaction
router.post('/', saleController.createSale);
router.post('/checkout', saleController.createSale);

// 2. Query Sales History & Transactions
router.get('/', saleController.getSalesHistory);
router.get('/history', saleController.getSalesHistory);

// 3. Single Sale Details / Invoice Lookup
router.get('/:id', saleController.getSaleDetails);

module.exports = router;
