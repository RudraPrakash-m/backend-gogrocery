const { z } = require('zod');

const saleItemValidationSchema = z.object({
  product: z.string({
    required_error: 'Product ID is required',
    invalid_type_error: 'Product ID must be a string'
  }).min(1, 'Product ID is required'),
  productName: z.string().optional(),
  quantity: z.number({
    required_error: 'Quantity is required',
    invalid_type_error: 'Quantity must be a number'
  }).min(1, 'Quantity must be at least 1'),
  price: z.number({
    required_error: 'Unit price is required',
    invalid_type_error: 'Unit price must be a number'
  }).min(0, 'Price cannot be negative')
});

const createSaleSchema = z.object({
  items: z.array(saleItemValidationSchema, {
    required_error: 'Cart items array is required',
    invalid_type_error: 'Cart items must be an array'
  }).min(1, 'At least one item is required to complete a sale'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER'], {
    errorMap: () => ({ message: 'Payment method must be CASH, UPI, CARD, or OTHER' })
  }).default('CASH'),
  totalAmount: z.number({
    required_error: 'Total amount is required',
    invalid_type_error: 'Total amount must be a number'
  }).min(0, 'Total amount cannot be negative'),
  discount: z.number().min(0, 'Discount cannot be negative').optional().default(0),
  shopCode: z.string().optional()
});

const formatZodIssue = (issue) => {
  if (!issue) return 'Invalid input data';
  const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : '';
  if (path) {
    return `Field '${path}': ${issue.message}`;
  }
  return issue.message;
};

const validateCreateSalePayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Please provide valid sale transaction data',
      issues: []
    };
  }

  // Normalize item fields dynamically to support product/productId/id/_id & numeric coercion
  const normalizedItems = Array.isArray(data.items)
    ? data.items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const productIdCandidate = item.product || item.productId || item.id || item._id;
        const productIdStr = productIdCandidate ? String(productIdCandidate).trim() : undefined;

        const rawPrice = item.price !== undefined ? item.price : item.sellingPrice;
        const priceNum = rawPrice !== undefined && rawPrice !== null ? Number(rawPrice) : undefined;

        const rawQty = item.quantity !== undefined ? item.quantity : item.qty;
        const qtyNum = rawQty !== undefined && rawQty !== null ? Number(rawQty) : undefined;

        return {
          ...item,
          product: productIdStr,
          productName: item.productName || item.name || item.title || undefined,
          quantity: qtyNum,
          price: priceNum
        };
      })
    : data.items;

  const rawPaymentMethod = data.paymentMethod || data.paymentMode || data.payment_method || 'CASH';
  const paymentMethodStr = String(rawPaymentMethod).toUpperCase().trim();

  const rawTotal = data.totalAmount !== undefined ? data.totalAmount : (data.total !== undefined ? data.total : data.netAmount);
  const totalAmountNum = rawTotal !== undefined && rawTotal !== null ? Number(rawTotal) : undefined;

  const rawDiscount = data.discount !== undefined ? data.discount : 0;
  const discountNum = rawDiscount !== undefined && rawDiscount !== null ? Number(rawDiscount) : 0;

  const normalizedData = {
    ...data,
    items: normalizedItems,
    paymentMethod: paymentMethodStr,
    totalAmount: totalAmountNum,
    discount: discountNum
  };

  const result = createSaleSchema.safeParse(normalizedData);
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

module.exports = {
  createSaleSchema,
  validateCreateSalePayload
};
