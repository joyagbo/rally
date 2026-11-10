// Express 4 does not catch errors thrown in async routes. This passes them on.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
