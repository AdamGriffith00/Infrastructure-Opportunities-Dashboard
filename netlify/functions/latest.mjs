// Read the most recent tender snapshot from Netlify Blobs and return it
import { getStore } from '@netlify/blobs';

export async function handler() {
  try {
    const store = getStore({ name: 'tenders' });

    // Prefer the typed getter; fall back to text+parse if needed
    let data = await store.get('latest.json', { type: 'json' });
    if (!data) {
      const txt = await store.get('latest.json');
      data = txt ? JSON.parse(txt) : null;
    }

    if (!data || !Array.isArray(data.items)) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updatedAt: null, items: [] })
      };
    }

    // Sort by soonest deadline, keep future only (just in case)
    const now = Date.now();
    const items = data.items
      .filter(i => i.deadline && !isNaN(Date.parse(i.deadline)) && Date.parse(i.deadline) >= now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      },
      body: JSON.stringify({ updatedAt: data.updatedAt || new Date().toISOString(), items })
    };
  } catch (err) {
    console.error('latest.mjs error', err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
}
