// Keeps sessions in the server's memory. Fine for local development.
// (Copies are stored, so it behaves like a real database.)
export function createMemoryStore(ttlMs) {
  const map = new Map();
  return {
    async get(id) {
      const row = map.get(id);
      if (!row) return null;
      if (row.expiresAt < Date.now()) {
        map.delete(id);
        return null;
      }
      return structuredClone(row.session);
    },
    async set(session) {
      map.set(session.id, { session: structuredClone(session), expiresAt: Date.now() + ttlMs });
    },
    async delete(id) {
      map.delete(id);
    },
  };
}
