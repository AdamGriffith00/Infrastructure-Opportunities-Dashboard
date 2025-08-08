// Reads the last snapshot written by update-tenders (store "tenders", key "latest.json")
// Filters out expired deadlines and returns items sorted by soonest deadline.
import { getStore as _getStore } from '@netlify/blobs';

function getStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || 'PASTE_YOUR_SITE_ID';
  const token  = process.env.BLOBS_TOKEN   || 'PASTE_YOUR_BLOBS_TOKEN';
  return _getStore({ name, siteID, token });
}

export async function handler() {
  try {
    const store = getStore('tenders');

    // Try typed read first, then fall back to text+parse if needed
    let data = await store.get('latest.json', { type: 'json' });
    if (!data) {
      const txt = await store.get('latest.json');
      data = txt ? JSON.parse(txt) : null;
    }

    if (!data || !Array.isArray(data.items)) {
      return resp({ updatedAt: null, items: [] });
    }

    // only future deadlines, sort by soonest
    const now = Date.now();
    const items = data.items
      .filter(i => i.deadline && !isNaN(Date.parse(i.deadline)) && Date.parse(i.deadline) >= now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    return resp({ updatedAt: data.updatedAt || new Date().toISOString(), items });
  } catch (err) {
    console.error('latest error', err);
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
}

function resp(body) {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
