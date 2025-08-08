// netlify/functions/update-tenders.mjs

import { getStore } from '@netlify/blobs';

// ---- ENV → make sure these are set in Project configuration → Environment variables
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ---- Tunables
const CF_PAGES_MAX  = 12;   // how many CF pages (100 each) to walk (kept reasonable for runtime)
const FTS_BATCH_MAX = 6;    // how many FTS cursor pages (100 each)

const HEADERS = {
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Infrastructure Dashboard (Netlify Function)'
  }
};

// ---- Broad match keyword sets (lowercase)
const SECTOR_KEYWORDS = [
  // infrastructure families you asked to keep
  'infrastructure','rail','aviation','airport','runway','utilities','water','wastewater','sewer',
  'electric','electricity','energy','power','gas','highways','road','roads','transport','maritime',
  'port','harbour','harbor','dock'
];

const SERVICE_KEYWORDS = [
  'project management','pm support','programme management','contract administration','nec supervisor',
  'nec project manager','quantity surveying','qs','cost management','commercial management',
  'project controls','risk management','estimating','benchmarking','assurance','strategic advice',
  'business case','feasibility','procurement','tender support','employer\'s agent'
];

const CLIENT_KEYWORDS = [
  // major public/infra buyers (broad)
  'national highways','highways england','network rail','hs2','department for transport','dfT',
  'transport for london','tfl','transport for greater manchester','tfgm','scottish water','scottish forestry',
  'thames water','united utilities','anglian water','yorkshire water','severn trent','welsh water',
  'defence infrastructure organisation','dio','mod','nuclear decommissioning authority','nda',
  'heathrow','gatwick','manchester airport','mag','london luton airport','LLA','bristol airport',
  'southampton city council','glasgow city council','edinburgh city council'
];

// ------------------------------------------------------------

export async function handler() {
  try {
    // sanity for Blobs
    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
    if (!store) {
      return json(500, { ok:false, error: 'Blobs store not initialised. Check BLOBS_SITE_ID/BLOBS_TOKEN.' });
    }

    // Pull data
    const [cfItems, ftsItems] = await Promise.all([fetchCF(), fetchFTS()]);
    const merged = dedupe([...cfItems, ...ftsItems]);

    // Filter: future deadlines only + broad relevance
    const now = Date.now();
    const relevant = merged.filter(it => {
      const dOk = it.deadline && Date.parse(it.deadline) > now;
      return dOk && looksRelevant(it);
    });

    // Sort by soonest deadline
    relevant.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    // Save → Netlify Blobs
    const payload = {
      updatedAt: new Date().toISOString(),
      count: relevant.length,
      items: relevant
    };
    await store.setJSON('latest.json', payload);

    // Done
    return json(200, {
      ok: true,
      counts: { cf: cfItems.length, fts: ftsItems.length, final: relevant.length }
    });

  } catch (err) {
    console.error('update-tenders error:', err);
    return json(500, { ok:false, error: err.message ?? String(err) });
  }
}

// ------------------------------------------------------------
// Contracts Finder (use OCDS endpoint to avoid HTML pages)
async function fetchCF() {
  const out = [];
  let page = 1;

  // OCDS Search supports page + pageSize; keep to ~12 pages for function runtime
  while (page <= CF_PAGES_MAX) {
    const url =
      `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search` +
      `?stages=tender&order=desc&pageSize=100&page=${page}`;

    const res = await fetch(url, HEADERS);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();

    // Bail if they gave us HTML (e.g. login page)
    if (!type.includes('application/json')) {
      console.log(`CF page ${page} returned non-JSON (${type}); stopping.`);
      break;
    }

    let data;
    try { data = JSON.parse(text); } catch { break; }

    // common shapes (OCDS packages)
    let records = [];
    if (Array.isArray(data.releases)) {
      records = data.releases;
    } else if (Array.isArray(data.records)) { // rare
      records = data.records;
    }

    if (!records.length) break;

    for (const r of records) {
      const title = r?.tender?.title || r?.title || '';
      const buyer = findBuyerOCDS(r);
      const deadline =
        r?.tender?.tenderPeriod?.endDate ||
        r?.tender?.enquiryPeriod?.endDate || '';
      const region =
        r?.tender?.deliveryLocations?.[0]?.nuts ||
        r?.tender?.deliveryAddresses?.[0]?.region || '';
      const id = r?.ocid || r?.id || '';
      const urlNotice = id
        ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(id)}`
        : (r?.url || '');

      out.push({
        source: 'CF',
        title,
        organisation: buyer,
        region,
        deadline,
        url: urlNotice,
        valueLow: pickValue(r, 'min'),
        valueHigh: pickValue(r, 'max'),
        sector: inferSector(title, buyer)
      });
    }

    page += 1;
  }

  return out;
}

// ------------------------------------------------------------
// Find a Tender (official API with cursor pagination)
async function fetchFTS() {
  const out = [];
  // updatedTo keeps results finite & sortable
  const updatedTo = new Date().toISOString().slice(0,19); // yyyy-mm-ddTHH:MM:SS

  let cursor = '';
  for (let i = 0; i < FTS_BATCH_MAX; i++) {
    const base = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`;
    const qs = new URLSearchParams({
      stages: 'tender',
      limit: '100',
      updatedTo
    });
    if (cursor) qs.set('cursor', cursor);

    const url = `${base}?${qs.toString()}`;
    const res = await fetch(url, HEADERS);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      console.log(`FTS batch ${i+1}: non-JSON (${type}) — stopping.`);
      break;
    }

    const data = await res.json();

    let releases = [];
    if (Array.isArray(data.releases)) {
      releases = data.releases;
    } else if (Array.isArray(data.packages)) {
      releases = data.packages.flatMap(p => p.releases || []);
    }

    for (const r of releases) {
      const title = r?.tender?.title || r?.title || '';
      const buyer = findBuyerOCDS(r);
      const deadline =
        r?.tender?.tenderPeriod?.endDate ||
        r?.tender?.enquiryPeriod?.endDate || '';
      const region =
        r?.tender?.deliveryLocations?.[0]?.nuts ||
        r?.tender?.deliveryAddresses?.[0]?.region || '';
      const id = r?.ocid || r?.id || '';
      const urlNotice = id
        ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(id)}`
        : (r?.url || '');

      out.push({
        source: 'FTS',
        title,
        organisation: buyer,
        region,
        deadline,
        url: urlNotice,
        valueLow: pickValue(r, 'min'),
        valueHigh: pickValue(r, 'max'),
        sector: inferSector(title, buyer)
      });
    }

    // cursor handling
    const next = data?.links?.next || data?.next || '';
    if (!next) break;
    const parsed = typeof next === 'string' ? next : (next.href || '');
    const nextCursor = (parsed.match(/[?&]cursor=([^&]+)/) || [])[1];
    if (!nextCursor) break;
    cursor = decodeURIComponent(nextCursor);
  }

  return out;
}

// ------------------------------------------------------------
// Helpers

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${(it.title||'').trim().toLowerCase()}|${(it.organisation||'').trim().toLowerCase()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksRelevant(it) {
  const blob = `${it.title || ''} ${it.organisation || ''}`.toLowerCase();

  // sector OR service OR client → match
  const sectorHit  = SECTOR_KEYWORDS.some(k => blob.includes(k));
  const serviceHit = SERVICE_KEYWORDS.some(k => blob.includes(k));
  const clientHit  = CLIENT_KEYWORDS.some(k => blob.includes(k));

  // broad but still infrastructure-centric
  return sectorHit || serviceHit || clientHit;
}

function inferSector(title, buyer) {
  const txt = `${title || ''} ${buyer || ''}`.toLowerCase();
  if (txt.match(/rail|network rail|hs2/)) return 'Rail';
  if (txt.match(/airport|aviation|runway|heathrow|gatwick|mag|luton/)) return 'Aviation';
  if (txt.match(/road|highway|national highways/)) return 'Highways';
  if (txt.match(/water|sewer|wastewater|utilities|electric|power|gas|scottish water|united utilities|anglian water|thames water/)) return 'Utilities';
  if (txt.match(/port|harbour|harbor|maritime|dock/)) return 'Maritime';
  return 'Infrastructure';
}

function findBuyerOCDS(r) {
  // OCDS buyer is usually a party with role 'buyer'
  const party = (r?.parties || []).find(p => (p.roles || []).includes('buyer'));
  return party?.name || r?.buyer?.name || r?.buyerName || '';
}

function pickValue(r, which) {
  // Try OCDS tender.value.{minimum,maximum,amount}
  const v = r?.tender?.value || {};
  if (which === 'min') return v.minimum ?? v.amount ?? null;
  if (which === 'max') return v.maximum ?? v.amount ?? null;
  return v.amount ?? null;
}
