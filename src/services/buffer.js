import { config } from '../config/env.js';
import { AuthError, ApiError } from '../lib/errors.js';

// Talks to Buffer. If the connection can't even be opened (slow or unstable
// internet), nothing has been sent yet, so it is safe to try again a few times.
async function fetchBuffer(url, options, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      const code = err?.cause?.code;
      const nothingSent = ['UND_ERR_CONNECT_TIMEOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);
      if (!nothingSent || i >= attempts) {
        console.error(`Could not reach Buffer (${code ?? err.message})`);
        throw new ApiError('Could not reach Buffer. Please check your internet connection and try again.', 503);
      }
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

// Exchanges a login code (or a refresh token) for tokens.
export async function tokenRequest(params) {
  const { clientId, clientSecret, tokenUrl } = config.buffer;
  const body = new URLSearchParams({ client_id: clientId, ...params });
  if (clientSecret) body.set('client_secret', clientSecret);
  const r = await fetchBuffer(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export function toTokens(data, previous) {
  return {
    accessToken: data.access_token,
    // Refresh tokens rotate: always keep the newest one.
    refreshToken: data.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// Refreshes in progress on this server instance, so two requests never
// try to use the same (single-use) refresh token at once.
const refreshing = new Map();

async function refreshTokens(session, store) {
  const old = session.tokens;
  const { ok, data } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: old.refreshToken });
  if (ok) {
    session.tokens = toTokens(data, old);
    await store.set(session); // save at once: the old refresh token is now useless
    return session.tokens;
  }
  // Another server may have refreshed first. If so, use its tokens.
  const latest = await store.get(session.id);
  if (latest?.tokens && latest.tokens.accessToken !== old.accessToken) return latest.tokens;
  throw new AuthError('Session expired');
}

// A client for one logged-in user.
export function createBufferClient(session, store) {
  let lastRateLimit = null;

  async function accessToken() {
    const t = session.tokens;
    if (Date.now() < t.expiresAt - 60_000) return t.accessToken;
    if (!t.refreshToken) throw new AuthError('Session expired');

    let pending = refreshing.get(session.id);
    if (!pending) {
      pending = refreshTokens(session, store).finally(() => refreshing.delete(session.id));
      refreshing.set(session.id, pending);
    }
    session.tokens = await pending;
    return session.tokens.accessToken;
  }

  async function query(gql, variables = {}) {
    const token = await accessToken();
    const r = await fetchBuffer(config.buffer.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables }),
    });

    lastRateLimit = r.headers.get('ratelimit');

    if (r.status === 429) {
      const wait = Number(r.headers.get('retry-after') || 0);
      throw new ApiError(`Buffer asked us to slow down. Please try again in ${wait || 'a few'} seconds.`, 429);
    }
    if (r.status === 401) throw new AuthError('Session expired');

    const json = await r.json();
    if (json.errors?.length) {
      if (json.errors[0]?.extensions?.code === 'UNAUTHORIZED') throw new AuthError('Session expired');
      throw new ApiError(json.errors[0].message);
    }
    return json.data;
  }

  // How many Buffer requests this app may still make today
  const requestsLeftToday = () => {
    const m = /"24h";\s*r=(\d+)/.exec(lastRateLimit ?? '');
    return m ? Number(m[1]) : null;
  };

  return { query, requestsLeftToday };
}
