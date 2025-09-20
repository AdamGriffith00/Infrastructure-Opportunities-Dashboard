// netlify/functions/fw-debug-blobs.mjs
export async function handler() {
  try {
    const { getStore } = await import("@netlify/blobs");

    const SITE_ID = process.env.BLOBS_SITE_ID;
    const TOKEN   = process.env.BLOBS_TOKEN;
    if (!SITE_ID || !TOKEN) {
      throw new Error("Missing BLOBS_SITE_ID or BLOBS_TOKEN");
    }

    const store = getStore({ name: "frameworks", siteID: SITE_ID, token: TOKEN });
    const payload = { updatedAt: new Date().toISOString(), count: 0, items: [] };
    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, wrote: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(err),
        stack: err?.stack || null,
      }),
    };
  }
}
