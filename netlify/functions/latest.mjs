// netlify/functions/latest.mjs
import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

export async function handler() {
  try {
    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
    if (!store) {
      return resp(500, { error: 'Blobs store not initialised. Check BLOBS_SITE_ID/BLOBS_TOKEN.' });
    }

    // read raw text and parse (some blobs versions don't have getJSON)
    const raw = await store.get('latest.json');
    if (!raw) {
      return resp(404, { error: 'No snapshot found yet. Run /update-tenders first.' });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return resp(500, { error: 'Corrupt snapshot JSON.' });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // keep it fresh but cache for a minute client-side
        'Cache-Control': 'public, max-age=60'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('latest error:', err);
    return resp(500, { error: err.message || String(err) });
  }
}

function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
