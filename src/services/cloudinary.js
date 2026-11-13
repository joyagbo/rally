import crypto from 'crypto';
import { config } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

// Uploads one picture to Cloudinary and returns its permanent public address.
// The upload is "signed": we prove it is really us with a short code made from the API secret,
// so the secret itself never leaves this server.
export async function uploadToCloudinary(bytes, mime) {
  const { cloudName, apiKey, apiSecret, apiUrl } = config.cloudinary;
  const folder = 'rally';
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary's rule: the signed values, sorted by name, followed by the secret, then SHA-1.
  const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');

  const form = new FormData();
  form.append('file', `data:${mime};base64,${bytes.toString('base64')}`);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  let response;
  try {
    response = await fetch(`${apiUrl}/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    console.error('Could not reach Cloudinary:', err?.cause?.code ?? err.message);
    throw new ApiError('Could not reach the image host. Please try again.', 503);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) {
    // Cloudinary's reason helps when something is set up wrong (for example a wrong key).
    console.error(`Cloudinary refused the upload (${response.status}): ${data?.error?.message ?? 'no reason given'}`);
    throw new ApiError('The image host did not accept the upload. Please try again.', 502);
  }
  return { url: data.secure_url, publicId: data.public_id };
}
