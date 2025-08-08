// netlify/functions/latest.mjs
// Reads the most recent cached results from Netlify Blobs and returns them.

import { getStore as _getStore } from '@netlify/blobs';

function getTendersStore() {
  // Try native site-integrated Blobs first
  try {
    return _getStore('tenders');
  } catch {
    // Fallback to manual token + site id if UI isn't enabled
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error('Netlify Blobs not configured (missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN).');
    }
    return _getStore({ name: 'tenders', siteID, token });
  }
}

export async function handler() {
  try {
    const store = getTendersStore();

    const payload = await store.getJSON('latest.json');
    if (!payload) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No cached tenders yet. Run /update-tenders once.' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // a tiny bit of browser caching is ok
        'Cache-Control': 'max-age=60, must-revalidate'
      },
      body: JSON.stringify(payload)
    };
  } catch (err) {
    console.error('latest.mjs error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
