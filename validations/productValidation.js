const { z } = require('zod');

const VALID_UNITS = ['Pcs', 'Kg', 'G', 'L', 'Ml', 'Pack', 'Dozen'];
const VALID_GST_RATES = [0, 5, 12, 18, 28];

const formatZodIssue = (issue) => {
  if (!issue) return 'Invalid input data';
  const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : '';
  if (path) {
    return `Field '${path}': ${issue.message}`;
  }
  return issue.message;
};

/**
 * Validation schema for Creating a New Product
 */
const createProductSchema = z.object({
  name: z.string({
    required_error: 'Product name is required',
    invalid_type_error: 'Product name must be a string'
  }).trim().min(2, 'Product name must be at least 2 characters long').max(150, 'Product name cannot exceed 150 characters'),
  barcode: z.string().trim().optional().transform(val => (val ? val.trim() : undefined)),
  category: z.string().trim().min(1, 'Category cannot be empty').default('Grocery').optional(),
  sellingPrice: z.coerce.number({
    required_error: 'Selling price is required',
    invalid_type_error: 'Selling price must be a valid number'
  }).min(0.01, 'Selling price must be greater than 0'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').default(0).optional(),
  mrp: z.coerce.number().min(0, 'MRP cannot be negative').optional(),
  stock: z.coerce.number().min(0, 'Stock cannot be negative').default(0).optional(),
  unit: z.enum(VALID_UNITS, {
    errorMap: () => ({ message: `Unit must be one of: ${VALID_UNITS.join(', ')}` })
  }).default('Pcs').optional(),
  minStock: z.coerce.number().min(0, 'Minimum stock cannot be negative').optional(),
  isLoose: z.coerce.boolean().default(false).optional(),
  gstRate: z.coerce.number().refine(val => VALID_GST_RATES.includes(val), {
    message: `GST rate must be one of: ${VALID_GST_RATES.join('%, ')}%`
  }).default(0).optional()
});

/**
 * Helper to validate create product payload
 */
const validateCreateProductPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Product payload is required',
      issues: []
    };
  }

  const result = createProductSchema.safeParse(data);
  if (!result.success) {
    const errorMsg = formatZodIssue(result.error.issues?.[0]);
    return {
      isValid: false,
      error: errorMsg,
      issues: result.error.issues
    };
  }

  return {
    isValid: true,
    data: result.data
  };
};

/**
 * Validation schema for Updating an Existing Product
 */
const updateProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters long').max(150).optional(),
  barcode: z.string().trim().optional().transform(val => (val ? val.trim() : '')),
  category: z.string().trim().min(1).optional(),
  sellingPrice: z.coerce.number().min(0.01, 'Selling price must be greater than 0').optional(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').optional(),
  mrp: z.coerce.number().min(0, 'MRP cannot be negative').optional(),
  stock: z.coerce.number().min(0, 'Stock cannot be negative').optional(),
  unit: z.enum(VALID_UNITS, {
    errorMap: () => ({ message: `Unit must be one of: ${VALID_UNITS.join(', ')}` })
  }).optional(),
  minStock: z.coerce.number().min(0, 'Minimum stock cannot be negative').optional(),
  isLoose: z.coerce.boolean().optional(),
  gstRate: z.coerce.number().refine(val => VALID_GST_RATES.includes(val), {
    message: `GST rate must be one of: ${VALID_GST_RATES.join('%, ')}%`
  }).optional()
});

/**
 * Helper to validate update product payload
 */
const validateUpdateProductPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Product update payload is required',
      issues: []
    };
  }

  const result = updateProductSchema.safeParse(data);
  if (!result.success) {
    const errorMsg = formatZodIssue(result.error.issues?.[0]);
    return {
      isValid: false,
      error: errorMsg,
      issues: result.error.issues
    };
  }

  return {
    isValid: true,
    data: result.data
  };
};

/**
 * Helper to validate Quick Restock payload
 */
const validateRestockPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Restock payload is required',
      issues: []
    };
  }

  const barcode = (data.barcode || '').trim();
  const productId = (data.productId || data.id || data._id || '').trim();
  const rawQuantity = data.quantityAdded !== undefined ? data.quantityAdded : (data.quantity !== undefined ? data.quantity : data.stockToAdd);
  const quantityAdded = Number(rawQuantity);

  if (!barcode && !productId) {
    return {
      isValid: false,
      error: 'Please provide either a product barcode or product ID to restock',
      issues: []
    };
  }

  if (isNaN(quantityAdded) || quantityAdded <= 0) {
    return {
      isValid: false,
      error: 'Quantity added must be a positive number greater than 0',
      issues: []
    };
  }

  return {
    isValid: true,
    data: {
      barcode: barcode || undefined,
      productId: productId || undefined,
      quantityAdded
    }
  };
};

module.exports = {
  createProductSchema,
  validateCreateProductPayload,
  updateProductSchema,
  validateUpdateProductPayload,
  validateRestockPayload,
  VALID_UNITS,
  VALID_GST_RATES
};
