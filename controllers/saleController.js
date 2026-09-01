const mongoose = require('mongoose');
const { Sale, Product } = require('../schemas');
const { decryptPayload } = require('../encryptions');
const { asyncHandler, ApiResponse } = require('../utils');
const { validateCreateSalePayload } = require('../validations');

/**
 * Helper to generate a unique Invoice Number per shop
 * Format: INV-YYYYMMDD-SHOPCODE-XXXX
 */
const generateInvoiceNumber = (shopCode) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${dateStr}-${shopCode || 'GOG'}-${randomSuffix}`;
};

/**
 * @route   POST /api/sales
 * @desc    Process a POS sale transaction batch, perform atomic inventory deduction, and return low stock alerts
 * @access  Private (Shop Authorized)
 */
const createSale = asyncHandler(async (req, res) => {
  const shopId = req.shop._id;
  const shopCode = req.shop.shopCode;

  // Decrypt payload (supports encrypted CryptoJS/Hex payload or plain JSON)
  const decryptedPayload = decryptPayload(req.body);

  // Validate payload
  const validation = validateCreateSalePayload(decryptedPayload);
  if (!validation.isValid) {
    return ApiResponse.error(res, { statusCode: 400, message: validation.error });
  }

  const { items, paymentMethod, totalAmount, discount } = validation.data;

  // Extract all unique product IDs from batch items
  const productIds = [...new Set(items.map(item => item.product))].filter(id => mongoose.Types.ObjectId.isValid(id));

  // Retrieve products belonging to this shop
  const dbProducts = await Product.find({
    _id: { $in: productIds },
    $or: [{ shopId: shopId }, { shop: shopId }]
  });

  const dbProductMap = new Map(dbProducts.map(p => [String(p._id), p]));

  // Build items array with verified product names and calculated subtotals
  const saleItems = [];
  const stockDeductionOps = [];

  for (const item of items) {
    const dbProduct = dbProductMap.get(String(item.product));
    const subtotal = Number((item.quantity * item.price).toFixed(2));
    const itemProductName = item.productName || item.name || (dbProduct ? dbProduct.name : 'General Item');

    if (dbProduct) {
      saleItems.push({
        product: dbProduct._id,
        productName: itemProductName,
        quantity: item.quantity,
        price: item.price,
        subtotal
      });

      // Prepare atomic stock deduction write operation ($inc: { stock: -quantity })
      stockDeductionOps.push(
        Product.updateOne(
          { _id: dbProduct._id },
          { $inc: { stock: -item.quantity } }
        )
      );
    } else {
      // Ad-hoc or uncatalogued custom cart item
      saleItems.push({
        product: (item.product && mongoose.Types.ObjectId.isValid(item.product)) ? new mongoose.Types.ObjectId(item.product) : undefined,
        productName: itemProductName,
        quantity: item.quantity,
        price: item.price,
        subtotal
      });
    }
  }

  // 1. Atomic Inventory Deduction in MongoDB for catalogued items
  if (stockDeductionOps.length > 0) {
    await Promise.all(stockDeductionOps);
  }

  // 2. Generate Unique Invoice Number (use frontend invoiceNo if sent, or generate server-side)
  let invoiceNo = decryptedPayload?.invoiceNo || generateInvoiceNumber(shopCode);
  let existingInvoice = await Sale.findOne({ invoiceNo });
  if (existingInvoice && decryptedPayload?.invoiceNo) {
    invoiceNo = generateInvoiceNumber(shopCode);
  }

  const netAmount = Number((totalAmount - (discount || 0)).toFixed(2));

  // 3. Save Immutable Sale Transaction Record
  const sale = await Sale.create({
    invoiceNo,
    shop: shopId,
    shopCode,
    items: saleItems,
    paymentMethod: paymentMethod.toUpperCase(),
    totalAmount,
    discount: discount || 0,
    netAmount
  });

  // 4. Stock Level Intelligence (Evaluate minStock thresholds after deduction)
  const updatedProducts = await Product.find({
    _id: { $in: productIds }
  }).select('_id name stock minStock category barcode');

  const lowStockAlerts = updatedProducts
    .filter(p => p.stock <= p.minStock)
    .map(p => ({
      productId: p._id,
      productName: p.name,
      barcode: p.barcode,
      currentStock: p.stock,
      minStock: p.minStock,
      isOutOfStock: p.stock <= 0
    }));

  return ApiResponse.success(res, {
    statusCode: 201,
    message: 'Sale completed successfully',
    data: {
      id: sale._id,
      invoiceNo: sale.invoiceNo,
      totalAmount: sale.totalAmount,
      discount: sale.discount,
      netAmount: sale.netAmount,
      paymentMethod: sale.paymentMethod,
      itemsCount: sale.items.length,
      items: sale.items,
      createdAt: sale.createdAt,
      lowStockAlerts
    }
  });
});

/**
 * @route   GET /api/sales
 * @desc    Get sales transaction history for logged-in shop (supports pagination & date filter)
 * @access  Private (Shop Authorized)
 */
const getSalesHistory = asyncHandler(async (req, res) => {
  const shopId = req.shop._id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const skip = (page - 1) * limit;

  const query = { shop: shopId };

  // Filter by payment method
  if (req.query.paymentMethod) {
    query.paymentMethod = req.query.paymentMethod.toUpperCase();
  }

  // Filter by date range
  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) {
      query.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      query.createdAt.$lte = new Date(req.query.endDate);
    }
  }

  const [sales, total] = await Promise.all([
    Sale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Sale.countDocuments(query)
  ]);

  return ApiResponse.success(res, {
    statusCode: 200,
    message: 'Sales history retrieved successfully',
    data: sales,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * @route   GET /api/sales/:id
 * @desc    Get single sale transaction details by ID or Invoice Number
 * @access  Private (Shop Authorized)
 */
const getSaleDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shopId = req.shop._id;

  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id, shop: shopId }
    : { invoiceNo: id, shop: shopId };

  const sale = await Sale.findOne(query);
  if (!sale) {
    return ApiResponse.error(res, { statusCode: 404, message: 'Sale transaction record not found' });
  }

  return ApiResponse.success(res, {
    statusCode: 200,
    message: 'Sale details retrieved successfully',
    data: sale
  });
});

module.exports = {
  createSale,
  getSalesHistory,
  getSaleDetails
};
