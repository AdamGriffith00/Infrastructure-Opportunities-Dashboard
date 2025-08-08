// netlify/functions/latest.mjs
// Read the cached tenders list from Netlify Blobs using the older API.

import { getJSON } from '@netlify/blobs';

const BLOB_SITE = process.env.BLOBS_SITE_ID;
const BLOB_TOKEN = process.env.BLOBS_TOKEN;

export async function handler() {
  try {
    if (!BLOB_SITE || !BLOB_TOKEN) {
      return reply({ error: "Blobs not configured (missing BLOBS_SITE_ID/BLOBS_TOKEN)" }, 503);
    }

    const payload = await getJSON("tenders/latest.json", {
      siteID: BLOB_SITE,
      token: BLOB_TOKEN
    });

    if (!payload || !Array.isArray(payload.items)) {
      return reply({ error: "No tender data yet. Run the background update." }, 404);
    }

    return reply(payload, 200);
  } catch (e) {
    console.error("latest error:", e?.stack || e?.message || e);
    return reply({ error: "Internal error in /latest" }, 500);
  }
}

function reply(obj, status = 200) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj)
  };
}
