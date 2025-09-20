import { runFrameworksUpdate } from "../lib/frameworks-runner.mjs";

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler() {
  try {
    const result = await runFrameworksUpdate(); // merges adapters, filters, writes Blobs
    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("frameworks-update-background:", err);
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
