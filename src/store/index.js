import { config } from '../config/env.js';
import { createMemoryStore } from './memoryStore.js';
import { createMongoStore, connectSessionsCollection } from './mongoStore.js';

const ttlMs = config.sessionDays * 24 * 60 * 60 * 1000;

// MongoDB when MONGODB_URI is set (needed on Vercel), otherwise memory.
export const sessions = config.mongoUri
  ? createMongoStore(() => connectSessionsCollection(config.mongoUri), ttlMs)
  : createMemoryStore(ttlMs);
