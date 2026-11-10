import { sessions } from '../store/index.js';
import { parseCookies, SESSION_COOKIE } from '../lib/cookies.js';
import { createBufferClient } from '../services/buffer.js';
import { asyncHandler } from '../lib/asyncHandler.js';

// Finds the logged-in user (if any) and gives the route a Buffer client for them.
export const loadSession = asyncHandler(async (req, res, next) => {
  const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  req.session = sid ? await sessions.get(sid) : null;
  req.buffer = req.session ? createBufferClient(req.session, sessions) : null;
  next();
});

export function requireSession(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'not_connected' });
  next();
}
