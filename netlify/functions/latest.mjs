// netlify/functions/latest.mjs
import { getStore } from '@netlify/blobs';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body),
  };
}

export async function handler() {
  try {
    // Automatic site binding (no siteID/token needed)
    const store = getStore({ name: 'tenders' });

    const raw = await store.get('latest.json'); // string | null
    if (!raw) {
      return json(200, {
        updatedAt: null,
        count: 0,
        items: [],
        note: 'No cached tenders yet. Run /.netlify/functions/update-tenders to populate.',
      });
    }
    return json(200, JSON.parse(raw));
  } catch (err) {
    console.error('latest error:', err);
    return json(500, { ok: false, error: err.message ?? String(err) });
  }
}
