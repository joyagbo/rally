import { encrypt, decrypt } from '../lib/crypto.js';

let clientPromise;
const collections = new Map();

// Opens (once per server instance) the connection to MongoDB, and returns one collection.
// MongoDB deletes expired rows by itself (the "expiresAt" field).
export function getCollection(uri, name) {
  if (!collections.has(name)) {
    clientPromise ??= import('mongodb').then(({ MongoClient }) =>
      MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 })
    );
    const opening = clientPromise
      .then(async (client) => {
        const collection = client.db(process.env.MONGODB_DB || 'eventpromo').collection(name);
        await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        return collection;
      })
      .catch((err) => {
        collections.delete(name); // try again on the next request
        clientPromise = undefined;
        throw err;
      });
    collections.set(name, opening);
  }
  return collections.get(name);
}

// Sessions (including Buffer tokens) are encrypted before they are stored.
export function createMongoStore(getSessions, ttlMs) {
  return {
    async get(id) {
      const doc = await (await getSessions()).findOne({ _id: id });
      return doc ? decrypt(doc.data) : null;
    },
    async set(session) {
      await (await getSessions()).updateOne(
        { _id: session.id },
        { $set: { data: encrypt(session), expiresAt: new Date(Date.now() + ttlMs) } },
        { upsert: true }
      );
    },
    async delete(id) {
      await (await getSessions()).deleteOne({ _id: id });
    },
  };
}
