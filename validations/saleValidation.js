const { z } = require('zod');

const saleItemValidationSchema = z.object({
  product: z.string({
    required_error: 'Product ID is required'
  }).min(1, 'Product ID is required'),
  productName: z.string().optional(),
  quantity: z.number({
    required_error: 'Quantity is required'
  }).min(1, 'Quantity must be at least 1'),
  price: z.number({
    required_error: 'Unit price is required'
  }).min(0, 'Price cannot be negative')
});

const createSaleSchema = z.object({
  items: z.array(saleItemValidationSchema, {
    required_error: 'Cart items array is required'
  }).min(1, 'At least one item is required to complete a sale'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER'], {
    errorMap: () => ({ message: 'Payment method must be CASH, UPI, CARD, or OTHER' })
  }).default('CASH'),
  totalAmount: z.number({
    required_error: 'Total amount is required'
  }).min(0, 'Total amount cannot be negative'),
  discount: z.number().min(0, 'Discount cannot be negative').optional().default(0),
  shopCode: z.string().optional()
});

const validateCreateSalePayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Please provide valid sale transaction data',
      issues: []
    };
  }

  const result = createSaleSchema.safeParse(data);
  if (!result.success) {
    const errorMsg = result.error.issues?.[0]?.message || 'Invalid sale transaction data';
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

module.exports = {
  createSaleSchema,
  validateCreateSalePayload
};
