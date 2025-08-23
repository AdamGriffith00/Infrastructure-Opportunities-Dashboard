// netlify/functions/adapters/find-a-tender.mjs
import { normalizeItem } from '../lib/normalize.mjs';

// ---- Tunables (copied from your original)
const FTS_BATCH_MAX = 6;

const HEADERS = {
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Infrastructure Dashboard (Netlify Function)'
  }
};

// ---- Helper functions (copied from your original and kept identical)
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

function inferSector(title, buyer) {
  const txt = `${title || ''} ${buyer || ''}`.toLowerCase();
  if (txt.match(/rail|network rail|hs2/)) return 'Rail';
  if (txt.match(/airport|aviation|runway|heathrow|gatwick|mag|luton/)) return 'Aviation';
  if (txt.match(/road|highway|national highways/)) return 'Highways';
  if (txt.match(/water|sewer|wastewater|utilities|electric|power|gas|scottish water|united utilities|anglian water|thames water/)) return 'Utilities';
  if (txt.match(/port|harbour|harbor|maritime|dock/)) return 'Maritime';
  return 'Infrastructure';
}

// ---- The adapter: fetch + parse + normalise
export default async function findATenderAdapter() {
  const out = [];
  const updatedTo = new Date().toISOString().slice(0, 19); // yyyy-mm-ddTHH:MM:SS

  let cursor = '';
  for (let i = 0; i < FTS_BATCH_MAX; i++) {
    const base = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`;
    const qs = new URLSearchParams({ stages: 'tender', limit: '100', updatedTo });
    if (cursor) qs.set('cursor', cursor);

    const url = `${base}?${qs.toString()}`;
    const res = await fetch(url, HEADERS);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      console.log(`FTS batch ${i + 1}: non-JSON (${type}) — stopping.`);
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

      out.push(
        normalizeItem({
          source: 'Find a Tender',
          title,
          organisation: buyer,
          region,
          deadline,
          url: urlNotice,
          valueLow: pickValue(r, 'min'),
          valueHigh: pickValue(r, 'max'),
          sector: inferSector(title, buyer),
        })
      );
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
