import { getStore } from "@netlify/blobs";

const store = getStore({
  name: "tenders",
  siteId: process.env.BLOBS_SITE_ID,
  token: process.env.BLOBS_TOKEN
});

export default async function handler() {
  console.log("▶ latest: fetching stored tenders");
  const data = await store.getJSON("latest") || [];
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
}
