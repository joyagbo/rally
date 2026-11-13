import crypto from 'crypto';
import { Router } from 'express';
import { config } from '../config/env.js';
import { sessions } from '../store/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseCookies, setCookie, clearCookie, SESSION_COOKIE, LOGIN_COOKIE, SESSION_SECONDS } from '../lib/cookies.js';
import { tokenRequest, toTokens } from '../services/buffer.js';
import { loadSession } from '../middleware/session.js';

const router = Router();
const b64url = (buf) => buf.toString('base64url');

// Step 1: send the user to Buffer to approve the app.
// The one-time login secrets travel in an encrypted cookie (no server memory needed).
router.get('/login', (req, res) => {
  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  setCookie(res, LOGIN_COOKIE, encrypt({ state, verifier, expires: Date.now() + 10 * 60_000 }), 600);

  const { clientId, redirectUri, authUrl, scope } = config.buffer;
  const url = new URL(authUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  }).toString();
  res.redirect(url.toString());
});

// When a login fails we send the user back to the app with a short reason code.
// The page turns the code into a sentence from a fixed list (see public/js/connection.js).
const loginFailed = (res, reason, detail) => {
  console.warn(`Login failed (${reason})${detail ? `: ${detail}` : ''}`);
  res.redirect(`/?login_error=${reason}`);
};

// Step 2: Buffer sends the user back here with a code. Swap it for tokens.
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return loginFailed(res, 'denied', String(error).slice(0, 40));

    const saved = decrypt(parseCookies(req.headers.cookie)[LOGIN_COOKIE]);
    clearCookie(res, LOGIN_COOKIE);
    if (!saved || saved.expires < Date.now() || saved.state !== state) {
      return loginFailed(res, 'expired', saved ? 'state mismatch or too old' : 'login cookie missing');
    }

    const { ok, data } = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.buffer.redirectUri,
      code_verifier: saved.verifier,
    });
    if (!ok) return loginFailed(res, 'rejected', String(data?.error ?? 'no reason given').slice(0, 60));

    const session = {
      id: crypto.randomBytes(24).toString('base64url'),
      tokens: toTokens(data),
      account: null,
      channels: {},
    };
    await sessions.set(session);
    setCookie(res, SESSION_COOKIE, session.id, SESSION_SECONDS);
    res.redirect('/');
  } catch (err) {
    loginFailed(res, err.status === 503 ? 'unreachable' : 'failed', err.message);
  }
});

router.post(
  '/api/logout',
  loadSession,
  asyncHandler(async (req, res) => {
    if (req.session) await sessions.delete(req.session.id);
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  })
);

export default router;
