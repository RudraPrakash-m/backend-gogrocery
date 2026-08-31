const crypto = require('crypto');

/**
 * Generates a random unique shop code (e.g. SHOP-849201)
 */
const generateRandomShopCode = () => {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `SHOP-${randomDigits}`;
};

/**
 * Generates a shop code guaranteed to be unique in the Shop database model.
 */
const generateUniqueShopCode = async (ShopModel) => {
  let isUnique = false;
  let shopCode = '';

  while (!isUnique) {
    shopCode = generateRandomShopCode();
    if (ShopModel) {
      const existing = await ShopModel.findOne({ shopCode });
      if (!existing) {
        isUnique = true;
      }
    } else {
      isUnique = true;
    }
  }

  return shopCode;
};

/**
 * Generates a 6-digit numeric OTP code
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = {
  generateRandomShopCode,
  generateUniqueShopCode,
  generateOtp
};
