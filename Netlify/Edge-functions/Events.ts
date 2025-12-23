import { getStore } from "https://esm.sh/@netlify/blobs@latest";

const STORE_NAME = "contracts";
const KEY = "england-latest.json";
const POLL_MS = 15000; // poll blobs and push if changed

export default async function handler(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let lastEtag = "";

      async function emit() {
        const store = getStore(STORE_NAME);
        const json = await store.get(KEY);
        if (!json) return;
        const hashBuf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(json)
        );
        const etag = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        if (etag !== lastEtag) {
          lastEtag = etag;
          controller.enqueue(enc.encode(`event: update\ndata: ${json}\n\n`));
        }
      }

      await emit(); // initial payload
      const interval = setInterval(emit, POLL_MS);
      const keepAlive = setInterval(() => {
        controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
      }, 20000);

      // close after 5 minutes; client will reconnect
      setTimeout(() => {
        clearInterval(interval);
        clearInterval(keepAlive);
        controller.close();
      }, 5 * 60 * 1000);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}

export const config = { path: "/events" };
