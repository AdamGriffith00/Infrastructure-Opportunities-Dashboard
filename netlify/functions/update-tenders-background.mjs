// netlify/functions/update-tenders-background.mjs
// Fetch CF + FTS, filter for Gleeds sectors/services/clients, dedupe, save to Netlify Blobs.
// Uses the older API: setJSON/getJSON with { siteID, token } (no getStore).

import { setJSON } from '@netlify/blobs';

// ---- Config ----
const BLOB_SITE = process.env.BLOBS_SITE_ID;
const BLOB_TOKEN = process.env.BLOBS_TOKEN;

// Sectors (strict)
const SECTORS = ["infrastructure", "rail", "aviation", "utilities", "highways", "maritime"];

// Services (broad, Gleeds-style)
const SERVICES = [
  "project management","programme management","program management",
  "cost consultancy","quantity surveying","qs",
  "commercial management","commercial support",
  "technical advisory","feasibility","options appraisal",
  "procurement support","contract administration","nec",
  "risk management","assurance","framework","professional services"
].map(s => s.toLowerCase());

// Broad clients across those sectors
const CLIENTS = [
  // Rail / Transport
  "network rail","hs2","transport for london","tfl","crossrail","tfgm","transport for greater manchester",
  // Highways
  "national highways","highways england","department for transport","dft",
  // Aviation
  "heathrow","gatwick","manchester airports group","mag","birmingham airport","london luton",
  // Maritime / Ports
  "associated british ports","abp","peel ports","dover harbour board","port of dover","port of liverpool","port of southampton","port of felixstowe",
  // Utilities / Water
  "united utilities","scottish water","welsh water","dwr cymru","anglian water","thames water","severn trent","yorkshire water","northumbrian water","southern water","wessex water",
  // Power networks (keep, still “utilities” even if not generation)
  "national grid","northern powergrid","uk power networks","electricity north west","scottish and southern electricity networks","ssen","western power"
].map(s => s.toLowerCase());

// Exclude obvious energy-generation only (we’re not targeting gen assets)
const EXCLUDE_TERMS = [
  "solar","photovoltaic","pv","wind farm","bess","battery energy storage","hydrogen","nuclear","heat network"
].map(s => s.toLowerCase());

// Pagination guards (avoid timeouts)
const CF_MAX_PAGES = 8;       // 8 * 100 = up to 800
const FTS_MAX_BATCHES = 8;    // up to ~800

// Helpers
const acceptJSON = {
  headers: { "accept": "application/json, text/plain, */*", "user-agent": "Gleeds-Infra/1.0" }
};
const nowMs = () => Date.now();

function norm(s) { return (s || "").toString().toLowerCase(); }
function anyHit(text, arr) { const t = norm(text); return arr.some(x => t.includes(x)); }
function notExpired(iso) {
  if (!iso) return true; // keep if unknown
  const d = new Date(iso);
  return Number.isFinite(+d) ? d.getTime() >= nowMs() : true;
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = `${norm(i.title)}|${norm(i.organisation)}|${i.deadline || ""}|${i.url || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Basic shape we want
function mapCF(r) {
  const t = r.tender || {};
  const buyer = (r.parties || []).find(p => Array.isArray(p.roles) && p.roles.includes("buyer"))?.name || r.buyer?.name || "";
  const ocid = r.ocid || r.id || r.noticeIdentifier || "";
  return {
    source: "CF",
    title: t.title || r.title || ocid || "",
    organisation: buyer || "",
    description: t.description || "",
    region: t.deliveryLocations?.[0]?.nuts || t.deliveryAddresses?.[0]?.region || r.region || "",
    deadline: t.tenderPeriod?.endDate || t.enquiryPeriod?.endDate || r.deadline || "",
    url: ocid ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : (r.url || "")
  };
}

function mapFTS(r) {
  const t = r.tender || {};
  const buyer = (r.parties || []).find(p => Array.isArray(p.roles) && p.roles.includes("buyer"))?.name || r.buyer?.name || "";
  const ocid = r.ocid || r.id || r.noticeIdentifier || "";
  return {
    source: "FTS",
    title: t.title || r.title || ocid || "",
    organisation: buyer || "",
    description: t.description || "",
    region: t.deliveryLocations?.[0]?.nuts || t.deliveryAddresses?.[0]?.region || r.region || "",
    deadline: t.tenderPeriod?.endDate || t.enquiryPeriod?.endDate || r.deadline || "",
    url: ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : (r.url || r.links?.self || "")
  };
}

// Sector/service/client filter
function matchesGleeds(i) {
  const bag = `${i.title} ${i.description} ${i.organisation}`.toLowerCase();

  // Drop generation-only energy work
  if (anyHit(bag, EXCLUDE_TERMS)) return false;

  // Sector intent via keywords (strict 6 sectors)
  const sectorHit = SECTORS.some(s => bag.includes(s));

  // Roles/services we can deliver
  const serviceHit = anyHit(bag, SERVICES);

  // Known client names
  const clientHit = anyHit(bag, CLIENTS);

  // Keep if any of the above
  return sectorHit || serviceHit || clientHit;
}

// Fetchers
async function fetchCF_OCDS() {
  const out = [];
  for (let page = 1; page <= CF_MAX_PAGES; page++) {
    console.log(`CF OCDS page ${page}`);
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=100&page=${page}`;
    const res = await fetch(url, acceptJSON);
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rel = Array.isArray(data.releases) ? data.releases
             : Array.isArray(data.records)  ? data.records
             : Array.isArray(data.items)    ? data.items
             : [];
    if (!rel.length) break;
    out.push(...rel.map(mapCF));
    if (rel.length < 100) break;
  }
  return out;
}

async function fetchFTS_cursor() {
  const out = [];
  let url = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=100";
  for (let i = 0; i < FTS_MAX_BATCHES && url; i++) {
    console.log(`FTS batch ${i + 1}`);
    const res = await fetch(url, acceptJSON);
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rel = Array.isArray(data.releases) ? data.releases
             : Array.isArray(data.packages) ? data.packages.flatMap(p => p.releases || [])
             : [];
    out.push(...rel.map(mapFTS));

    // find next cursor (API variants)
    url = data.next || data.cursorNext || data?.links?.next || null;
    if (url && typeof url === "object" && url.href) url = url.href;
  }
  return out;
}

export async function handler() {
  try {
    if (!BLOB_SITE || !BLOB_TOKEN) {
      console.warn("BLOBS_SITE_ID or BLOBS_TOKEN not set — will run but cannot persist results.");
    }

    const [cf, fts] = await Promise.all([fetchCF_OCDS(), fetchFTS_cursor()]);

    // Merge + dedupe
    let items = dedupe([...cf, ...fts]);

    // Drop expired & apply Gleeds filters
    items = items
      .filter(i => notExpired(i.deadline))
      .filter(matchesGleeds);

    // Sort by soonest deadline (unknowns last)
    items.sort((a, b) => {
      const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
      const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
      return da - db;
    });

    // Persist to blobs (older API)
    if (BLOB_SITE && BLOB_TOKEN) {
      await setJSON("tenders/latest.json", { updatedAt: new Date().toISOString(), items }, {
        siteID: BLOB_SITE,
        token: BLOB_TOKEN
      });
      console.log(`✔ saved ${items.length} items to blobs (tenders/latest.json)`);
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, counts: { cf: cf.length, fts: fts.length, final: items.length } })
    };
  } catch (e) {
    console.error("update-tenders-background error:", e?.stack || e?.message || e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || "failed" }) };
  }
}
