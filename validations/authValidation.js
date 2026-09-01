const { z } = require('zod');

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const formatZodIssue = (issue) => {
  if (!issue) return 'Invalid input data';
  const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : '';
  if (path) {
    return `Field '${path}': ${issue.message}`;
  }
  return issue.message;
};

/**
 * Validation schema for Change PIN / Password
 */
const changePinSchema = z.object({
  currentPin: z.string({
    required_error: 'Current security PIN is required',
    invalid_type_error: 'Current PIN must be a string'
  }).min(1, 'Current security PIN is required'),
  newPin: z.string({
    required_error: 'New security PIN is required',
    invalid_type_error: 'New PIN must be a string'
  }).min(6, 'New security PIN must be at least 6 characters long'),
  confirmPin: z.string().optional()
}).refine((data) => {
  if (data.confirmPin && data.newPin !== data.confirmPin) {
    return false;
  }
  return true;
}, {
  message: 'New PIN and confirmation PIN do not match',
  path: ['confirmPin']
}).refine((data) => {
  return data.currentPin !== data.newPin;
}, {
  message: 'New security PIN must be different from current PIN',
  path: ['newPin']
});

/**
 * Helper to validate change PIN payload
 */
const validateChangePinPayload = (data) => {
  const normalizedData = {
    currentPin: data?.currentPin || data?.currentPassword || data?.oldPin || data?.oldPassword,
    newPin: data?.newPin || data?.newPassword,
    confirmPin: data?.confirmPin || data?.confirmPassword || data?.confirmNewPin || data?.confirmNewPassword
  };

  const result = changePinSchema.safeParse(normalizedData);
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
 * Validation schema for updating Store Details (storeName, address, gstin, phone, plan)
 */
const updateStoreDetailsSchema = z.object({
  storeName: z.string({
    invalid_type_error: 'Store name must be a string'
  }).trim().min(2, 'Store name must be at least 2 characters long').max(100, 'Store name cannot exceed 100 characters').optional(),
  address: z.union([
    z.string().trim().max(500, 'Address cannot exceed 500 characters'),
    z.record(z.any())
  ]).optional(),
  gstin: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  plan: z.enum(['basic', 'business', 'pro'], {
    errorMap: () => ({ message: 'Plan must be one of: basic, business, pro' })
  }).optional()
}).refine((data) => {
  if (data.gstin && data.gstin.length > 0) {
    return GSTIN_REGEX.test(data.gstin.toUpperCase());
  }
  return true;
}, {
  message: 'Invalid GSTIN format. Expected a valid 15-character GST number (e.g. 22AAAAA0000A1Z5)',
  path: ['gstin']
}).refine((data) => {
  if (data.phone && data.phone.length > 0) {
    const cleaned = data.phone.replace(/[\s\-\+\(\)]/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }
  return true;
}, {
  message: 'Please provide a valid contact phone number (10 to 15 digits)',
  path: ['phone']
});

/**
 * Helper to validate Store Details payload
 */
const validateUpdateStoreDetailsPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Please provide store details to update',
      issues: []
    };
  }

  const result = updateStoreDetailsSchema.safeParse(data);
  if (!result.success) {
    const errorMsg = formatZodIssue(result.error.issues?.[0]);
    return {
      isValid: false,
      error: errorMsg,
      issues: result.error.issues
    };
  }

  const cleanData = { ...result.data };
  if (cleanData.gstin !== undefined) {
    cleanData.gstin = cleanData.gstin ? cleanData.gstin.trim().toUpperCase() : '';
  }

  return {
    isValid: true,
    data: cleanData
  };
};

/**
 * Helper to validate Forgot Password / Send Reset OTP payload
 */
const validateForgotPasswordPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Please provide shop code, email, or phone number',
      issues: []
    };
  }

  const identifier = (data.identifier || data.shopCode || data.email || data.phone || '').trim();
  if (!identifier) {
    return {
      isValid: false,
      error: 'Please provide shop code, email, or phone number',
      issues: []
    };
  }

  return {
    isValid: true,
    data: { identifier }
  };
};

/**
 * Validation schema for Reset Password / PIN
 */
const resetPasswordSchema = z.object({
  identifier: z.string({
    required_error: 'Shop identifier (shopCode, email, or phone) is required'
  }).min(1, 'Shop identifier is required'),
  otp: z.string({
    required_error: 'Verification OTP is required'
  }).min(4, 'OTP code must be at least 4 digits'),
  newPin: z.string({
    required_error: 'New security PIN is required'
  }).min(6, 'New security PIN must be at least 6 characters long'),
  confirmNewPin: z.string().optional()
}).refine((data) => {
  if (data.confirmNewPin && data.newPin !== data.confirmNewPin) {
    return false;
  }
  return true;
}, {
  message: 'New PIN and confirmation PIN do not match',
  path: ['confirmNewPin']
});

/**
 * Helper to validate Reset Password payload
 */
const validateResetPasswordPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Please provide all required reset fields',
      issues: []
    };
  }

  const normalized = {
    identifier: (data.identifier || data.shopCode || data.email || data.phone || '').trim(),
    otp: String(data.otp || '').trim(),
    newPin: String(data.newPin || data.newPassword || '').trim(),
    confirmNewPin: (data.confirmNewPin || data.confirmPassword || data.confirmPin) ? String(data.confirmNewPin || data.confirmPassword || data.confirmPin).trim() : undefined
  };

  const result = resetPasswordSchema.safeParse(normalized);
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
  changePinSchema,
  validateChangePinPayload,
  updateStoreDetailsSchema,
  validateUpdateStoreDetailsPayload,
  validateForgotPasswordPayload,
  resetPasswordSchema,
  validateResetPasswordPayload,
  GSTIN_REGEX
};
