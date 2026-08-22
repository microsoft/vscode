/**
 * Global error handler middleware
 */
export function errorHandler(error, req, res, next) {
  console.error('Error:', error);

  // Determine status code
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';

  // Handle specific error types
  if (error.message.includes('not found')) {
    statusCode = 404;
  } else if (error.message.includes('Invalid API key')) {
    statusCode = 401;
  } else if (error.message.includes('required')) {
    statusCode = 400;
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Async route wrapper to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
