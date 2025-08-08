import { getStore } from "@netlify/blobs";

export async function handler() {
  try {
    const { BLOBS_SITE_ID, BLOBS_TOKEN } = process.env;
    if (!BLOBS_SITE_ID || !BLOBS_TOKEN) {
      return json(500, { error: "Missing BLOBS_SITE_ID or BLOBS_TOKEN" });
    }

    const store = getStore({ name: "tenders", siteID: BLOBS_SITE_ID, token: BLOBS_TOKEN });

    let data = await store.getJSON("latest.json");
    if (!data || !Array.isArray(data.items)) {
      // first-run fallback: try to refresh now
      await fetch(`${process.env.URL || ""}/.netlify/functions/update-tenders`).catch(()=>{});
      data = await store.getJSON("latest.json") || { updatedAt: null, items: [] };
    }

    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}

function json(status, obj) {
  return { statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
