/**
 * asyncHandler
 * Wraps async express routes to catch errors and pass them to the global error handler.
 * This eliminates the need for repeated try-catch blocks in controllers.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
