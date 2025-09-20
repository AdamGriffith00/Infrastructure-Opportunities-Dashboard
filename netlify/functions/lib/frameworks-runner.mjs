// netlify/functions/lib/frameworks-runner.mjs
import { getStore } from "@netlify/blobs";

// Adapters (keep these filenames as you have them)
import fetchCCS    from "../adapters/frameworks-ccs.mjs";
import fetchYORhub from "../adapters/frameworks-yorhub.mjs";
import fetchESPO   from "../adapters/frameworks-espo.mjs";
import fetchNEPO   from "../adapters/frameworks-nepo.mjs";

// ---- ENV
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ---- Helpers
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

function withTimeout(promise, ms, label = "task") {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`[runner] ${label} timed out after ${ms}ms`);
        resolve([]); // treat timeout as empty
      }, ms);
    }),
  ]);
}

async function safeAdapter(fn, label, ms) {
  try {
    const res = await withTimeout(fn(), ms, label);
    return Array.isArray(res) ? res : [];
  } catch (e) {
    console.error(`[runner] ${label} error:`, e);
    return [];
  }
}

// ---- MAIN (no filters, resilient)
export async function runFrameworksUpdate({ fast = false } = {}) {
  if (!SITE_ID || !TOKEN) throw new Error("Blobs not configured (BLOBS_SITE_ID / BLOBS_TOKEN).");

  // Faster timeouts in fast mode
  const T_FAST = 8000;
  const T_FULL = 16000;
  const T = fast ? T_FAST : T_FULL;

  // Fetch in parallel, each with its own timeout + catch
  const [ccs, espo, yorhub, nepo] = await Promise.all([
    safeAdapter(fetchCCS,    "CCS",    T),
    safeAdapter(fetchESPO,   "ESPO",   T),
    safeAdapter(fetchYORhub, "YORhub", T),
    safeAdapter(fetchNEPO,   "NEPO",   T),
  ]);

  const merged = dedupe([...(ccs||[]), ...(espo||[]), ...(yorhub||[]), ...(nepo||[])])
    .map(fr => ({ ...fr, sector: canonSector(fr.sector) }));

  const store = getStore({ name: "frameworks", siteID: SITE_ID, token: TOKEN });
  const nowIso = new Date().toISOString();

  // write even if empty — avoids UI polling “hang”
  const payload = { updatedAt: nowIso, count: merged.length, items: merged };
  await store.setJSON("latest.json", payload);

  // optional: keep a raw snapshot too
  await store.setJSON("latest-raw.json", payload);

  return {
    ok: true,
    fast,
    sources: { ccs: ccs.length, espo: espo.length, yorhub: yorhub.length, nepo: nepo.length },
    final: merged.length,
  };
}
