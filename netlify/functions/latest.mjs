// netlify/functions/latest.mjs
// Reads the last saved snapshot from Netlify Blobs (built-in `netlify:blobs`)
import { getStore } from "netlify:blobs";

export async function handler() {
  try {
    const store = getStore();
    const json = await store.get("latest.json"); // returns string or null
    const data = json ? JSON.parse(json) : { updatedAt: null, items: [] };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error("latest error:", err);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ updatedAt: null, items: [] })
    };
  }
}
