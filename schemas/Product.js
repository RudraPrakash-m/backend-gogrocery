const mongoose = require('mongoose');

/**
 * Calculates 20% low-stock threshold based on total/current stocked quantity
 * E.g., stock = 100 -> minStock = 20 (alert when 80% is sold / only 20% left)
 *       stock = 10  -> minStock = 2
 *       stock = 4   -> minStock = 1
 *       stock = 0   -> minStock = 0
 */
const calculateMinStock = (stock) => {
  const num = Number(stock) || 0;
  if (num <= 0) return 0;
  if (num <= 3) return 1;
  return Math.max(1, Math.ceil(num * 0.20));
};

const productSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop ID is required'],
      index: true,
    },
    barcode: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: true,
      default: 'Grocery',
      trim: true,
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },
    purchasePrice: {
      type: Number,
      default: 0,
      min: [0, 'Purchase price cannot be negative'],
    },
    mrp: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    unit: {
      type: String,
      required: true,
      enum: ['Pcs', 'Kg', 'G', 'L', 'Ml', 'Pack', 'Dozen'],
      default: 'Pcs',
    },
    minStock: {
      type: Number,
      default: function () {
        return calculateMinStock(this.stock);
      },
      min: [0, 'Minimum stock threshold cannot be negative'],
    },
    isLoose: {
      type: Boolean,
      default: false,
    },
    gstRate: {
      type: Number,
      default: 0,
      enum: [0, 5, 12, 18, 28],
    },
  },
  { timestamps: true }
);

// Compound Index: Barcodes must be unique per shop (allows duplicate barcodes across different shops)
productSchema.index({ shopId: 1, barcode: 1 }, { unique: true, sparse: true });

// Text index for fast multi-field searching
productSchema.index({ name: 'text', category: 'text', barcode: 'text' });

// Pre-save hook: Automatically re-calculate 20% minStock when stock is set or increased and minStock is not manually overridden
productSchema.pre('save', function () {
  if (this.isModified('stock') && !this.isModified('minStock')) {
    this.minStock = calculateMinStock(this.stock);
  } else if (this.minStock === undefined || this.minStock === null) {
    this.minStock = calculateMinStock(this.stock);
  }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
module.exports.calculateMinStock = calculateMinStock;
