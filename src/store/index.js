import { config } from '../config/env.js';
import { createMemoryStore } from './memoryStore.js';
import { createMongoStore, getCollection } from './mongoStore.js';
import { createMemoryImageStore, createMongoImageStore } from './imageStore.js';

const ttlMs = config.sessionDays * 24 * 60 * 60 * 1000;

// MongoDB when MONGODB_URI is set (needed on Vercel), otherwise memory.
export const sessions = config.mongoUri
  ? createMongoStore(() => getCollection(config.mongoUri, 'sessions'), ttlMs)
  : createMemoryStore(ttlMs);

export const images = config.mongoUri
  ? createMongoImageStore(() => getCollection(config.mongoUri, 'images'))
  : createMemoryImageStore();
