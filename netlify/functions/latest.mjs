import { createClient } from "@netlify/blobs";

export async function handler() {
  try {
    const { BLOBS_SITE_ID, BLOBS_TOKEN } = process.env;
    const blobs = createClient({ siteID: BLOBS_SITE_ID, token: BLOBS_TOKEN });
    const store = blobs.store("tenders");

    let data = await store.getJSON("latest.json");
    if (!data || !Array.isArray(data.items)) {
      // First run fallback: try to refresh now
      const kicked = await kickRefresh();
      data = await store.getJSON("latest.json");
      if (!data) data = { updatedAt: null, items: [] };
      data._refreshKicked = kicked;
    }
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
}

async function kickRefresh() {
  // call our own updater internally
  const url = `${process.env.URL || ""}/.netlify/functions/update-tenders`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}
