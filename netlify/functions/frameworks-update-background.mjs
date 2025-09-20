function json(s, b) {
  return { statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) };
}

export async function handler() {
  try {
    // Dynamic import so errors surface as JSON
    const mod = await import("./lib/frameworks-runner.mjs");
    if (!mod?.runFrameworksUpdate) throw new Error("runFrameworksUpdate export not found");
    const result = await mod.runFrameworksUpdate();
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err), stack: err?.stack || null });
  }
}
