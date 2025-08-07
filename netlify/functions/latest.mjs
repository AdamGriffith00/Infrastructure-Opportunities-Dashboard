// latest.mjs
import { blob } from "@netlify/blobs";

export async function handler() {
  try {
    const store = blob();
    // Read whatever the fetcher saved
    const data = await store.getJSON("latest");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(data || { updatedAt: null, items: [] })
    };
  } catch (err) {
    console.error("latest error:", err);
    // Fail-soft so the page never breaks
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
