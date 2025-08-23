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
    if (!SITE_ID || !TOKEN) {
      return json(500, {
        ok: false,
        error:
          'The environment has not been configured to use Netlify Blobs. ' +
          'Set BLOBS_SITE_ID and BLOBS_TOKEN in Site settings → Environment variables.',
      });
    }

    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });

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
