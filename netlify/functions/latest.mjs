import { getStore } from "@netlify/blobs";

export async function handler() {
  try {
    const store = getStore();
    const json = await store.get("latest.json");
    const data = json ? JSON.parse(json) : { updatedAt: null, items: [] };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error("latest error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ updatedAt: null, items: [] })
    };
  }
}
