// A small record of each uploaded image: who uploaded it and its public address.
// The picture itself lives with the image host (Cloudinary). expiresAt is in milliseconds.

export function createMemoryImageStore() {
  const map = new Map();
  const alive = (row) => row && row.expiresAt > Date.now();
  return {
    async put(image) {
      map.set(image.id, structuredClone(image));
    },
    async getByUrl(url) {
      for (const row of map.values()) if (row.url === url && alive(row)) return structuredClone(row);
      return null;
    },
    async countByOwner(owner) {
      let n = 0;
      for (const row of map.values()) if (row.owner === owner && alive(row)) n++;
      return n;
    },
  };
}

export function createMongoImageStore(getImages) {
  return {
    async put(image) {
      await (await getImages()).insertOne({
        _id: image.id,
        owner: image.owner,
        url: image.url,
        publicId: image.publicId,
        createdAt: new Date(),
        expiresAt: new Date(image.expiresAt),
      });
    },
    async getByUrl(url) {
      const doc = await (await getImages()).findOne({ url });
      return doc ? { id: doc._id, owner: doc.owner, url: doc.url, expiresAt: doc.expiresAt.getTime() } : null;
    },
    async countByOwner(owner) {
      return (await getImages()).countDocuments({ owner });
    },
  };
}
