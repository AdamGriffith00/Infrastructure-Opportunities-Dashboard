// netlify/functions/lib/frameworks-runner.mjs
import { getStore } from "@netlify/blobs";

// ---- Import adapters (relative to /functions/lib/)
import fetchCCS    from "../adapters/frameworks-ccs.mjs";
import fetchYORhub from "../adapters/frameworks-yorhub.mjs";
import fetchESPO   from "../adapters/frameworks-espo.mjs";
import fetchNEPO   from "../adapters/frameworks-nepo.mjs";

// ---- ENV
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ---- Canonical record shape (expected from adapters)
/*
  {
    id: "string",
    name: "Framework name",
    client: "Client/Authority",
    sector: "Highways" | "Rail" | "Aviation" | "Maritime" | "Utilities" | "Infrastructure",
    region: "England - National" | "UK" | "Wales" | ... (free text),
    value: { amount: 495000000, currency: "GBP", is_estimate: true }  // OR { note: "—" }
    expected_award_date: "YYYY-MM-DD" or ISO string (optional),
    source_url: "https://...",
    // optional extras:
    key_dates: [{ name, date, link? }],
    incumbents: [ "A", "B" ],
    position: { role: "Partner|Prime|Monitor", rationale: "..." },
    recruitment: [ { title, target, status, skills, priority } ],
    competition_watch: [ "X", "Y" ],
    competition_notes: "..."
  }
*/

// ---- Business rules (tuned for “Gleeds-y” frameworks)
const ALLOWED_SECTORS = new Set([
  "Highways", "Rail", "Aviation", "Maritime", "Utilities", "Infrastructure"
]);

// frameworks often span years; allow a generous horizon
const HORIZON_DAYS = 365 * 3;

// ignore tiny/irrelevant frameworks
const MIN_VALUE = 250_000;

// Optional relevance keywords (looser than opportunities)
const RELEVANCE_KEYWORDS = [
  // services
  "cost management", "quantity surveying", "qs", "commercial", "project controls",
  "scheduling", "schedule", "risk", "assurance", "programme", "program management",
  "project management", "nec", "framework management", "employer's agent",
  // sectors
  "highway", "road", "bridge", "rail", "station", "airport", "runway", "water",
  "wastewater", "sewer", "substation", "grid", "port", "harbour", "maritime"
];

// ---- Helpers
function withinHorizon(dateLike) {
  if (!dateLike) return true; // often unknown; don't drop purely for missing date
  const d = new Date(dateLike);
  if (Number.isNaN(+d)) return true;
  const cutoff = new Date(Date.now() + HORIZON_DAYS * 86400000);
  return d <= cutoff;
}

function numberish(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function extractAmount(v) {
  if (!v || typeof v !== "object") return null;
  if ("amount" in v) return numberish(v.amount);
  return null;
}

function looksRelevant(fr) {
  const blob = `${fr.name || ""} ${fr.client || ""}`.toLowerCase();
  return RELEVANCE_KEYWORDS.some(k => blob.includes(k));
}

function passesBusinessRules(fr) {
  if (fr.sector && !ALLOWED_SECTORS.has(fr.sector)) return false;

  const amt = extractAmount(fr.value);
  if (amt !== null && amt < MIN_VALUE) return false;

  if (!withinHorizon(fr.expected_award_date)) return false;

  // optional light keyword screen; adapters may already be curated
  return true;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(r => {
    const key =
      (r.id && String(r.id).toLowerCase()) ||
      `${(r.name || "").toLowerCase()}|${(r.client || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareAwardDate(a, b) {
  const da = a?.expected_award_date ? new Date(a.expected_award_date) : null;
  const db = b?.expected_award_date ? new Date(b.expected_award_date) : null;
  const na = da && !Number.isNaN(+da);
  const nb = db && !Number.isNaN(+db);
  if (na && nb) return da - db;
  if (na && !nb) return -1;
  if (!na && nb) return 1;
  // then by name
  return String(a.name || "").localeCompare(String(b.name || ""));
}

// ---- Main
export async function runFrameworksUpdate() {
  if (!SITE_ID || !TOKEN) {
    throw new Error("Blobs not configured. Set BLOBS_SITE_ID and BLOBS_TOKEN.");
  }

  // Fetch sources in parallel; if any fail, treat as empty
  const [ccs, yor, espo, nepo] = await Promise.all([
    fetchCCS().catch(e => { console.error("CCS adapter error:", e); return []; }),
    fetchYORhub().catch(e => { console.error("YORhub adapter error:", e); return []; }),
    fetchESPO().catch(e => { console.error("ESPO adapter error:", e); return []; }),
    fetchNEPO().catch(e => { console.error("NEPO adapter error:", e); return []; }),
  ]);

  // Merge + dedupe
  const merged = dedupe([ ...ccs, ...yor, ...espo, ...nepo ]);

  // Filter (Gleeds relevance + business rules)
  const filtered = merged.filter(fr => passesBusinessRules(fr) && looksRelevant(fr));

  // Sort by earliest award date (then name)
  filtered.sort(compareAwardDate);

  // Persist to Netlify Blobs
  const store = getStore({ name: "frameworks", siteID: SITE_ID, token: TOKEN });
  const payload = {
    updatedAt: new Date().toISOString(),
    count: filtered.length,
    items: filtered,
  };
  await store.setJSON("latest.json", payload);

  // Return counts for background function response/logs
  return {
    ok: true,
    sources: {
      ccs: ccs.length,
      yorhub: yor.length,
      espo: espo.length,
      nepo: nepo.length,
    },
    final: filtered.length,
  };
}
