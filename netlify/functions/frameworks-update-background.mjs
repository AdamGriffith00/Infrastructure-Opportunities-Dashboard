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
    // Dynamic import so import-time errors surface in our catch:
    const mod = await import("../lib/frameworks-runner.mjs");
    if (!mod?.runFrameworksUpdate) {
      throw new Error("runFrameworksUpdate export not found in ../lib/frameworks-runner.mjs");
    }
    const result = await mod.runFrameworksUpdate();
    return json(200, { ok: true, ...result });
  } catch (err) {
    // SHOW the error in the browser so we can fix fast
    return json(500, {
      ok: false,
      error: err?.message || String(err),
      stack: err?.stack || null,
      hint:
        "Likely a bad import path or a runtime error inside frameworks-runner.mjs or an adapter it imports.",
    });
  }
}
