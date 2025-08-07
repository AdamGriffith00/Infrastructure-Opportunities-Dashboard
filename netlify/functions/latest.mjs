import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("contracts");
  const json = await store.get("england-latest.json");
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: json || JSON.stringify({ updatedAt: null, items: [] })
  };
};
