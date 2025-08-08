// /.netlify/functions/latest
import { getStore } from '@netlify/blobs';

export async function handler() {
  try {
    const store = getStore('tenders');
    const json = await store.get('latest.json', { type: 'json' });

    if (!json || !Array.isArray(json.items) || !json.items.length) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No tender data available yet.' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    };
  } catch (e) {
    console.error('latest.mjs error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
