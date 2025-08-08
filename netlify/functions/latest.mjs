// netlify/functions/latest.mjs
// Serves the latest tenders.json from Netlify Blobs.
// Requires env vars: BLOBS_SITE_ID, BLOBS_TOKEN
// npm dep: @netlify/blobs

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'tenders';
const siteID = process.env.BLOBS_SITE_ID;
const token  = process.env.BLOBS_TOKEN;

if (!siteID || !token) {
  throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN environment variables.');
}

function store() {
  return getStore({ name: STORE_NAME, siteID, token });
}

export async function handler() {
  try {
    const latest = await store().getJSON('latest.json');
    if (!latest) {
      return json({ ok: false, error: 'No data available yet' }, 404);
    }
    return json(latest);
  } catch (err) {
    console.error('latest function error:', err);
    return json({ ok: false, error: err.message }, 500);
  }
}

function json(obj, code = 200) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
