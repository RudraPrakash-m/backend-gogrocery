const express = require('express');
const router = express.Router();
const { saleController } = require('../controllers');
const { protect } = require('../middlewares');

// All sales routes are private and protected by cookie/bearer JWT authentication
router.use(protect);

// 1. Submit POS Batch Checkout Sale Transaction
router.post('/', saleController.createSale);
router.post('/checkout', saleController.createSale);

// 2. Query Sales History & Transactions (Supports tabs: all, cash, upi, card, search, & date range)
router.get('/', saleController.getSalesHistory);
router.get('/history', saleController.getSalesHistory);

// 3. Top Summary Metrics Cards (totalSales, totalBills, cashSales, upiSales, cardSales)
router.get('/metrics', saleController.getSaleMetrics);

// 4. Single Sale Details & Thermal Receipt Data Lookup (By Invoice Number or Mongo ID)
router.get('/invoice/:invoiceNo', saleController.getSaleDetails);
router.get('/:id', saleController.getSaleDetails);

module.exports = router;
