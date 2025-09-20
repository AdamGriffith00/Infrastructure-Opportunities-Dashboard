// netlify/functions/frameworks-update-bg-inline.mjs
function json(s, b) {
  return { statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((r) => {
    const key =
      r.id?.toLowerCase?.() ||
      r.url?.toLowerCase?.() ||
      `${(r.name || "").toLowerCase()}|${(r.client || "").toLowerCase()}|${(r.expected_award_date || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonSector(s = "") {
  const t = String(s).toLowerCase();
  if (t.includes("highway")) return "Highways";
  if (t.includes("rail")) return "Rail";
  if (t.includes("aviation") || t.includes("airport")) return "Aviation";
  if (t.includes("maritime") || t.includes("port")) return "Maritime";
  if (t.includes("utilit") || t.includes("water") || t.includes("energy") || t.includes("power") || t.includes("gas"))
    return "Utilities";
  return "Infrastructure";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`[fw-inline] ${label} timed out after ${ms}ms`);
        resolve({ items: [], error: `timeout ${ms}ms` });
      }, ms);
    }),
  ]);
}

async function runAdapter(path, label, timeoutMs) {
  try {
    const mod = await import(path);        // dynamic import so syntax/path errors are caught
    const fn = mod?.default;
    if (typeof fn !== "function") return { items: [], error: "no default() export" };
    const res = await withTimeout(Promise.resolve(fn()), timeoutMs, label);
    const items = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
    return { items, error: null };
  } catch (e) {
    return { items: [], error: String(e?.message || e) };
  }
}

export async function handler(event) {
  try {
    const fast = event?.queryStringParameters?.fast === "1";
    const T = fast ? 8000 : 16000;

    // Adapters: adjust filenames if yours differ
    const [ccs, espo, yor, nepo] = await Promise.all([
      runAdapter("./adapters/frameworks-ccs.mjs",    "CCS",    T),
      runAdapter("./adapters/frameworks-espo.mjs",   "ESPO",   T),
      runAdapter("./adapters/frameworks-yorhub.mjs", "YORhub", T),
      runAdapter("./adapters/frameworks-nepo.mjs",   "NEPO",   T),
    ]);

    const sources = {
      ccs:  ccs.items.length,  ccsError:  ccs.error  || null,
      espo: espo.items.length, espoError: espo.error || null,
      yor:  yor.items.length,  yorError:  yor.error  || null,
      nepo: nepo.items.length, nepoError: nepo.error || null,
    };

    const merged = dedupe([
      ...ccs.items, ...espo.items, ...yor.items, ...nepo.items
    ]).map(fr => ({ ...fr, sector: canonSector(fr.sector) }));

    // Write to Blobs (always)
    const { getStore } = await import("@netlify/blobs");
    const SITE_ID = process.env.BLOBS_SITE_ID;
    const TOKEN   = process.env.BLOBS_TOKEN;
    if (!SITE_ID || !TOKEN) throw new Error("Blobs not configured (BLOBS_SITE_ID / BLOBS_TOKEN).");

    const store = getStore({ name: "frameworks", siteID: SITE_ID, token: TOKEN });
    const nowIso = new Date().toISOString();
    const payload = { updatedAt: nowIso, count: merged.length, items: merged };

    await store.setJSON("latest.json", payload);
    await store.setJSON("latest-raw.json", payload);

    return json(200, { ok: true, fast, sources, final: merged.length });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err), stack: err?.stack || null });
  }
}
