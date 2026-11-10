// Local development: runs the app over HTTPS (Buffer requires HTTPS, even on localhost).
import https from 'https';
import selfsigned from 'selfsigned';
import app from './app.js';
import { config, missingConfig } from './config/env.js';

const missing = missingConfig();
if (missing.length) {
  console.error(`Missing settings in your .env file: ${missing.join(', ')}`);
  process.exit(1);
}

// A temporary self-signed certificate. Your browser shows a one-time warning. That's expected.
const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
  days: 30,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ],
});

https
  .createServer({ key: pems.private, cert: pems.cert }, app)
  .listen(config.port, () => console.log(`Open https://localhost:${config.port}`));
