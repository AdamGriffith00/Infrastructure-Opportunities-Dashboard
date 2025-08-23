// netlify/functions/update-tenders-background.mjs
// A background/scheduled variant of update-tenders that can also be run manually.
// Use ?fast=1 for a short, interactive run in the browser.

import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// Defaults tuned for background runs. You can increase later if needed.
let CF_PAGES_MAX  = 12; // 12 * 100 = 1200
let FTS_BATCH_MAX = 6;  // 6 * 100 = 600

const HEADERS = {
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Infrastructure Dashboard (Netlify Function)'
  }
};

// ---------- helpers (same as update-tenders.mjs) ----------
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
const SECTOR_KEYWORDS = [
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
  'national highways','highways england','network rail','hs2','department for transport','dft',
  'transport for london','tfl','transport for greater manchester','tfgm','scottish water','scottish forestry',
  'thames water','united utilities','anglian water','yorkshire water','severn trent','welsh water',
  'defence infrastructure organisation','dio','mod','nuclear decommissioning authority','nda',
  'heathrow','gatwick','manchester airport','mag','london luton airport','lla','bristol airport',
  'southampton city council','glasgow city council','edinburgh city council'
];
function looksRelevant(it) {
  const blob = `${it.title || ''} ${it.organisation || ''}`.toLowerCase();
  const sectorHit  = SECTOR_KEYWORDS.some(k => blob.includes(k));
  const serviceHit = SERVICE_KEYWORDS.some(k => blob.includes(k));
  const clientHit  = CLIENT_KEYWORDS.some(k => blob.includes(k));
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
  const party = (r?.parties || []).find(p => (p.roles || []).includes('buyer'));
  return party?.name || r?.buyer?.name || r?.buyerName || '';
}
function pickValue(r, which) {
  const v = r?.tender?.value || {};
  if (which === 'min') return v.minimum ?? v.amount ?? null;
  if (which === 'max') return v.maximum ?? v.amount ?? null;
  return v.amount ?? null;
}

// ---------- source adapters (same as update-tenders.mjs) ----------
async function fetchCF() {
  const out = [];
  let page = 1;
  while (page <= CF_PAGES_MAX) {
    const url =
      `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search` +
      `?stages=tender&order=desc&pageSize=100&page=${page}`;
    const res = await fetch(url, HEADERS);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!type.includes('application/json')) {
      console.log(`CF page ${page} non-JSON (${type}); stopping.`);
      break;
    }
    let data; try { data = JSON.parse(text); } catch { break; }
    let records = [];
    if (Array.isArray(data.releases)) records = data.releases;
    else if (Array.isArray(data.records)) records = data.records;
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

async function fetchFTS() {
  const out = [];
  const updatedTo = new Date().toISOString().slice(0,19);
  let cursor = '';

  for (let i = 0; i < FTS_BATCH_MAX; i++) {
    const base = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`;
    const qs = new URLSearchParams({ stages: 'tender', limit: '100', updatedTo });
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

    const next = data?.links?.next || data?.next || '';
    if (!next) break;
    const parsed = typeof next === 'string' ? next : (next.href || '');
    const nextCursor = (parsed.match(/[?&]cursor=([^&]+)/) || [])[1];
    if (!nextCursor) break;
    cursor = decodeURIComponent(nextCursor);
  }
  return out;
}

// ---------- handler ----------
export async function handler(event) {
  try {
    const fast = (event?.queryStringParameters?.fast ?? '') === '1';
    if (fast) {
      CF_PAGES_MAX = 2;
      FTS_BATCH_MAX = 1;
    }
    console.log(`[bg-update] start; fast=${fast} (CF=${CF_PAGES_MAX}, FTS=${FTS_BATCH_MAX})`);

    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
    if (!store) {
      return json(500, { ok:false, error: 'Blobs not configured (siteID/token).' });
    }
    if (!SITE_ID || !TOKEN) {
      return json(500, { ok:false, error: 'Missing BLOBS_SITE_ID or BLOBS_TOKEN env vars.' });
    }

    const [cfItems, ftsItems] = await Promise.all([fetchCF(), fetchFTS()]);
    const merged = dedupe([...cfItems, ...ftsItems]);

    const now = Date.now();
    const relevant = merged.filter(it => {
      const dOk = it.deadline && Date.parse(it.deadline) > now;
      return dOk && looksRelevant(it);
    }).sort((a,b) => new Date(a.deadline) - new Date(b.deadline));

    const payload = {
      updatedAt: new Date().toISOString(),
      count: relevant.length,
      items: relevant
    };
    await store.setJSON('latest.json', payload);
    console.log(`[bg-update] wrote latest.json (${relevant.length} items)`);

    return json(200, { ok:true, mode: fast ? 'fast' : 'full', counts: { cf: cfItems.length, fts: ftsItems.length, final: relevant.length } });
  } catch (err) {
    console.error('[bg-update] error:', err);
    return json(500, { ok:false, error: err?.message ?? String(err) });
  }
}
