import crypto from 'crypto';

const env = process.env;

// True when running on Vercel (or anywhere NODE_ENV=production)
export const isProd = Boolean(env.VERCEL) || env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT) || 3000,
  sessionDays: 30,
  // Encrypts the login cookie and stored sessions. A random one is fine locally.
  sessionSecret: env.SESSION_SECRET || (isProd ? '' : crypto.randomBytes(32).toString('hex')),
  mongoUri: env.MONGODB_URI || '',
  // Optional. Shown on the privacy page. Kept in settings so it never goes into the code.
  contactEmail: (env.CONTACT_EMAIL || '').trim(),
  // Where event images are stored. Optional: without these, images are simply unavailable.
  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: env.CLOUDINARY_API_KEY || '',
    apiSecret: env.CLOUDINARY_API_SECRET || '',
    apiUrl: env.CLOUDINARY_API_URL || 'https://api.cloudinary.com',
  },
  buffer: {
    clientId: env.BUFFER_CLIENT_ID || '',
    clientSecret: env.BUFFER_CLIENT_SECRET || '',
    redirectUri: env.REDIRECT_URI || 'https://localhost:3000/callback',
    authUrl: env.BUFFER_AUTH_URL || 'https://auth.buffer.com/auth',
    tokenUrl: env.BUFFER_TOKEN_URL || 'https://auth.buffer.com/token',
    apiUrl: env.BUFFER_API_URL || 'https://api.buffer.com',
    scope: 'posts:read posts:write account:read offline_access',
  },
};

// Names of required settings that are not filled in yet
export function missingConfig() {
  const missing = [];
  if (!config.buffer.clientId) missing.push('BUFFER_CLIENT_ID');
  if (isProd) {
    if (!env.REDIRECT_URI) missing.push('REDIRECT_URI');
    if (!config.sessionSecret) missing.push('SESSION_SECRET');
    if (!config.mongoUri) missing.push('MONGODB_URI');
  }
  return missing;
}

export const imagesConfigured = () =>
  Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
