const HEADERS = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'Infrastructure Opportunities Dashboard (Netlify Function)'
  }
};

// --- Minimal sector inference (identical logic to your runner)
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

async function safeFetchJSON(url, { timeout = 15000 } = {}) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { ...HEADERS, signal: ac.signal });
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!type.includes('application/json')) return null;
    try { return JSON.parse(text); } catch { return null; }
  } finally {
    clearTimeout(id);
  }
}

// Build a month window (MM-YYYY) string
function mmYYYY(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear());
  return `${m}-${y}`;
}

// Adjust this if S2W changes its API parameters.
// The idea is: request tender-stage notices for a given month, in OCDS JSON.
function buildUrl({ monthFrom }) {
  // Example pattern seen across devolved portals:
  //   /v1/Notices?noticeType=2&outputType=0&dateFrom=MM-YYYY
  const base = 'https://api.sell2wales.gov.wales/v1/Notices';
  const qs = new URLSearchParams({
    noticeType: '2',    // tenders
    outputType: '0',    // OCDS JSON
    dateFrom: monthFrom // MM-YYYY
  });
  return `${base}?${qs.toString()}`;
}

export default async function fetchSell2Wales({ months = 3 } = {}) {
  const out = [];
  const today = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const url = buildUrl({ monthFrom: mmYYYY(d) });

    const data = await safeFetchJSON(url);
    if (!data) continue;

    // Try to find OCDS releases in various shapes
    const releases = Array.isArray(data?.releases) ? data.releases
      : Array.isArray(data?.records) ? data.records
      : Array.isArray(data?.results) ? data.results
      : [];

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

      // Try to build a notice URL; fall back to any URL the record exposes
      const urlNotice = r?.url ||
        (id ? `https://www.sell2wales.gov.wales/search/show/search_view.aspx?ID=${encodeURIComponent(id)}` : '');

      out.push({
        source: 'S2W',
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
