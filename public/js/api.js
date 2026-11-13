// All calls to our own server go through here.
export async function api(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Is it running?' } };
  }
}

// Sends one image (already shrunk by the page) and returns its public address.
export async function uploadImage(blob) {
  try {
    const res = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Is it running?' } };
  }
}
