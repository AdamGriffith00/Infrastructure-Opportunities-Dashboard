// netlify/lib/update-runner.mjs
import { getStore } from '@netlify/blobs';
import fetchPCS from '../functions/adapters/public-contracts-scotland.mjs';
import fetchS2W from '../functions/adapters/sell2wales.mjs';

// ── ENV
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ── Source tunables
const CF_PAGES_MAX_FAST   = 2;
const CF_PAGES_MAX_FULL   = 12;
const FTS_BATCH_MAX_FAST  = 1;
const FTS_BATCH_MAX_FULL  = 6;
const PCS_LIMIT_FAST      = 250;
const PCS_LIMIT_FULL      = 2000;

// ── HTTP headers
const HEADERS = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'Infrastructure Opportunities Dashboard (Netlify Function)'
  }
};

// ── Business rules (portfolio of smaller infra jobs)
const HORIZON_DAYS = 180;           // keep deadlines within 6 months
const MIN_VALUE    = 10000;         // floor for “small but meaningful” work
const ALLOWED_SECTORS = new Set(['Highways','Rail','Aviation','Maritime','Utilities','Infrastructure']);

const BLOCKLIST_WORDS = [
  /catering/i, /cleaning/i, /janitorial/i, /grounds?\s*maintenance/i, /landscap(ing|e)/i,
  /security\s+(services?|guard)/i, /parking\s+enforcement/i, /waste\s+collection/i,
  /laundry/i, /uniform/i, /workwear/i, /printing?|photocop(ier|y)/i, /stationer(y|ies)/i,
  /food\s+suppl(y|ies)/i, /school\s+meals?/i, /bus( |-)services?/i, /courier/i, /postal/i,
  /social\s+care/i, /care\s+home/i, /teaching\s+services?/i, /agency\s+staff/i, /recruit(ment|ing)/i,
  /sport(ing)?\s+facilit(y|ies)/i, /leisure\s+centre/i, /cleaner/i, /window\s+clean/i
];

// Relevance keywords
const SECTOR_KEYWORDS = [
  // Highways
  'highway','highways','road','roads','trunk road','bridge','structures','maintenance',
  'pavement','resurfacing','carriageway','footway','roundabout','junction','signals',
  'traffic management','traffic signal','intelligent transport','its',
  // Rail
  'rail','railway','track','signalling','signal','overhead line','ole','platform','station upgrade','depot','level crossing','network rail','hs2',
  // Aviation
  'airport','aviation','runway','taxiway','apron','airfield lighting','a-gl','papi','ils','heathrow','gatwick','manchester airport','mag','luton','london city','bristol airport',
  // Utilities
  'utility','utilities','water','wastewater','sewer','treatment works','wtw','stw','pipelines','trunk main','potable','flood defence','reservoir','dam',
  'electric','electricity','substation','overhead line','underground cable','renewable','solar','wind','gas','district heating',
  // Maritime
  'maritime','port','harbour','harbor','dock','quay','berth','breakwater','lock gate'
];

const SERVICE_KEYWORDS = [
  'project management','programme management','program management','pm support',
  'contract administration','nec supervisor','nec project manager','nec pm',
  'quantity surveying','qs','cost management','commercial management',"employer's agent",
  'project controls','schedule','scheduling','planning','primavera','p6','risk management',
  'estimating','benchmarking','assurance','strategic advice','business case','feasibility',
  'procurement','tender support','cost estimate','cost plan','value management','value engineering',
  'cdm advisor','cdm adviser','client side project management'
];

const CLIENT_KEYWORDS = [
  'national highways','highways england','transport for london','tfl',
  'transport for greater manchester','tfgm','west midlands combined authority','wmca',
  'department for transport','dft','local highways authority','county council',
  'network rail','hs2','great british railways','gbr',
  'scottish water','thames water','united utilities','anglian water','yorkshire water',
  'severn trent','welsh water','northern ireland water','southern water',
  'national grid','uk power networks','ssent','ssen','sse','scottish power','northern powergrid',
  'heathrow','gatwick','manchester airport','mag','london luton airport','lla','london city airport',
  'defence infrastructure organisation','dio','mod',
  'nuclear decommissioning authority','nda','sellafield','hinkley','sizewell'
];

// ── Helpers
function quickKeywordHit(blob) {
  return (
    SECTOR_KEYWORDS.some(k => blob.includes(k)) ||
    SERVICE_KEYWORDS.some(k => blob.includes(k)) ||
    CLIENT_KEYWORDS.some(k => blob.includes(k))
  );
}

function looksRelevant(it) {
  const blob = `${it.title || ''} ${it.organisation || ''}`.toLowerCase();
  return quickKeywordHit(blob);
}

function withinHorizon(deadline) {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (Number.isNaN(+d)) return false;
  const cutoff = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  return d <= cutoff;
}

function passesBusinessRules(it) {
  if (!ALLOWED_SECTORS.has(it.sector)) return false;
  const v = it.valueHigh ?? it.valueLow ?? 0;
  if (v < MIN_VALUE) return false;
  const hay = `${it.title || ''} ${it.organisation || ''}`;
  if (BLOCKLIST_WORDS.some(rx => rx.test(hay))) return false;
  if (!withinHorizon(it.deadline)) return false;
  return true;
}

function inferSector(title, buyer) {
  const txt = `${title || ''} ${buyer || ''}`.toLowerCase();
  if (/(rail|network rail|hs2|station|platform)/i.test(txt)) return 'Rail';
  if (/(airport|aviation|runway|taxiway|heathrow|gatwick|mag|luton|london city|bristol)/i.test(txt)) return 'Aviation';
  if (/(road|highway|national highways|carriageway|footway|junction|bridge|resurfac)/i.test(txt)) return 'Highways';
  if (/(water|sewer|wastewater|treatment works|utilities|electric|substation|power|gas|district heating|reservoir|dam)/i.test(txt)) return 'Utilities';
  if (/(port|harbour|harbor|maritime|dock|quay|berth|breakwater|lock gate)/i.test(txt)) return 'Maritime';
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
    const key =
      it.url?.toLowerCase?.() ||
      it.id?.toLowerCase?.() ||
      `${(it.title||'').trim().toLowerCase()}|${(it.organisation||'').trim().toLowerCase()}|${(it.deadline||'').trim()}`;
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
    try { return JSON.parse(text); }
    catch { console.warn(`safeFetchJSON: JSON parse error from ${url}`); return null; }
  } finally {
    clearTimeout(id);
  }
}

// ── Adapters inline (CF/FTS) + PCS
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
      // quick early filter to skip obvious noise
      const quickBlob = `${title} ${buyer}`.toLowerCase();
      if (!quickKeywordHit(quickBlob)) continue;

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
      // quick early filter
      const quickBlob = `${title} ${buyer}`.toLowerCase();
      if (!quickKeywordHit(quickBlob)) continue;

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

    const next = data?.links?.next || data?.next || '';
    if (!next) break;
    const parsed = typeof next === 'string' ? next : (next.href || '');
    const nextCursor = (parsed.match(/[?&]cursor=([^&]+)/) || [])[1];
    if (!nextCursor) break;
    cursor = decodeURIComponent(nextCursor);
  }
  return out;
}

// ── Shared runner
export async function runUpdate({ fast = false } = {}) {
  if (!SITE_ID || !TOKEN) {
    throw new Error('Blobs not configured. Set BLOBS_SITE_ID and BLOBS_TOKEN in env.');
  }

  const pagesMax   = fast ? CF_PAGES_MAX_FAST   : CF_PAGES_MAX_FULL;
  const batchesMax = fast ? FTS_BATCH_MAX_FAST  : FTS_BATCH_MAX_FULL;
  const pcsLimit   = fast ? PCS_LIMIT_FAST      : PCS_LIMIT_FULL;

  console.log(`[update] start; fast=${fast} (CF=${pagesMax}, FTS=${batchesMax}, PCS=${pcsLimit})`);

  const [cfItems, ftsItems, pcsItems] = await Promise.all([
    fetchCF(pagesMax).catch(e => { console.error('CF fetch error', e); return []; }),
    fetchFTS(batchesMax).catch(e => { console.error('FTS fetch error', e); return []; }),
    fetchPCS({ limit: pcsLimit }).catch(e => { console.error('PCS fetch error', e); return []; })
  ]);

  const merged = dedupe([...cfItems, ...ftsItems, ...pcsItems]);
  const now = Date.now();

  const relevant = merged
    .filter(it => {
      const future = it.deadline && Date.parse(it.deadline) > now;
      return future && looksRelevant(it) && passesBusinessRules(it);
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
  await store.setJSON('latest.json', {
    updatedAt: new Date().toISOString(),
    count: relevant.length,
    items: relevant,
  });

  console.log(`[update] wrote ${relevant.length} items`);
  return { cf: cfItems.length, fts: ftsItems.length, pcs: pcsItems.length, final: relevant.length };
}
