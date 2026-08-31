const { Product } = require('../schemas');
const { calculateMinStock } = require('../schemas/Product');
const { decryptPayload } = require('../encryptions');
const {
  validateCreateProductPayload,
  validateUpdateProductPayload,
  validateRestockPayload
} = require('../validations');


/**
 * @route   GET /api/products/barcode/:barcode
 * @route   POST /api/products/barcode
 * @route   POST /api/products/lookup
 * @desc    Lookup a product by scanned barcode for authenticated shop (supports encrypted and plain inputs)
 * @access  Private (Protected)
 */
const getProductByBarcode = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;

    let barcode = '';

    // 1. Check body if POST or JSON payload (decrypt if encrypted)
    if (req.body && (typeof req.body === 'object' || typeof req.body === 'string')) {
      try {
        const decryptedBody = decryptPayload(req.body);
        if (typeof decryptedBody === 'string') {
          barcode = decryptedBody.trim();
        } else if (decryptedBody && typeof decryptedBody === 'object') {
          barcode = (decryptedBody.barcode || decryptedBody.code || decryptedBody.identifier || '').trim();
        }
      } catch (e) {
        // Fallback to params
      }
    }

    // 2. Check params or query if not found in body
    if (!barcode) {
      let rawParam = req.params?.barcode || req.query?.barcode || req.query?.code || '';
      if (rawParam) {
        try {
          rawParam = decodeURIComponent(rawParam);
        } catch (e) {}

        // Try decrypting if it's an encrypted cipher string
        if (rawParam.startsWith('U2FsdGVk') || rawParam.includes(':') || rawParam.length > 32) {
          try {
            const decrypted = decryptPayload(rawParam);
            if (typeof decrypted === 'string') barcode = decrypted.trim();
            else if (decrypted && typeof decrypted === 'object' && decrypted.barcode) {
              barcode = String(decrypted.barcode).trim();
            } else {
              barcode = rawParam.trim();
            }
          } catch (e) {
            barcode = rawParam.trim();
          }
        } else {
          barcode = rawParam.trim();
        }
      }
    }

    if (!barcode) {
      return res.status(400).json({
        status: 'fail',
        message: 'Barcode parameter or payload is required'
      });
    }

    const product = await Product.findOne({ shopId, barcode });

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found with this barcode'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: product
    });
  } catch (error) {
    next(error);
  }
};


/**
 * @route   POST /api/products/restock
 * @route   PATCH /api/products/restock
 * @desc    Quick restock - add quantity to existing product by barcode or productId
 * @access  Private (Protected)
 */
const restockProduct = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const payload = decryptPayload(req.body) || {};

    const validation = validateRestockPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: validation.error
      });
    }

    const { barcode, productId, quantityAdded } = validation.data;

    // Search by productId if provided, or barcode
    const query = { shopId };
    if (productId) {
      query._id = productId;
    } else if (barcode) {
      query.barcode = barcode;
    }

    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found in your shop inventory'
      });
    }

    const previousStock = Number(product.stock) || 0;
    const newStock = Number((previousStock + Number(quantityAdded)).toFixed(2));
    const newMinStock = calculateMinStock(newStock);

    product.stock = newStock;
    product.minStock = newMinStock;
    await product.save();

    return res.status(200).json({
      status: 'success',
      message: 'Stock updated successfully',
      data: {
        _id: product._id,
        name: product.name,
        barcode: product.barcode,
        previousStock,
        quantityAdded: Number(quantityAdded),
        currentStock: product.stock,
        unit: product.unit,
        sellingPrice: product.sellingPrice,
        category: product.category,
        minStock: product.minStock
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/products
 * @desc    Create a brand new product in the shop catalog
 * @access  Private (Protected)
 */
const createProduct = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const payload = decryptPayload(req.body) || {};

    const validation = validateCreateProductPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: validation.error,
        errors: validation.issues
      });
    }

    const productData = validation.data;
    const initialStock = Number(productData.stock) || 0;
    const minStock = productData.minStock !== undefined
      ? Number(productData.minStock)
      : calculateMinStock(initialStock);

    // Check if barcode already exists for this shop
    if (productData.barcode) {
      const existingProduct = await Product.findOne({
        shopId,
        barcode: productData.barcode
      });

      if (existingProduct) {
        return res.status(400).json({
          status: 'fail',
          message: `A product with barcode "${productData.barcode}" already exists (${existingProduct.name}). Use Quick Restock to add stock.`
        });
      }
    }

    const product = await Product.create({
      ...productData,
      minStock,
      shopId
    });

    return res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',

        message: 'A product with this barcode already exists in your inventory.'
      });
    }
    next(error);
  }
};

/**
 * @route   GET /api/products
 * @desc    Get all products with search, category, and low/out-of-stock filtering
 * @access  Private (Protected)
 */
const getProducts = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const { search, category, filter, sortBy = 'createdAt', order = 'desc' } = req.query;

    const query = { shopId };

    // 1. Search Query (name, barcode, category)
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { barcode: { $regex: searchTerm, $options: 'i' } },
        { category: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // 2. Category Filter
    if (category && category.trim() && category.toLowerCase() !== 'all') {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
    }

    // 3. Stock Status Filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      if (lowerFilter === 'lowstock') {
        // Stock is above 0 but less than or equal to minStock
        query.$expr = {
          $and: [
            { $gt: ['$stock', 0] },
            { $lte: ['$stock', '$minStock'] }
          ]
        };
      } else if (lowerFilter === 'outofstock') {
        query.stock = { $lte: 0 };
      } else if (lowerFilter === 'instock') {
        query.stock = { $gt: 0 };
      }
    }

    // 4. Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = isNaN(limitParam) || limitParam <= 0 ? 100 : limitParam;
    const skip = (page - 1) * limit;

    // 5. Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order.toLowerCase() === 'asc' ? 1 : -1;

    const [products, total] = await Promise.all([
      Product.find(query).sort(sortOptions).skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    return res.status(200).json({
      status: 'success',
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/products/:id
 * @desc    Get a single product by ID for authenticated shop
 * @access  Private (Protected)
 */
const getProductById = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const product = await Product.findOne({ _id: req.params.id, shopId });

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: product
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/products/:id
 * @route   PATCH /api/products/:id
 * @desc    Update an existing product
 * @access  Private (Protected)
 */
const updateProduct = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const productId = req.params.id;
    const payload = decryptPayload(req.body) || {};

    const validation = validateUpdateProductPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: validation.error,
        errors: validation.issues
      });
    }

    const updateData = validation.data;

    // Find product
    const product = await Product.findOne({ _id: productId, shopId });
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }

    // If barcode is updated, check for duplicate barcode in this shop
    if (updateData.barcode !== undefined && updateData.barcode !== product.barcode) {
      if (updateData.barcode !== '') {
        const existingWithBarcode = await Product.findOne({
          _id: { $ne: productId },
          shopId,
          barcode: updateData.barcode
        });

        if (existingWithBarcode) {
          return res.status(400).json({
            status: 'fail',
            message: `Barcode "${updateData.barcode}" is already assigned to "${existingWithBarcode.name}"`
          });
        }
        product.barcode = updateData.barcode;
      } else {
        product.barcode = undefined;
      }
    }

    // Update remaining provided fields
    if (updateData.name !== undefined) product.name = updateData.name;
    if (updateData.category !== undefined) product.category = updateData.category;
    if (updateData.sellingPrice !== undefined) product.sellingPrice = updateData.sellingPrice;
    if (updateData.purchasePrice !== undefined) product.purchasePrice = updateData.purchasePrice;
    if (updateData.mrp !== undefined) product.mrp = updateData.mrp;
    if (updateData.stock !== undefined) {
      product.stock = updateData.stock;
      if (updateData.minStock === undefined) {
        product.minStock = calculateMinStock(updateData.stock);
      }
    }
    if (updateData.unit !== undefined) product.unit = updateData.unit;
    if (updateData.minStock !== undefined) product.minStock = updateData.minStock;
    if (updateData.isLoose !== undefined) product.isLoose = updateData.isLoose;
    if (updateData.gstRate !== undefined) product.gstRate = updateData.gstRate;

    await product.save();


    return res.status(200).json({
      status: 'success',
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'A product with this barcode already exists in your inventory.'
      });
    }
    next(error);
  }
};

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete a product from the shop inventory
 * @access  Private (Protected)
 */
const deleteProduct = async (req, res, next) => {
  try {
    const shopId = req.shop?._id || req.user?._id;
    const product = await Product.findOneAndDelete({ _id: req.params.id, shopId });

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found in your inventory'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Product deleted successfully',
      data: {
        id: req.params.id,
        name: product.name,
        barcode: product.barcode
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProductByBarcode,
  restockProduct,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
