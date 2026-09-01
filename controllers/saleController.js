const mongoose = require('mongoose');
const { Sale, Product } = require('../schemas');
const { decryptPayload } = require('../encryptions');
const { asyncHandler, ApiResponse } = require('../utils');
const { validateCreateSalePayload } = require('../validations');

/**
 * Helper to format Date into UI friendly strings in IST (Asia/Kolkata)
 */
const formatDateTimeIST = (dateObj) => {
  const date = new Date(dateObj || Date.now());

  const formattedDate = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  const formattedTime = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  }).toLowerCase();

  const hourStr = date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  });
  const hour = parseInt(hourStr, 10);

  const dayOfWeek = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata'
  });

  return {
    saleDate: date,
    formattedDate,
    formattedTime,
    formattedDateTime: `${formattedDate} · ${formattedTime}`,
    hour: isNaN(hour) ? date.getHours() : hour,
    dayOfWeek
  };
};

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

  // Compute timezone-aware (IST) date and analytics metrics
  const saleTimestamp = decryptedPayload?.createdAt || decryptedPayload?.saleDate || Date.now();
  const timeInfo = formatDateTimeIST(saleTimestamp);

  // 3. Save Immutable Sale Transaction Record with Analytics Fields
  const sale = await Sale.create({
    invoiceNo,
    shop: shopId,
    shopCode,
    items: saleItems,
    paymentMethod: paymentMethod.toUpperCase(),
    totalAmount,
    discount: discount || 0,
    netAmount,
    saleDate: timeInfo.saleDate,
    formattedDate: timeInfo.formattedDate,
    formattedTime: timeInfo.formattedTime,
    formattedDateTime: timeInfo.formattedDateTime,
    hour: timeInfo.hour,
    dayOfWeek: timeInfo.dayOfWeek
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
      saleDate: sale.saleDate,
      date: timeInfo.formattedDate,
      time: timeInfo.formattedTime,
      formattedDateTime: timeInfo.formattedDateTime,
      hour: timeInfo.hour,
      dayOfWeek: timeInfo.dayOfWeek,
      lowStockAlerts
    }
  });
});

/**
 * @route   GET /api/sales
 * @desc    Get sales transaction history for logged-in shop formatted for UI dashboard & tabs
 * @access  Private (Shop Authorized)
 */
const getSalesHistory = asyncHandler(async (req, res) => {
  const shopId = req.shop._id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const skip = (page - 1) * limit;

  const query = { shop: shopId };

  // Tab & Payment method filtering (all, cash, upi, card, other)
  const tabFilter = (req.query.tab || req.query.paymentMethod || 'all').toLowerCase();
  if (tabFilter !== 'all') {
    query.paymentMethod = tabFilter.toUpperCase();
  }

  // Search filter (Invoice number or Product Name)
  if (req.query.search && req.query.search.trim()) {
    const searchRegex = new RegExp(req.query.search.trim(), 'i');
    query.$or = [
      { invoiceNo: searchRegex },
      { 'items.productName': searchRegex }
    ];
  }

  // Date range filtering
  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) {
      query.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // Aggregate metrics summary for top cards (totalSales, totalBills)
  const metricsAgg = await Sale.aggregate([
    { $match: { shop: shopId } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$netAmount' },
        totalBills: { $sum: 1 },
        cashSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CASH'] }, '$netAmount', 0] }
        },
        upiSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'UPI'] }, '$netAmount', 0] }
        },
        cardSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, '$netAmount', 0] }
        }
      }
    }
  ]);

  const summary = metricsAgg[0] || {
    totalSales: 0,
    totalBills: 0,
    cashSales: 0,
    upiSales: 0,
    cardSales: 0
  };

  const [sales, total] = await Promise.all([
    Sale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Sale.countDocuments(query)
  ]);

  // Format sales items for frontend UI
  const formattedSales = sales.map((sale) => {
    const timeInfo = formatDateTimeIST(sale.saleDate || sale.createdAt);
    const itemsCount = Array.isArray(sale.items) ? sale.items.reduce((acc, item) => acc + (item.quantity || 1), 0) : 0;

    return {
      id: sale._id,
      invoiceNo: sale.invoiceNo,
      date: sale.formattedDate || timeInfo.formattedDate,
      time: sale.formattedTime || timeInfo.formattedTime,
      formattedDateTime: `${sale.formattedDateTime || timeInfo.formattedDateTime} (${itemsCount} item${itemsCount !== 1 ? 's' : ''})`,
      hour: sale.hour !== undefined ? sale.hour : timeInfo.hour,
      dayOfWeek: sale.dayOfWeek || timeInfo.dayOfWeek,
      itemsCount,
      paymentMethod: sale.paymentMethod,
      paymentBadge: sale.paymentMethod,
      total: sale.netAmount,
      subtotal: sale.totalAmount,
      discount: sale.discount,
      netAmount: sale.netAmount,
      items: sale.items,
      createdAt: sale.createdAt,
      saleDate: sale.saleDate || sale.createdAt
    };
  });

  return ApiResponse.success(res, {
    statusCode: 200,
    message: 'Sales history retrieved successfully',
    summary: {
      totalSales: summary.totalSales,
      totalBills: summary.totalBills,
      cashSales: summary.cashSales,
      upiSales: summary.upiSales,
      cardSales: summary.cardSales
    },
    data: formattedSales,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * @route   GET /api/sales/metrics
 * @desc    Get top summary cards metrics for shop sales
 * @access  Private (Shop Authorized)
 */
const getSaleMetrics = asyncHandler(async (req, res) => {
  const shopId = req.shop._id;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const metricsAgg = await Sale.aggregate([
    { $match: { shop: shopId } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$netAmount' },
        totalBills: { $sum: 1 },
        cashSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CASH'] }, '$netAmount', 0] }
        },
        upiSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'UPI'] }, '$netAmount', 0] }
        },
        cardSales: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, '$netAmount', 0] }
        },
        todaySales: {
          $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, '$netAmount', 0] }
        },
        todayBills: {
          $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] }
        }
      }
    }
  ]);

  const metrics = metricsAgg[0] || {
    totalSales: 0,
    totalBills: 0,
    cashSales: 0,
    upiSales: 0,
    cardSales: 0,
    todaySales: 0,
    todayBills: 0
  };

  return ApiResponse.success(res, {
    statusCode: 200,
    message: 'Sales metrics retrieved successfully',
    data: metrics
  });
});

/**
 * @route   GET /api/sales/:id OR GET /api/sales/invoice/:invoiceNo
 * @desc    Get complete bill details + store header info for View Bill Modal & Thermal Receipt Printing
 * @access  Private (Shop Authorized)
 */
const getSaleDetails = asyncHandler(async (req, res) => {
  const idOrInvoice = req.params.id || req.params.invoiceNo;
  const shop = req.shop;
  const shopId = shop._id;

  const query = mongoose.Types.ObjectId.isValid(idOrInvoice)
    ? { _id: idOrInvoice, shop: shopId }
    : { invoiceNo: idOrInvoice, shop: shopId };

  const sale = await Sale.findOne(query).lean();
  if (!sale) {
    return ApiResponse.error(res, { statusCode: 404, message: 'Sale transaction record not found' });
  }

  const timeInfo = formatDateTimeIST(sale.saleDate || sale.createdAt);

  // Address formatting helper
  const storeAddressStr = typeof shop.address === 'object'
    ? [shop.address.street, shop.address.city, shop.address.state, shop.address.pincode].filter(Boolean).join(', ')
    : (shop.address || '');

  // Format response for direct rendering in View Bill Modal & Thermal Receipt Printer
  const receiptData = {
    store: {
      storeName: shop.storeName,
      address: storeAddressStr || 'Store Address',
      phone: shop.phone || '',
      gstin: shop.gstin || '',
      shopCode: shop.shopCode || ''
    },
    invoice: {
      id: sale._id,
      invoiceNo: sale.invoiceNo,
      date: sale.formattedDate || timeInfo.formattedDate,
      time: sale.formattedTime || timeInfo.formattedTime,
      formattedDateTime: `${sale.formattedDateTime || timeInfo.formattedDateTime}`,
      hour: sale.hour !== undefined ? sale.hour : timeInfo.hour,
      dayOfWeek: sale.dayOfWeek || timeInfo.dayOfWeek,
      paymentMethod: sale.paymentMethod,
      paymentStatusLabel: `${sale.paymentMethod} PAID`,
      subtotal: sale.totalAmount,
      discount: sale.discount || 0,
      totalBill: sale.netAmount,
      itemsCount: sale.items.length,
      items: sale.items.map(item => ({
        id: item.product || item._id,
        name: item.productName,
        qty: item.quantity,
        rate: item.price,
        amount: item.subtotal
      })),
      createdAt: sale.createdAt,
      saleDate: sale.saleDate || sale.createdAt
    }
  };

  return ApiResponse.success(res, {
    statusCode: 200,
    message: 'Sale details and store receipt data retrieved successfully',
    data: receiptData
  });
});

module.exports = {
  createSale,
  getSalesHistory,
  getSaleMetrics,
  getSaleDetails
};
