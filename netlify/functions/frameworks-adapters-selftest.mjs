export async function handler() {
  try {
    const [ccs, yor, espo, nepo] = await Promise.all([
      import("../functions/adapters/frameworks-ccs.mjs").then(m => m.default()).catch(e => ({ error: String(e) })),
      import("../functions/adapters/frameworks-yorhub.mjs").then(m => m.default()).catch(e => ({ error: String(e) })),
      import("../functions/adapters/frameworks-espo.mjs").then(m => m.default()).catch(e => ({ error: String(e) })),
      import("../functions/adapters/frameworks-nepo.mjs").then(m => m.default()).catch(e => ({ error: String(e) })),
    ]);

    const shape = x => (Array.isArray(x) ? { ok: true, count: x.length } : { ok: false, error: x?.error || "unknown" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ccs: shape(ccs),
        yorhub: shape(yor),
        espo: shape(espo),
        nepo: shape(nepo),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}
