const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const shopSchema = new mongoose.Schema({
  storeName: {
    type: String,
    required: [true, 'Store name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  shopCode: {
    type: String,
    required: [true, 'Shop code is required'],
    unique: true,
    trim: true
  },
  address: {
    type: mongoose.Schema.Types.Mixed,
    default: ''
  },
  gstin: {
    type: String,
    trim: true,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: ['basic', 'business', 'pro'],
    default: 'pro',
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    select: false
  },
  otpExpires: {
    type: Date,
    select: false
  }
}, {
  timestamps: true
});

// Partial unique index for GSTIN (enforces uniqueness only when GSTIN is non-empty)
shopSchema.index(
  { gstin: 1 },
  {
    unique: true,
    partialFilterExpression: { gstin: { $type: 'string', $gt: '' } }
  }
);


// Pre-save hook to hash password before saving
shopSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Helper method to compare password
shopSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const Shop = mongoose.model('Shop', shopSchema);

module.exports = Shop;
