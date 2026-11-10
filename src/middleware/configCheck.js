import { missingConfig } from '../config/env.js';

// If a required setting is missing, say so plainly instead of failing later.
export function configCheck(req, res, next) {
  const missing = missingConfig();
  if (!missing.length) return next();
  res
    .status(500)
    .type('text')
    .send(`This server is missing settings: ${missing.join(', ')}. Add them to the environment variables and redeploy.`);
}
