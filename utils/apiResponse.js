/**
 * Centralized API Response Helper to standardize JSON output
 */
class ApiResponse {
  /**
   * Send a success response
   */
  static success(res, options = {}) {
    const {
      statusCode = 200,
      message = 'Success',
      data = undefined,
      ...extra
    } = options;

    const responseBody = {
      success: true,
      status: 'success',
      message,
      ...(data !== undefined && { data }),
      ...extra
    };

    return res.status(statusCode).json(responseBody);
  }

  /**
   * Send a failure / error response
   */
  static error(res, options = {}) {
    const {
      statusCode = 400,
      message = 'Something went wrong',
      errors = undefined,
      ...extra
    } = options;

    const statusType = statusCode >= 500 ? 'error' : 'fail';

    const responseBody = {
      success: false,
      status: statusType,
      message,
      ...(errors !== undefined && { errors }),
      ...extra
    };

    return res.status(statusCode).json(responseBody);
  }
}

module.exports = ApiResponse;
