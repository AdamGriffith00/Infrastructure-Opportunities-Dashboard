// Background function: long-running crawler that writes to Netlify Blobs
// Requires env vars: BLOBS_SITE_ID, BLOBS_TOKEN (already set in your site)
// Endpoint: /.netlify/functions/update-tenders-background
import { getStore as _getStore } from '@netlify/blobs';

function getStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (!siteID || !token) throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN');
  return _getStore({ name, siteID, token });
}

// very light sector inference (only keep our 5 families)
function inferSector(title = '', org = '') {
  const t = `${title} ${org}`.toLowerCase();
  if (/rail(way)?|network\s*rail|tram|light\s*rail/.test(t)) return 'Rail';
  if (/airport|aviation|heathrow|gatwick|luton|mag\b|manchester\s*airport/.test(t)) return 'Aviation';
  if (/\bport\b|harbour|harbor|maritime|dock/.test(t)) return 'Maritime';
  if (/\bwater\b|wastewater|sewer|gas\b|electric|utilities?|\bukpn\b|uk\s*power\s*networks|united\s*utilities|scottish\s*water/.test(t)) return 'Utilities';
  if (/highway|roads?\b|\bmotorway\b|tfl|transport\s*for\s*london/.test(t)) return 'Highways';
  return null; // treat as Other
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = `${(i.title||'').trim()}|${(i.organisation||'').trim()}|${(i.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFuture(deadline) {
  if (!deadline) return false;
  const d = new Date(deadline);
  return Number.isFinite(+d) && d.getTime() > Date.now();
}

export async function handler(event, context) {
  console.log('▶ update-tenders-background: start');

  try {
    // Fetch CF (OCDS) — newest pages only this run to avoid timeouts
    const cf = await fetchCF_OCDS({ pages: 8, pageSize: 100, timeBudgetMs: 8 * 1000 });

    // Fetch FTS (cursor API) — a few batches only
    const fts = await fetchFTS_OCDS({ batches: 5, limit: 100, timeBudgetMs: 10 * 1000 });

    // Merge, infer sector, filter, sort
    let items = dedupe([...cf, ...fts])
      .map(i => ({ ...i, sector: inferSector(i.title, i.organisation) }))
      .filter(i => i.sector && isFuture(i.deadline))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    // Write to blobs
    const store = getStore('tenders');
    const payload = { updatedAt: new Date().toISOString(), items };
    await store.setJSON('latest.json', payload);

    console.log(`✔ saved ${items.length} items`);
    // Background functions return 202 to the caller automatically; a JSON body is fine.
    return new Response(JSON.stringify({ ok: true, saved: items.length }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    console.error('✖ update-tenders-background error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}

/* ---------------- CF via OCDS ---------------- */
async function fetchCF_OCDS({ pages = 6, pageSize = 100, timeBudgetMs = 8000 } = {}) {
  const out = [];
  const start = Date.now();
  for (let page = 1; page <= pages; page++) {
    if (Date.now() - start > timeBudgetMs) break;
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&page=${page}&limit=${pageSize}`;
    console.log('CF page', page);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const releases = Array.isArray(data.releases) ? data.releases : [];
    if (!releases.length) break;

    for (const r of releases) {
      const title = r.tender?.title || r.title || '';
      const organisation = r.parties?.find(p => p.roles?.includes('buyer'))?.name || r.buyer?.name || '';
      const deadline = r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
      const region = r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '';
      const ocid = r.ocid || r.id || '';
      const urlNotice = ocid ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';
      out.push({ source: 'CF', title, organisation, region, deadline, url: urlNotice });
    }
  }
  return out;
}

/* ---------------- FTS via OCDS (cursor) ---------------- */
async function fetchFTS_OCDS({ batches = 5, limit = 100, timeBudgetMs = 10000 } = {}) {
  const base = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
  const out = [];
  const start = Date.now();
  let cursor = '';
  for (let i = 0; i < batches; i++) {
    if (Date.now() - start > timeBudgetMs) break;
    const u = new URL(base);
    u.searchParams.set('stages', 'tender'); // API now expects stages/cursor/limit
    u.searchParams.set('limit', String(limit));
    if (cursor) u.searchParams.set('cursor', cursor);

    console.log('FTS batch', i + 1, cursor ? `(cursor ${cursor})` : '(first)');
    const res = await fetch(u, { headers: { Accept: 'application/json' } });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    const releases = Array.isArray(data.packages)
      ? data.packages.flatMap(p => p.releases || [])
      : (Array.isArray(data.releases) ? data.releases : []);

    for (const r of releases) {
      const title = r.tender?.title || r.title || '';
      const organisation = r.parties?.find(p => p.roles?.includes('buyer'))?.name || r.buyer?.name || '';
      const deadline = r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
      const region = r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '';
      const ocid = r.ocid || r.id || '';
      const urlNotice = ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';
      out.push({ source: 'FTS', title, organisation, region, deadline, url: urlNotice });
    }

    cursor = data?.links?.next || data?.next || '';
    if (!cursor) break;
  }
  return out;
}
