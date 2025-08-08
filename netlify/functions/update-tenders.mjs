// netlify/functions/update-tenders.mjs
// Fetches from CF (OCDS) + FTS, merges, filters and stores into Netlify Blobs.

import { getStore as _getStore } from '@netlify/blobs';

function getTendersStore() {
  try {
    return _getStore('tenders');
  } catch {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error('Netlify Blobs not configured (missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN).');
    }
    return _getStore({ name: 'tenders', siteID, token });
  }
}

// ---- sector filter config (broad but clean) ----
const SECTOR_KEYWORDS = {
  rail:      [/rail(way)?/i, /network\s*rail/i, /tram/i, /light\s*rail/i],
  aviation:  [/airport/i, /aviation/i, /heathrow/i, /gatwick/i, /ltn|luton/i, /manchester\s*airport|mag\b/i],
  maritime:  [/port\b/i, /harbour|harbor/i, /maritime/i, /dock/i],
  utilities: [/water\b/i, /wastewater|sewer/i, /gas\b/i, /electric/i, /utilities?/i, /scottish\s*water/i, /united\s*utilities/i, /ukpn|uk\s*power\s*networks/i],
  highways:  [/highway/i, /road(?!map)/i, /\bmotorway\b/i, /transport\s*(for\s*)?london|tfl/i]
};

// keep only these five families
const SECTORS_ALLOW = Object.keys(SECTOR_KEYWORDS);

function classifySector(title = '', org = '') {
  const hay = `${title} ${org}`;
  for (const [sector, patterns] of Object.entries(SECTOR_KEYWORDS)) {
    if (patterns.some(rx => rx.test(hay))) return sector;
  }
  return null; // treat as "Other" -> will be filtered out
}

function futureISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isFinite(d.valueOf()) ? d.toISOString() : null;
}

function isFuture(dateStr) {
  if (!dateStr) return true; // if no deadline provided, keep it (safer)
  const d = new Date(dateStr);
  return isFinite(d.valueOf()) && d.getTime() > Date.now();
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- CF (Contracts Finder) via OCDS, paginated ----
async function fetchCF_OCDS({ maxPages = 20, pageSize = 100, timeBudgetMs = 25000 } = {}) {
  const base = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  const started = Date.now();
  let page = 1;
  const all = [];

  while (page <= maxPages && (Date.now() - started) < timeBudgetMs) {
    const url = `${base}?status=Open&order=desc&pageSize=${pageSize}&page=${page}`;
    console.log('CF OCDS GET page', page);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    const releases = Array.isArray(data.releases) ? data.releases : [];
    if (!releases.length) break;

    for (const r of releases) {
      const title = r.tender?.title || r.title || '';
      const buyer = r.parties?.find(p => p.roles?.includes('buyer'))?.name || r.buyer?.name || '';
      const deadline = r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
      const ocid = r.ocid || r.id || '';
      const urlN = ocid ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';

      all.push({
        source: 'CF',
        title,
        organisation: buyer,
        region: r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '',
        deadline: futureISO(deadline),
        url: urlN
      });
    }

    page += 1;
  }
  return all;
}

// ---- FTS (Find a Tender) OCDS API, cursor-based pagination ----
async function fetchFTS({ limit = 100, maxPages = 20, timeBudgetMs = 20000 } = {}) {
  // allowed params per error msg: stages, limit, cursor, updatedFrom, updatedTo
  const base = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
  const started = Date.now();
  let cursor = '';
  let pages = 0;
  const all = [];

  while (pages < maxPages && (Date.now() - started) < timeBudgetMs) {
    const url = new URL(base);
    url.searchParams.set('stages', 'tender');
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);

    console.log('FTS GET', url.toString());
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    // Typical shapes: { packages: [ { releases: [...] } ], links: { next: 'cursor...' } }
    const releases = Array.isArray(data.packages)
      ? data.packages.flatMap(p => p.releases || [])
      : (Array.isArray(data.releases) ? data.releases : []);

    for (const r of releases) {
      const title = r.tender?.title || r.title || '';
      const buyer = r.parties?.find(p => p.roles?.includes('buyer'))?.name || r.buyer?.name || '';
      const deadline = r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
      const ocid = r.ocid || r.id || '';
      const urlN = ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';

      all.push({
        source: 'FTS',
        title,
        organisation: buyer,
        region: r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '',
        deadline: futureISO(deadline),
        url: urlN
      });
    }

    // cursor/next handling
    cursor = data?.links?.next || data?.next || '';
    if (!cursor) break;
    pages += 1;
  }

  return all;
}

export async function handler() {
  try {
    // 1) fetch from both sources (in parallel)
    const [cf, fts] = await Promise.all([
      fetchCF_OCDS(),
      fetchFTS()
    ]);

    // 2) merge + dedupe
    let items = dedupe([...cf, ...fts]);

    // 3) apply sector + deadline filters
    items = items
      .map(it => ({ ...it, sector: classifySector(it.title, it.organisation) }))
      .filter(it => it.sector && SECTORS_ALLOW.includes(it.sector))
      .filter(it => isFuture(it.deadline));

    // 4) sort by soonest deadline
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    // 5) store to blobs
    const store = getTendersStore();
    const payload = { updatedAt: new Date().toISOString(), items };
    await store.setJSON('latest.json', payload);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, counts: { cf: cf.length, fts: fts.length, final: items.length } })
    };
  } catch (err) {
    console.error('update-tenders.mjs error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
