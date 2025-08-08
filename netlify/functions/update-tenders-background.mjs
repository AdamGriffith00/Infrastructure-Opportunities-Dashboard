// netlify/functions/update-tenders-background.mjs
import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

function tendersStore() {
  if (!SITE_ID || !TOKEN) throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN');
  return getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
}

/* ------------------- Gleeds-style filters ------------------- */
// Organisations we especially care about (feel free to extend)
const CLIENTS = [
  'Network Rail', 'Transport for London', 'TfL', 'Heathrow', 'Manchester Airport Group',
  'MAG', 'Gatwick', 'London Luton', 'TfGM', 'Transport for Greater Manchester',
  'United Utilities', 'Scottish Water', 'Anglian Water', 'Thames Water',
  'National Highways', 'Department for Transport', 'DfT',
  'Scottish Government', 'Welsh Government', 'DAERA', 'Translink'
];

// Sector/service keywords (lowercase)
const KEYWORDS = [
  // services
  'project management','programme management','cost management','quantity surveying',
  'qs','employer\'s agent','contract administration','commercial',
  'cdm','principal designer','design','multidisciplinary','pm','cm',
  // sectors
  'rail','station','rolling stock','depot','track','signalling',
  'highway','roads','bridge','transport','airport','aviation','runway','apron','airfield',
  'water','wastewater','sewer','treatment works','reservoir',
  'energy','substation','grid','renewable','solar','wind','battery',
  'estate','building','refurbishment','fit out','schools','hospital','housing','council',
  'framework','consultancy'
];

// CPV family prefixes often relevant to PM/CM/QS/engineering/construction
const CPV_PREFIXES = [
  '71000000','71300000','71310000','71311000','71312000','71313000','71315000',
  '71320000','71330000','71340000','71400000','71500000','71530000','71540000',
  '71600000','72200000','73000000','45200000','45000000'
];

const MAX_CF_PAGES  = 20;   // up to ~2,000 records via OCDS
const MAX_FTS_BATCH = 10;   // up to ~1,000 records via cursor
const TODAY_ISO     = new Date().toISOString();

/* ------------------- Helpers ------------------- */
function norm(str) { return (str || '').toString().toLowerCase(); }
function anyContains(hay, needles) { const h = norm(hay); return needles.some(n => h.includes(n.toLowerCase())); }
function cpvHit(cpvList = []) {
  const codes = (cpvList || []).map(c => (c.code || c||'').toString());
  return codes.some(code => CPV_PREFIXES.some(pref => code.startsWith(pref)));
}
function future(dateStr) {
  if (!dateStr) return true; // keep if unknown
  const d = new Date(dateStr);
  return Number.isFinite(d.valueOf()) ? d > new Date() : true;
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(x => {
    const key = `${norm(x.title)}|${norm(x.organisation)}|${x.deadline||''}|${x.url||''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------- Normalisers ------------------- */
function normaliseFTS(r) {
  const title = r.tender?.title || r.title || r.ocid || '';
  const buyer = r.parties?.find(p => p.roles?.includes('buyer'))?.name || r.buyer?.name || '';
  const deadline = r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
  const region = r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '';
  const cpv = r.tender?.classification ? [r.tender.classification] : r.tender?.additionalClassifications || [];
  const ocid = r.ocid || r.id || '';
  const url = ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';

  return { source: 'FTS', title, organisation: buyer, region, deadline, url, cpv };
}

function normaliseCF(rls) {
  // CF OCDS releases have similar structure
  const title = rls.tender?.title || rls.title || rls.ocid || '';
  const buyer = rls.parties?.find(p => p.roles?.includes('buyer'))?.name || rls.buyer?.name || '';
  const deadline = rls.tender?.tenderPeriod?.endDate || '';
  const region = rls.tender?.deliveryLocations?.[0]?.nuts || rls.tender?.deliveryAddresses?.[0]?.region || '';
  const cpv = rls.tender?.classification ? [rls.tender.classification] : rls.tender?.additionalClassifications || [];
  const ocid = rls.ocid || rls.id || '';
  const url = ocid ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}` : '';

  return { source: 'CF', title, organisation: buyer, region, deadline, url, cpv };
}

/* ------------------- Fetchers ------------------- */
async function fetchCF_OCDS() {
  const out = [];
  for (let page = 1; page <= MAX_CF_PAGES; page++) {
    const url = new URL('https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search');
    url.searchParams.set('stages', 'tender');   // open tenders
    url.searchParams.set('order', 'desc');
    url.searchParams.set('limit', '100');
    url.searchParams.set('page', String(page));
    // keep results stable for this run
    url.searchParams.set('publishedTo', TODAY_ISO);

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const json = await res.json();
    const rel = json?.releases || [];
    if (!rel.length) break;

    out.push(...rel.map(normaliseCF));
  }
  return out;
}

async function fetchFTS_All() {
  const out = [];
  let cursor = null;
  for (let i = 0; i < MAX_FTS_BATCH; i++) {
    const url = new URL('https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages');
    url.searchParams.set('stages', 'tender');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const json = await res.json();
    const releases = json?.releases || [];
    if (!releases.length) break;

    out.push(...releases.map(normaliseFTS));
    cursor = json.nextCursor;
    if (!cursor) break;
  }
  return out;
}

/* ------------------- Filter logic ------------------- */
function passesGleedsFilters(item) {
  // Keep only future (or unknown) deadlines
  if (!future(item.deadline)) return false;

  // Buyer match OR sector keyword match OR CPV match
  const buyerHit = anyContains(item.organisation, CLIENTS);
  const keywordHit = anyContains(`${item.title} ${item.organisation}`, KEYWORDS);
  const cpvMatch = cpvHit(item.cpv);

  return buyerHit || keywordHit || cpvMatch;
}

/* ------------------- Handler ------------------- */
export async function handler() {
  console.log('▶ update-tenders-background: start');
  try {
    const [cf, fts] = await Promise.all([fetchCF_OCDS(), fetchFTS_All()]);
    let items = dedupe([...cf, ...fts]).filter(passesGleedsFilters);

    const payload = {
      updatedAt: new Date().toISOString(),
      counts: { cf: cf.length, fts: fts.length, final: items.length },
      items
    };

    await tendersStore().setJSON('latest', payload);
    console.log(`✔ saved ${items.length} items (from CF:${cf.length} FTS:${fts.length})`);

    return { statusCode: 200, body: JSON.stringify({ ok: true, counts: payload.counts }) };
  } catch (err) {
    console.error('✖ update-tenders-background error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
