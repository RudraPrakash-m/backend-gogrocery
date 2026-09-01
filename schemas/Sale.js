const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  price: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Price cannot be negative']
  },
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative']
  }
});

const saleSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    trim: true,
    index: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop reference is required'],
    index: true
  },
  shopCode: {
    type: String,
    required: [true, 'Shop code is required'],
    trim: true
  },
  items: {
    type: [saleItemSchema],
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Sale must contain at least one item'
    }
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'UPI', 'CARD', 'OTHER'],
    default: 'CASH',
    uppercase: true,
    trim: true
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  netAmount: {
    type: Number,
    required: [true, 'Net amount is required'],
    min: [0, 'Net amount cannot be negative']
  },
  // Dedicated Analytics & Timezone Fields
  saleDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  formattedDate: {
    type: String,
    trim: true
  },
  formattedTime: {
    type: String,
    trim: true
  },
  formattedDateTime: {
    type: String,
    trim: true
  },
  hour: {
    type: Number,
    min: 0,
    max: 23,
    index: true
  },
  dayOfWeek: {
    type: String,
    trim: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound Indexes for fast analytics, hourly traffic reports, and date-range queries per shop
saleSchema.index({ shop: 1, createdAt: -1 });
saleSchema.index({ shop: 1, saleDate: -1 });
saleSchema.index({ shop: 1, hour: 1 });
saleSchema.index({ shop: 1, dayOfWeek: 1 });

const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;
