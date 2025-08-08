const fetch = require('node-fetch');

const BLOBS_SITE_ID = process.env.BLOBS_SITE_ID;
const BLOBS_TOKEN = process.env.BLOBS_TOKEN;
const STORE_NAME = 'tenders';

module.exports.handler = async function () {
  try {
    // 1️⃣ Try to load tenders from Blob store
    let tenders = await loadFromStore();

    // 2️⃣ If no data, trigger background update
    if (!tenders || tenders.length === 0) {
      console.log("No cached tenders found — triggering background update...");
      await triggerBackgroundUpdate();
      tenders = await loadFromStore();
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        items: tenders || []
      })
    };
  } catch (e) {
    console.error('latest.js fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

async function loadFromStore() {
  const url = `https://api.netlify.com/api/v1/blobs/${BLOBS_SITE_ID}/${STORE_NAME}/latest`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BLOBS_TOKEN}` }
  });

  if (!res.ok) {
    console.warn(`Blob fetch failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.items || [];
}

async function triggerBackgroundUpdate() {
  const url = `${process.env.URL || 'https://YOUR-SITE.netlify.app'}/.netlify/functions/update-tenders-background`;
  await fetch(url);
}
