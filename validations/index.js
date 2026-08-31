const authValidation = require('./authValidation');
const productValidation = require('./productValidation');

module.exports = {
  ...authValidation,
  ...productValidation
};
