// /.netlify/functions/update-tenders
import { getStore } from '@netlify/blobs';

const MAX_CF_PAGES_PER_RUN  = 6;
const MAX_FTS_BATCHES_PER_RUN = 5;

const UA = {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)'
  }
};

export async function handler() {
  try {
    const store = getStore('tenders');

    const state = await store.get('state.json', { type: 'json' }) || { cfPage: 1, ftsCursor: '' };
    const existing = await store.get('latest.json', { type: 'json' }) || { updatedAt: null, items: [] };
    let items = Array.isArray(existing.items) ? existing.items : [];

    const [cfBatch, ftsBatch] = await Promise.all([
      fetchCF_OCDS_Pages(state.cfPage, MAX_CF_PAGES_PER_RUN),
      fetchFTS_OCDS_Cursor(state.ftsCursor, MAX_FTS_BATCHES_PER_RUN)
    ]);

    const merged = dedupe([...cfBatch.items, ...ftsBatch.items, ...items])
      .filter(filterFutureAndValid); // Apply deadline + sector filter

    const payload = {
      updatedAt: new Date().toISOString(),
      items: merged
    };
    await store.setJSON('latest.json', payload);

    const newState = {
      cfPage: cfBatch.nextPage || state.cfPage,
      ftsCursor: ftsBatch.nextCursor || state.ftsCursor,
    };
    await store.setJSON('state.json', newState);

    console.log('update-tenders: stored', merged.length, 'nextState:', newState);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Update completed',
        addedThisRun: cfBatch.items.length + ftsBatch.items.length,
        totalStored: merged.length,
        nextState: newState,
        updatedAt: payload.updatedAt
      })
    };
  } catch (e) {
    console.error('update-tenders error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

/* ---------- FILTERS ---------- */
function filterFutureAndValid(item) {
  if (!item.deadline) return false; // No deadline → ignore
  const deadlineDate = new Date(item.deadline);
  if (isNaN(deadlineDate) || deadlineDate < new Date()) return false; // Expired → ignore

  if (item.sector && item.sector.toLowerCase().includes('other')) return false; // Skip "Other"
  return true;
}

/* ---------- CF OCDS ---------- */
async function fetchCF_OCDS_Pages(startPage = 1, maxPages = 5) {
  const collected = [];
  let page = Math.max(1, parseInt(startPage, 10) || 1);
  let fetchedPages = 0;

  while (fetchedPages < maxPages) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=100&page=${page}`;
    console.log('CF OCDS GET page', page);
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    let raw = [];
    if (Array.isArray(data.releases)) raw = data.releases;
    else if (Array.isArray(data.records)) raw = data.records.flatMap(r => r.compiledRelease ? [r.compiledRelease] : []);
    else if (Array.isArray(data.packages)) raw = data.packages.flatMap(p => p.releases || []);

    if (!raw.length) break;

    collected.push(...raw.map(normalizeOCDSRelease).filter(Boolean));
    page++;
    fetchedPages++;
  }

  return { items: collected, nextPage: page };
}

/* ---------- FTS OCDS Cursor ---------- */
async function fetchFTS_OCDS_Cursor(startCursor = '', maxBatches = 5) {
  const collected = [];
  const base = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
  let cursor = startCursor || '';
  let batches = 0;

  while (batches < maxBatches) {
    const params = new URLSearchParams({ stages: 'tender', limit: '100' });
    if (cursor) params.set('cursor', cursor);

    const url = `${base}?${params.toString()}`;
    console.log('FTS OCDS GET', cursor ? `(cursor ${cursor})` : '(first)');
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    let raw = [];
    if (Array.isArray(data.releases)) raw = data.releases;
    else if (Array.isArray(data.packages)) raw = data.packages.flatMap(p => p.releases || []);
    else if (Array.isArray(data.records)) raw = data.records.flatMap(r => r.compiledRelease ? [r.compiledRelease] : []);

    if (!raw.length) break;

    collected.push(...raw.map(normalizeOCDSRelease).filter(Boolean));

    const next = data.nextCursor || '';
    if (!next) { cursor = ''; break; }
    cursor = next;
    batches++;
  }

  return { items: collected, nextCursor: cursor };
}

/* ---------- Normalize OCDS ---------- */
function normalizeOCDSRelease(r0) {
  const r = Array.isArray(r0?.releases) ? r0.releases[0] : (r0 || {});
  const tender = r.tender || {};
  const parties = r.parties || [];

  const buyerName =
    (r.buyer && r.buyer.name)
    || parties.find(p => Array.isArray(p.roles) && p.roles.includes('buyer'))?.name
    || '';

  const title = tender.title || r.title || '';
  const deadline =
    tender.tenderPeriod?.endDate
    || tender.enquiryPeriod?.endDate
    || r.tenderPeriod?.endDate
    || '';

  const region =
    tender.deliveryAddresses?.[0]?.region
    || tender.deliveryLocations?.[0]?.nuts
    || tender.items?.[0]?.deliveryLocation?.region
    || '';

  const noticeId = r.id || r.ocid || '';
  let url = noticeId
    ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`
    : '';

  const sector = tender.sector || r.sector || ''; // might be empty

  return {
    source: r.publisher?.name?.includes('Find a Tender') ? 'FTS' : 'CF',
    title,
    organisation: buyerName,
    region,
    deadline,
    sector,
    url
  };
}

/* ---------- Deduplicate ---------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(it => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
