// /.netlify/functions/latest  — DIAGNOSTIC BUILD
const UA = {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)'
  }
};

module.exports.handler = async function () {
  try {
    const cf = await fetchCF_DIAG();
    const fts = await fetchFTS_DIAG();

    let items = dedupe([...(cf.items || []), ...(fts.items || [])]);
    items.sort((a, b) => (!a.deadline) - (!b.deadline) || new Date(a.deadline) - new Date(b.deadline));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        debug: {
          cf: { status: cf.status, type: cf.type, keys: cf.keys, rawCount: cf.rawCount },
          fts: { status: fts.status, type: fts.type, keys: fts.keys, rawCount: fts.rawCount }
        },
        items
      })
    };
  } catch (e) {
    console.error('latest.js fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

/* ---------------- CF (Contracts Finder) ---------------- */
async function fetchCF_DIAG() {
  // primary endpoint
  let url = 'https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=1';
  let res = await fetch(url, UA);
  let type = res.headers.get('content-type') || '';
  let status = res.status;
  let text = await res.text();

  console.log('CF status=', status, 'type=', type);
  console.log('CF body preview:', text.slice(0, 600));

  // if HTML page or empty JSON, try OCDS variant as a fallback
  if (!type.includes('application/json')) {
    const alt = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=50&page=1';
    console.log('CF retrying ALT endpoint:', alt);
    res = await fetch(alt, UA);
    type = res.headers.get('content-type') || '';
    status = res.status;
    text = await res.text();
    console.log('CF(ALT) status=', status, 'type=', type);
    console.log('CF(ALT) body preview:', text.slice(0, 600));
  }

  let data = {};
  try { data = JSON.parse(text); } catch { return { status, type, keys: [], rawCount: 0, items: [] }; }
  const keys = Object.keys(data || {});

  // common shapes
  const records = Array.isArray(data.records) ? data.records
                : Array.isArray(data.results) ? data.results
                : Array.isArray(data.items)   ? data.items
                : Array.isArray(data.releases)? data.releases
                : [];

  console.log('CF detected records:', records.length);

  const items = records.map(r => ({
    source: 'CF',
    title: r.title || r.noticeTitle || '',
    organisation: r.organisationName || r.buyerName || '',
    region: r.region || r.location || '',
    deadline: r.deadline || r.tenderEndDate || r.submissionDeadline || '',
    url: r.noticeIdentifier
      ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
      : (r.url || r.link || '')
  }));

  if (items[0]) console.log('CF first mapped:', items[0]);
  return { status, type, keys, rawCount: records.length, items };
}

/* ---------------- FTS (Find a Tender) ---------------- */
async function fetchFTS_DIAG() {
  const url = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&page=1&order=desc';
  const res = await fetch(url, UA);
  const type = res.headers.get('content-type') || '';
  const status = res.status;
  const text = await res.text();

  console.log('FTS status=', status, 'type=', type);
  console.log('FTS body preview:', text.slice(0, 600));

  let data = {};
  try { data = JSON.parse(text); } catch { return { status, type, keys: [], rawCount: 0, items: [] }; }
  const keys = Object.keys(data || {});

  let records = [];
  if (Array.isArray(data.records)) records = data.records;
  else if (Array.isArray(data.packages)) records = data.packages.flatMap(p => p.releases || []);
  else if (Array.isArray(data.releases)) records = data.releases;
  else if (Array.isArray(data.items)) records = data.items;

  console.log('FTS detected records:', records.length);

  const items = records.map(r => {
    const title = r.title || r.tender?.title || r.ocid || '';
    const buyerName = r.buyerName || r.buyer?.name || (r.parties?.find(p => p.roles?.includes('buyer'))?.name || '');
    const region = r.region || r.tender?.deliveryAddresses?.[0]?.region || r.tender?.deliveryLocations?.[0]?.nuts || '';
    const deadline = r.deadline || r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
    const noticeId = r.noticeIdentifier || r.id || r.ocid || '';
    const urlLink = noticeId
      ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`
      : (r.url || r.links?.self || '');
    return { source: 'FTS', title, organisation: buyerName, region, deadline, url: urlLink };
  });

  if (items[0]) console.log('FTS first mapped:', items[0]);
  return { status, type, keys, rawCount: records.length, items };
}

/* ---------------- Utils ---------------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(it => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
