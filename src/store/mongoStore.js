import { encrypt, decrypt } from '../lib/crypto.js';

let collectionPromise;

// Opens (once per server instance) the connection to MongoDB.
export function connectSessionsCollection(uri) {
  collectionPromise ??= import('mongodb')
    .then(({ MongoClient }) => MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 }))
    .then(async (client) => {
      const sessions = client.db(process.env.MONGODB_DB || 'eventpromo').collection('sessions');
      // MongoDB deletes expired sessions by itself
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      return sessions;
    })
    .catch((err) => {
      collectionPromise = undefined; // try again on the next request
      throw err;
    });
  return collectionPromise;
}

// Sessions (including Buffer tokens) are encrypted before they are stored.
export function createMongoStore(getCollection, ttlMs) {
  return {
    async get(id) {
      const doc = await (await getCollection()).findOne({ _id: id });
      return doc ? decrypt(doc.data) : null;
    },
    async set(session) {
      await (await getCollection()).updateOne(
        { _id: session.id },
        { $set: { data: encrypt(session), expiresAt: new Date(Date.now() + ttlMs) } },
        { upsert: true }
      );
    },
    async delete(id) {
      await (await getCollection()).deleteOne({ _id: id });
    },
  };
}
