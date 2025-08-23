// netlify/functions/latest.mjs
import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

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
    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
    if (!store) {
      return json(500, { ok: false, error: 'Blobs store not initialised (check BLOBS_SITE_ID/BLOBS_TOKEN).' });
    }

    const raw = await store.get('latest.json'); // returns string or null
    if (!raw) {
      // No cache yet – return a friendly empty payload (UI can show demo/fallback rows)
      return json(200, {
        updatedAt: null,
        count: 0,
        items: [],
        note: 'No cached tenders yet. Run /.netlify/functions/update-tenders to populate.',
      });
    }

    const data = JSON.parse(raw);
    return json(200, data);
  } catch (err) {
    console.error('latest error:', err);
    return json(500, { ok: false, error: err.message ?? String(err) });
  }
}
