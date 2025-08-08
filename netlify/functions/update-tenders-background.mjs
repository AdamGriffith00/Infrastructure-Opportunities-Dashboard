// netlify/functions/update-tenders-background.mjs
// Fetch CF (OCDS) + FTS, filter to Gleeds' sectors/services, persist to Netlify Blobs.
// Requires env vars: BLOBS_SITE_ID, BLOBS_TOKEN
// npm dep: @netlify/blobs (and mark as external in netlify.toml if bundling complains)

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'tenders';
const CF_OCDS_BASE =
  'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
const FTS_BASE =
  'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';

const siteID = process.env.BLOBS_SITE_ID;
const token  = process.env.BLOBS_TOKEN;

if (!siteID || !token) {
  throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN environment variables.');
}

function store() {
  return getStore({ name: STORE_NAME, siteID, token });
}

/* ------------------------- Filters / taxonomy ------------------------- */

// CPV prefixes for sectors we care about
const SECTOR_BY_CPV_PREFIX = [
  { prefix: '7131', sector: 'Highways' }, // engineering services broadly
  { prefix: '7132', sector: 'Highways' },
  { prefix: '7133', sector: 'Highways' },
  { prefix: '7134', sector: 'Highways' },
  { prefix: '4523', sector: 'Highways' }, // road works
  { prefix: '4522', sector: 'Maritime' }, // harbour/sea works
  { prefix: '3493', sector: 'Maritime' }, // marine equipment
  { prefix: '4524', sector: 'Utilities' }, // utilities construction
  { prefix: '6511', sector: 'Utilities' }, // water
  { prefix: '6530', sector: 'Utilities' }, // electricity distribution
  { prefix: '713112', sector: 'Aviation' },
  { prefix: '713113', sector: 'Aviation' },
  { prefix: '63700000', sector: 'Aviation' }, // support services for transport incl. aviation
  { prefix: '71317210', sector: 'Rail' },     // railway engineering services
  { prefix: '45234100', sector: 'Rail' },     // railway construction works
  { prefix: '34940000', sector: 'Rail' }      // railway equipment
];

// Service keywords to *include* (case-insensitive)
const SERVICE_KEYWORDS = [
  'cost management', 'quantity survey', 'qs',
  'project controls', 'programme controls', 'pmo',
  'commercial management', 'claims', 'dispute',
  'benchmark', 'business case', 'strategy',
  'gateway', 'assurance', 'asset management',
  'nec', 'contract management', 'risk management',
  'project management', 'pm support'
];

// Explicit sector keywords (helps when CPV’s thin)
const SECTOR_KEYWORDS = [
  { kw: 'rail', sector: 'Rail' },
  { kw: 'network rail', sector: 'Rail' },
  { kw: 'aviation', sector: 'Aviation' },
  { kw: 'airport', sector: 'Aviation' },
  { kw: 'heathrow', sector: 'Aviation' },
  { kw: 'gatwick', sector: 'Aviation' },
  { kw: 'maritime', sector: 'Maritime' },
  { kw: 'port', sector: 'Maritime' },
  { kw: 'harbour', sector: 'Maritime' },
  { kw: 'utilities', sector: 'Utilities' },
  { kw: 'water', sector: 'Utilities' },
  { kw: 'wastewater', sector: 'Utilities' },
  { kw: 'electric', sector: 'Utilities' },
  { kw: 'gas', sector: 'Utilities' },
  { kw: 'highway', sector: 'Highways' },
  { kw: 'road', sector: 'Highways' }
];

// Hard-exclude energy/renewables (your request)
const EXCLUDE_KEYWORDS = [
  'solar', 'pv', 'photovoltaic',
  'wind', 'renewable', 'battery', 'bess',
  'hydrogen'
];

// UK locations to keep (null/empty allowed if everything else matches)
const REGION_KEEP_PREFIXES = ['UK', 'GB', 'ENG', 'SCT', 'WLS', 'NIR'];

/* ------------------------------ Handler ------------------------------- */

export async function handler() {
  const started = Date.now();
  console.log('▶ update-tenders-background: start');

  try {
    // 1) Pull from sources
    const [cfItems, ftsItems] = await Promise.all([
      fetchAllCF_OCDS(22 /* pages max */),
      fetchAllFTS(3   /* batches max */)
    ]);

    // 2) Normalise + merge
    let merged = dedupe([...cfItems, ...ftsItems]);

    // 3) Filter for Gleeds use
    merged = merged
      .filter(dropPastDeadlines)
      .filter(matchesServices)
      .filter(dropEnergy)
      .map(addSector)
      .filter(item => !!item.sector && inUK(item.region));

    // 4) Sort by soonest deadline
    merged.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    // 5) Persist to Netlify Blobs
    const payload = {
      updatedAt: new Date().toISOString(),
      count: merged.length,
      items: merged
    };

    await store().setJSON('latest.json', payload);
    console.log(`✔ saved ${merged.length} items`);

    return json({ ok: true, saved: merged.length, tookMs: Date.now() - started });
  } catch (err) {
    console.error('✖ update-tenders-background error:', err);
    return json({ ok: false, error: err.message }, 500);
  }
}

/* ------------------------- Source: Contracts Finder ------------------- */
// OCDS endpoint, paginated via page=1..N (pageSize=100 is allowed)
async function fetchAllCF_OCDS(maxPages = 20) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${CF_OCDS_BASE}?status=Open&order=desc&pageSize=100&page=${page}`;
    console.log(`CF page ${page}`);
    const res = await fetch(url, { headers: ua() });
    if (!res.ok) break;
    const data = await res.json();

    const releases = Array.isArray(data.releases) ? data.releases : [];
    if (!releases.length) break;

    for (const r of releases) {
      const tender = r.tender || {};
      const parties = r.parties || [];
      const buyerName = buyerFromParties(parties);

      items.push({
        source: 'CF',
        id: r.id || r.ocid || '',
        title: tender.title || r.title || '',
        organisation: buyerName,
        region: regionFromOCDS(r),
        deadline: tender.tenderPeriod?.endDate || '',
        valueLow: tender.value?.amount ?? null,
        valueHigh: null,
        url: r.ocid
          ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}`
          : (r.url || ''),
        cpv: cpvsFromOCDS(r)
      });
    }

    // If fewer than page size returned, probably the end
    if (releases.length < 100) break;
  }
  return items;
}

/* ------------------------- Source: Find a Tender ---------------------- */
// FTS uses cursor pagination; stages=tender is accepted; limit<=100
async function fetchAllFTS(maxBatches = 4) {
  const items = [];
  let cursor;
  for (let i = 1; i <= maxBatches; i++) {
    const params = new URLSearchParams({
      stages: 'tender',
      limit: '100',
      updatedTo: new Date().toISOString()
    });
    if (cursor) params.set('cursor', cursor);
    const url = `${FTS_BASE}?${params.toString()}`;
    console.log(`FTS batch ${i}${cursor ? ` (cursor ${cursor})` : ' (first)'}`);

    const res = await fetch(url, { headers: ua() });
    if (!res.ok) break;
    const data = await res.json();

    const packages = Array.isArray(data.packages) ? data.packages : [];
    if (!packages.length) break;

    for (const pack of packages) {
      const releases = pack.releases || [];
      for (const r of releases) {
        const tender = r.tender || {};
        const parties = r.parties || [];
        const buyerName = buyerFromParties(parties);

        items.push({
          source: 'FTS',
          id: r.id || r.ocid || '',
          title: tender.title || r.title || '',
          organisation: buyerName,
          region: regionFromOCDS(r),
          deadline: tender.tenderPeriod?.endDate || '',
          valueLow: tender.value?.amount ?? null,
          valueHigh: null,
          url: r.ocid
            ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}`
            : (r.url || ''),
          cpv: cpvsFromOCDS(r)
        });
      }
    }

    // Advance the cursor (FTS echoes it on the last package)
    cursor = data.cursor || (packages.at(-1)?.cursor);
    if (!cursor) break;
  }
  return items;
}

/* --------------------------- Filtering helpers ------------------------ */

function dropPastDeadlines(item) {
  if (!item.deadline) return true; // keep if unknown
  const d = new Date(item.deadline);
  return !Number.isNaN(+d) && d >= new Date();
}

function textBag(item) {
  const bits = [
    item.title, item.organisation, item.region,
    item.url, ...(item.cpv || [])
  ].filter(Boolean);
  return bits.join(' ').toLowerCase();
}

function matchesServices(item) {
  const t = textBag(item);
  return SERVICE_KEYWORDS.some(k => t.includes(k));
}

function dropEnergy(item) {
  const t = textBag(item);
  return !EXCLUDE_KEYWORDS.some(k => t.includes(k));
}

function addSector(item) {
  if (item.sector) return item;

  // 1) CPV prefixes
  if (Array.isArray(item.cpv)) {
    const cpvHit = SECTOR_BY_CPV_PREFIX.find(({ prefix }) =>
      item.cpv.some(c => String(c).startsWith(prefix))
    );
    if (cpvHit) return { ...item, sector: cpvHit.sector };
  }

  // 2) Keyword sector inference
  const t = textBag(item);
  const hit = SECTOR_KEYWORDS.find(({ kw }) => t.includes(kw));
  if (hit) return { ...item, sector: hit.sector };

  // Unknown sector => drop later
  return { ...item, sector: null };
}

function inUK(region) {
  if (!region) return true; // many feeds omit it; allow
  const up = String(region).toUpperCase();
  return REGION_KEEP_PREFIXES.some(p => up.startsWith(p));
}

/* ----------------------------- Utils --------------------------------- */

function ua() {
  return {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Gleeds-Infra-Dashboard/1.0'
  };
}

function buyerFromParties(parties) {
  const b = parties.find(p => Array.isArray(p.roles) && p.roles.includes('buyer'));
  return b?.name || '';
}

function cpvsFromOCDS(r) {
  const schemes =
    r.tender?.classification ? [r.tender.classification] : [];
  const addtl =
    Array.isArray(r.tender?.additionalClassifications) ? r.tender.additionalClassifications : [];
  const all = [...schemes, ...addtl]
    .map(c => c?.id)
    .filter(Boolean);
  return all;
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(it => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function json(obj, code = 200) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
