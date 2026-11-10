import { config } from '../config/env.js';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, maxAgeSeconds) {
  res.append('Set-Cookie', `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`);
}

export const clearCookie = (res, name) => setCookie(res, name, '', 0);

export const SESSION_COOKIE = 'sid';
export const LOGIN_COOKIE = 'oauth';
export const SESSION_SECONDS = config.sessionDays * 24 * 60 * 60;
