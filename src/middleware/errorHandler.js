import { sessions } from '../store/index.js';
import { clearCookie, SESSION_COOKIE } from '../lib/cookies.js';
import { AuthError, ApiError } from '../lib/errors.js';

// The one place that turns errors into answers for the browser.
export async function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AuthError) {
    if (req.session) await sessions.delete(req.session.id).catch(() => {});
    clearCookie(res, SESSION_COOKIE);
    return res.status(401).json({ error: 'not_connected' });
  }
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Bad request.' });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
