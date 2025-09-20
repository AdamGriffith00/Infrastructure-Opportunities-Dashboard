// netlify/functions/frameworks-update-background.mjs
function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler() {
  try {
    // IMPORTANT: dynamic import so we can catch import-time errors (bad paths/syntax)
    const mod = await import("../lib/frameworks-runner.mjs");
    if (!mod?.runFrameworksUpdate) {
      throw new Error("runFrameworksUpdate export not found in ../lib/frameworks-runner.mjs");
    }
    const result = await mod.runFrameworksUpdate();
    return json(200, { ok: true, ...result });
  } catch (err) {
    // Echo full details so you can see it in the browser (and in Netlify logs)
    return json(500, {
      ok: false,
      error: err?.message || String(err),
      stack: err?.stack || null,
      hint:
        "Likely a bad import path or syntax error in frameworks-runner.mjs or an adapter it imports.",
    });
  }
}
