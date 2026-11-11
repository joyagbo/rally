import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { configCheck } from './middleware/configCheck.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import campaignRoutes from './routes/campaign.js';
import pageRoutes from './routes/pages.js';

// Safety net: log unexpected errors instead of letting one bad request stop the server.
process.on('unhandledRejection', (err) => console.error('Unhandled error:', err));

const app = express();
app.set('trust proxy', 1);

app.use(configCheck);
app.use(express.json({ limit: '100kb' }));

// Locally Express serves the page. On Vercel the files in /public are served by its CDN.
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));

app.use(authRoutes);
app.use(accountRoutes);
app.use(campaignRoutes);
app.use(pageRoutes);

app.use(errorHandler);

export default app;