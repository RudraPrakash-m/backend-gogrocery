const express = require('express');
const router = express.Router();
const { productController } = require('../controllers');
const { protect } = require('../middlewares');

// All product routes are private and protected by cookie/bearer JWT authentication
router.use(protect);

// 1. Scanner Barcode Lookup (GET param or POST encrypted body)
router.get('/barcode/:barcode', productController.getProductByBarcode);
router.post('/barcode', productController.getProductByBarcode);
router.post('/barcode-lookup', productController.getProductByBarcode);
router.post('/lookup', productController.getProductByBarcode);


// 2. Quick Restock
router.post('/restock', productController.restockProduct);
router.patch('/restock', productController.restockProduct);

// 3. Product Catalog & Creation
router.get('/', productController.getProducts);
router.post('/', productController.createProduct);

// 4. Single Product Operations (Get, Update, Delete)
router.get('/:id', productController.getProductById);
router.put('/:id', productController.updateProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
