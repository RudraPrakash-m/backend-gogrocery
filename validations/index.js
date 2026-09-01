const authValidation = require('./authValidation');
const productValidation = require('./productValidation');
const saleValidation = require('./saleValidation');

module.exports = {
  ...authValidation,
  ...productValidation,
  ...saleValidation
};
