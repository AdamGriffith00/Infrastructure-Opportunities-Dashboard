// netlify/functions/latest.mjs
import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

function tendersStore() {
  if (!SITE_ID || !TOKEN) {
    throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN');
  }
  return getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
}

export async function handler() {
  try {
    const store = tendersStore();
    const payload = await store.getJSON('latest');

    if (!payload || !payload.items) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No cached tenders yet' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };

  } catch (e) {
    console.error('latest error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
}
