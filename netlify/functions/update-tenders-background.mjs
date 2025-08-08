// netlify/functions/update-tenders-background.mjs
// Background crawler: CF (OCDS) + FTS -> filter for Gleeds Infra -> save to Netlify Blobs (tenders.json)

import { createClient } from "@netlify/blobs";

const STORE_NAME = "tenders";
const CF_OCDS_BASE =
  "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";
const FTS_BASE =
  "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

// ---- Blobs client from env (BLOBS_SITE_ID, BLOBS_TOKEN) ----
function getStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error("Missing BLOBS_SITE_ID or BLOBS_TOKEN");
  }
  return createClient({ siteID, token });
}

/* ------------------------- Filters / taxonomy ------------------------- */

// Consultancy service keywords (broad)
const SERVICE_KEYWORDS = [
  "cost management", "quantity survey", "qs",
  "project controls", "programme controls", "pmo",
  "commercial management", "commercial support",
  "contract administration", "contract management", "nec",
  "benchmark", "business case", "strategy",
  "gateway", "assurance", "asset management",
  "risk management", "project management", "pm support",
  "procurement support", "technical advisor", "feasibility",
  "options appraisal", "framework", "consultancy", "professional services"
];

// Sector keywords (rail, aviation, maritime, utilities, highways)
const SECTOR_KEYWORDS = [
  { kw: "rail", sector: "Rail" },
  { kw: "network rail", sector: "Rail" },
  { kw: "station", sector: "Rail" },
  { kw: "signalling", sector: "Rail" },

  { kw: "aviation", sector: "Aviation" },
  { kw: "airport", sector: "Aviation" },
  { kw: "heathrow", sector: "Aviation" },
  { kw: "gatwick", sector: "Aviation" },
  { kw: "runway", sector: "Aviation" },
  { kw: "airfield", sector: "Aviation" },

  { kw: "maritime", sector: "Maritime" },
  { kw: "port", sector: "Maritime" },
  { kw: "harbour", sector: "Maritime" },
  { kw: "quay", sector: "Maritime" },
  { kw: "berth", sector: "Maritime" },

  { kw: "highway", sector: "Highways" },
  { kw: "road", sector: "Highways" },
  { kw: "bridge", sector: "Highways" },
  { kw: "national highways", sector: "Highways" },

  { kw: "utilities", sector: "Utilities" },
  { kw: "water", sector: "Utilities" },
  { kw: "wastewater", sector: "Utilities" },
  { kw: "sewer", sector: "Utilities" },
  { kw: "treatment works", sector: "Utilities" },
  { kw: "environment agency", sector: "Utilities" },
  { kw: "flood", sector: "Utilities" },
  { kw: "drainage", sector: "Utilities" },
  { kw: "united utilities", sector: "Utilities" },
  { kw: "scottish water", sector: "Utilities" },
  { kw: "welsh water", sector: "Utilities" },
  { kw: "anglian water", sector: "Utilities" },
  { kw: "tfgm", sector: "Highways" }
];

// Explicit energy-gen terms to exclude
const EXCLUDE_KEYWORDS = [
  "solar", "pv", "photovoltaic", "wind farm", "renewable",
  "battery", "bess", "hydrogen", "nuclear", "heat network"
];

// UK region prefixes (allow empty/unknown)
const REGION_KEEP_PREFIXES = ["UK", "GB", "ENG", "SCT", "WLS", "NIR"];

/* ------------------------------ Handler ------------------------------- */

export async function handler() {
  const started = Date.now();
  console.log("▶ update-tenders-background: start");

  try {
    // 1) Pull from sources (guarded pagination so job finishes promptly)
    const [cfRaw, ftsRaw] = await Promise.all([
      fetchCF_OCDS({ maxPages: 20, pageSize: 100 }),
      fetchFTS_OCDS({ maxBatches: 6, limit: 100 })
    ]);

    console.log(`… fetched: CF=${cfRaw.length} FTS=${ftsRaw.length}`);

    // 2) Merge + dedupe
    let items = dedupe([...cfRaw, ...ftsRaw]);
    const preFilter = items.length;

    // 3) Apply filters (deadline, services/sector, energy exclusion, UK region)
    const now = new Date();
    items = items
      .filter(i => keepFuture(i.deadline, now))
      .map(addSectorFromKeywords)               // infer sector if missing
      .filter(matchesServicesOrSector)          // must match services OR sector
      .filter(dropEnergyTerms)
      .filter(inUKRegion);

    const removed = preFilter - items.length;
    console.log(`… filtered: kept=${items.length} removed=${removed}`);

    // 4) Sort by soonest deadline (unknowns last)
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    // 5) Persist to Blobs as tenders.json
    const store = getStore();
    await store.set("tenders.json", JSON.stringify(items));
    console.log(`✔ saved ${items.length} items to blob "${STORE_NAME}/tenders.json" in ${Date.now() - started}ms`);

    // Background functions can still return a body; the caller gets a quick response.
    return new Response(JSON.stringify({ ok: true, saved: items.length }), {
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    console.error("✖ update-tenders-background error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}

/* --------------------------- Fetchers -------------------------------- */

async function fetchCF_OCDS({ maxPages = 20, pageSize = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${CF_OCDS_BASE}?status=Open&order=desc&pageSize=${pageSize}&page=${page}`;
    console.log(`CF page ${page}`);
    const res = await fetch(url, { headers: acceptJson() });
    if (!res.ok) break;

    const pkg = await res.json().catch(() => ({}));
    const releases = Array.isArray(pkg.releases) ? pkg.releases : [];
    if (!releases.length) break;

    for (const r of releases) out.push(mapCF(r));
    if (releases.length < pageSize) break;
  }
  return out;
}

async function fetchFTS_OCDS({ maxBatches = 6, limit = 100 } = {}) {
  const out = [];
  let cursor = "";
  for (let i = 1; i <= maxBatches; i++) {
    const u = new URL(FTS_BASE);
    u.searchParams.set("stages", "tender");
    u.searchParams.set("limit", String(limit));
    if (cursor) u.searchParams.set("cursor", cursor);

    console.log(`FTS batch ${i} ${cursor ? `(cursor ${cursor})` : "(first)"}`);
    const res = await fetch(u, { headers: acceptJson() });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    // typical shapes: { packages: [ { releases: [...] } ], links: { next } }
    const releases = Array.isArray(data.packages)
      ? data.packages.flatMap(p => p.releases || [])
      : (Array.isArray(data.releases) ? data.releases : []);

    for (const r of releases) out.push(mapFTS(r));

    cursor = data?.links?.next || data?.next || data?.cursor || "";
    if (!cursor) break;
  }
  return out;
}

/* --------------------------- Mappers --------------------------------- */

function mapCF(r) {
  const tender = r.tender || {};
  const parties = r.parties || [];
  const buyer = parties.find(p => (p.roles || []).includes("buyer"));

  return {
    source: "CF",
    id: r.ocid || r.id || "",
    title: tender.title || r.title || "",
    organisation: buyer?.name || "",
    description: tender.description || "",
    region: tender.deliveryLocations?.[0]?.nuts || tender.deliveryAddresses?.[0]?.region || "",
    deadline: tender.tenderPeriod?.endDate || "",
    url: r.ocid ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}` : ""
  };
}

function mapFTS(r) {
  const tender = r.tender || {};
  const parties = r.parties || [];
  const buyer = parties.find(p => (p.roles || []).includes("buyer"));

  return {
    source: "FTS",
    id: r.ocid || r.id || "",
    title: tender.title || r.title || "",
    organisation: buyer?.name || "",
    description: tender.description || "",
    region: tender.deliveryLocations?.[0]?.nuts || tender.deliveryAddresses?.[0]?.region || "",
    deadline: tender.tenderPeriod?.endDate || "",
    url: r.ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}` : ""
  };
}

/* --------------------------- Filtering -------------------------------- */

function keepFuture(deadline, now = new Date()) {
  if (!deadline) return true; // keep unknown deadlines
  const d = new Date(deadline);
  return Number.isFinite(+d) && d >= now;
}

function textBag(i) {
  return [
    i.title, i.description, i.organisation, i.region, i.url
  ].filter(Boolean).join(" ").toLowerCase();
}

function addSectorFromKeywords(i) {
  if (i.sector) return i;
  const t = textBag(i);
  const hit = SECTOR_KEYWORDS.find(x => t.includes(x.kw));
  return hit ? { ...i, sector: hit.sector } : { ...i, sector: "Other" };
}

function matchesServicesOrSector(i) {
  const t = textBag(i);
  const inServices = SERVICE_KEYWORDS.some(k => t.includes(k));
  const inSector   = (i.sector && i.sector !== "Other");
  return inServices || inSector;
}

function dropEnergyTerms(i) {
  const t = textBag(i);
  return !EXCLUDE_KEYWORDS.some(k => t.includes(k));
}

function inUKRegion(region) {
  if (!region) return true;
  const up = String(region).toUpperCase();
  return REGION_KEEP_PREFIXES.some(p => up.startsWith(p));
}

/* ----------------------------- Utils --------------------------------- */

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = `${(i.title||"").trim()}|${(i.organisation||"").trim()}|${(i.deadline||"").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function acceptJson() {
  return {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Gleeds-Infra-Dashboard/1.0"
  };
}
