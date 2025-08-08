export async function handler() {
  try {
    // 1️⃣ Load from your Blob store
    const store = getStore();
    let data = await store.get("tenders.json");
    let items = [];

    if (data) {
      items = JSON.parse(data);

      // Filter: remove expired tenders + unwanted sectors
      const now = new Date();
      items = items.filter(t => {
        const deadline = t.deadline ? new Date(t.deadline) : null;
        const isExpired = deadline && deadline < now;
        const isOtherSector = (t.sector || "").toLowerCase().includes("other");
        return !isExpired && !isOtherSector;
      });
    }

    // 2️⃣ Trigger background refresh (non-blocking)
    triggerBackgroundUpdate();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: items.length,
        items
      })
    };

  } catch (err) {
    console.error("❌ latest.js fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

/* ---------- utils ---------- */
import { createClient } from "@netlify/blobs";

function getStore() {
  const storeId = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (!storeId || !token) throw new Error("Missing BLOBS_SITE_ID or BLOBS_TOKEN");
  return createClient({ siteID: storeId, token });
}

async function triggerBackgroundUpdate() {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/update-tenders-background`);
    console.log("Background update triggered");
  } catch (err) {
    console.error("Failed to trigger background update", err);
  }
}
