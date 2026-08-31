// Application constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

const USER_ROLES = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  SELLER: 'seller'
};

module.exports = {
  HTTP_STATUS,
  USER_ROLES
};
