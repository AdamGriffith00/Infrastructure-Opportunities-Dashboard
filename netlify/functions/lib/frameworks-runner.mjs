// netlify/functions/lib/frameworks-runner.mjs
import { getStore } from "@netlify/blobs";

import fetchCCS    from "../adapters/frameworks-ccs.mjs";
import fetchYORhub from "../adapters/frameworks-yorhub.mjs";
import fetchESPO   from "../adapters/frameworks-espo.mjs";
import fetchNEPO   from "../adapters/frameworks-nepo.mjs";

// ---- Blobs env
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

// ---- MAIN (no filters)
export async function runFrameworksUpdate() {
  if (!SITE_ID || !TOKEN) {
    throw new Error("Blobs not configured (BLOBS_SITE_ID / BLOBS_TOKEN).");
  }

  // 1) Fetch from all adapters
  const [ccs, espo, yorhub, nepo] = await Promise.all([
    fetchCCS().catch(() => []),
    fetchESPO().catch(() => []),
    fetchYORhub().catch(() => []),
    fetchNEPO().catch(() => []),
  ]);

  // 2) Merge, dedupe, light normalisation only
  const merged = dedupe([...(ccs || []), ...(espo || []), ...(yorhub || []), ...(nepo || [])])
    .map((fr) => ({ ...fr, sector: canonSector(fr.sector) }));

  // 3) Write straight to blobs (no filtering)
  const store = getStore({ name: "frameworks", siteID: SITE_ID, token: TOKEN });
  const nowIso = new Date().toISOString();

  await store.setJSON("latest.json", {
    updatedAt: nowIso,
    count: merged.length,
    items: merged,
  });

  // (optional) keep a raw snapshot too
  await store.setJSON("latest-raw.json", {
    updatedAt: nowIso,
    count: merged.length,
    items: merged,
  });

  return {
    ok: true,
    sources: { ccs: ccs.length, espo: espo.length, yorhub: yorhub.length, nepo: nepo.length },
    final: merged.length,
  };
}
