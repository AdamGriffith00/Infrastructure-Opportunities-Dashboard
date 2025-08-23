// netlify/functions/adapters/contracts-finder.mjs
import { normalizeItem } from '../lib/normalize.mjs';

// ---- Tunables (copied from your original)
const CF_PAGES_MAX = 12;

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
export default async function contractsFinderAdapter() {
  const out = [];
  let page = 1;

  while (page <= CF_PAGES_MAX) {
    const url =
      `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search` +
      `?stages=tender&order=desc&pageSize=100&page=${page}`;

    const res = await fetch(url, HEADERS);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();

    // Stop if they switch us to HTML (login / error page)
    if (!type.includes('application/json')) {
      console.log(`CF page ${page} returned non-JSON (${type}); stopping.`);
      break;
    }

    let data;
    try { data = JSON.parse(text); } catch { break; }

    let records = [];
    if (Array.isArray(data.releases)) {
      records = data.releases;
    } else if (Array.isArray(data.records)) {
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

      out.push(
        normalizeItem({
          source: 'Contracts Finder',
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

    page += 1;
  }

  return out;
}
