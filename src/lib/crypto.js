import crypto from 'crypto';
import { config } from '../config/env.js';

// AES-256-GCM: the result is unreadable and any tampering is detected.
const key = () => crypto.createHash('sha256').update(config.sessionSecret).digest();

export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

// Returns null for anything that was not produced by encrypt() with our secret.
export function decrypt(text) {
  try {
    const buf = Buffer.from(String(text), 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const data = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
}
