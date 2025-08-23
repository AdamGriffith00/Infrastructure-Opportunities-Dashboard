// netlify/functions/update-tenders.mjs
// Manual/foreground updater + shared runUpdate() used by the background job

import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// Tunables
const CF_PAGES_MAX_FAST  = 2;
const CF_PAGES_MAX_FULL  = 12;
const FTS_BATCH_MAX_FAST = 1;
const FTS_BATCH_MAX_FULL = 6;

const HEADERS = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'Infrastructure Dashboard (Netlify Function)'
  }
};

// Infrastructure relevance filters
const SECTOR_KEYWORDS = [
  'infrastructure','rail','aviation','airport','runway','utilities','water','wastewater','sewer',
  'electric','electricity','energy','power','gas','highways','road','roads','transport','maritime',
  'port','harbour','harbor','dock'
];
const SERVICE_KEYWORDS = [
  'project management','pm support','programme management','contract administration','nec supervisor',
  'nec project manager','quantity surveying','qs','cost management','commercial management',
  'project controls','risk management','estimating','benchmarking','assurance','strategic advice',
  'business case','feasibility','procurement','tender support',"employer's agent"
];
const CLIENT_KEYWORDS = [
  'national highways','highways england','network rail','hs2','department for transport','dft',
  'transport for london','tfl','transport for greater manchester','tfgm','scottish water',
  'thames water','united utilities','anglian water','yorkshire water','severn trent','welsh water',
  'defence infrastructure organisation','dio','mod','nuclear decommissioning authority','nda',
  'heathrow','gatwick','manchester airport','mag','london luton airport','lla','bristol airport'
];

// ------------------------------ shared helpers

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

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
  if (txt.match(/water|sewer|wastewater|utilities|electric|power|gas|thames water|united utilities|anglian water/)) return 'Utilities';
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

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${(it.title||'').trim().toLowerCase()}|${(it.organisation||'').trim().toLowerCase()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function safeFetchJSON(url, { timeout = 15000 } = {}) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { ...HEADERS, signal: ac.signal });
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!type.includes('application/json')) {
      console.warn(`safeFetchJSON: non-JSON from ${url} (type=${type})`);
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`safeFetchJSON: JSON parse error from ${url}`);
      return null;
    }
  } finally {
    clearTimeout(id);
  }
}

// ------------------------------ source adapters

async function fetchCF(pagesMax) {
  const out = [];
  for (let page = 1; page <= pagesMax; page++) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?stages=tender&order=desc&pageSize=100&page=${page}`;
    const data = await safeFetchJSON(url);
    if (!data) break;

    const records = Array.isArray(data.releases) ? data.releases :
                    Array.isArray(data.records)  ? data.records  : [];
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
        sector: inferSector(title, buyer),
      });
    }
  }
  return out;
}

async function fetchFTS(batchesMax) {
  const out = [];
  const updatedTo = new Date().toISOString().slice(0, 19);

  let cursor = '';
  for (let i = 0; i < batchesMax; i++) {
    const base = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`;
    const qs = new URLSearchParams({ stages: 'tender', limit: '100', updatedTo });
    if (cursor) qs.set('cursor', cursor);
    const url = `${base}?${qs.toString()}`;

    const data = await safeFetchJSON(url);
    if (!data) break;

    const releases = Array.isArray(data.releases) ? data.releases :
                     Array.isArray(data.packages) ? data.packages.flatMap(p => p.releases || []) : [];

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
        sector: inferSector(title, buyer),
      });
    }

    // cursor
    const next = data?.links?.next || data?.next || '';
    if (!next) break;
    const parsed = typeof next === 'string' ? next : (next.href || '');
    const nextCursor = (parsed.match(/[?&]cursor=([^&]+)/) || [])[1];
    if (!nextCursor) break;
    cursor = decodeURIComponent(nextCursor);
  }
  return out;
}

// ------------------------------ shared runner

export async function runUpdate({ fast = false } = {}) {
  if (!SITE_ID || !TOKEN) {
    throw new Error('Blobs not configured. Ensure BLOBS_SITE_ID and BLOBS_TOKEN are set.');
  }

  const pagesMax  = fast ? CF_PAGES_MAX_FAST  : CF_PAGES_MAX_FULL;
  const batchesMax= fast ? FTS_BATCH_MAX_FAST : FTS_BATCH_MAX_FULL;

  console.log(`[update] starting; fast=${fast} (CF pages=${pagesMax}, FTS batches=${batchesMax})`);

  const [cfItems, ftsItems] = await Promise.all([
    fetchCF(pagesMax).catch(e => { console.error('CF fetch error', e); return []; }),
    fetchFTS(batchesMax).catch(e => { console.error('FTS fetch error', e); return []; }),
  ]);

  const merged = dedupe([...cfItems, ...ftsItems]);

  const now = Date.now();
  const relevant = merged.filter(it => {
    const dOk = it.deadline && Date.parse(it.deadline) > now;
    return dOk && looksRelevant(it);
  });

  relevant.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
  const payload = {
    updatedAt: new Date().toISOString(),
    count: relevant.length,
    items: relevant,
  };

  await store.setJSON('latest.json', payload);
  console.log(`[update] wrote ${relevant.length} records to Blobs`);
  return { cf: cfItems.length, fts: ftsItems.length, final: relevant.length };
}

// ------------------------------ manual HTTP handler

export async function handler(event) {
  try {
    // manual: allow ?fast=1 for a quick run so it doesn't hit 10s HTTP timeout
    const fast = event?.queryStringParameters?.fast === '1';
    const out = await runUpdate({ fast });
    return json(200, { ok:true, mode: fast ? 'fast' : 'full', counts: out });
  } catch (err) {
    console.error('update-tenders handler error:', err?.stack || err);
    return json(500, { ok:false, error: err?.message || String(err) });
  }
}
