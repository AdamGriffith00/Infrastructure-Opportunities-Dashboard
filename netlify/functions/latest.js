// CommonJS Netlify function: /.netlify/functions/latest
// CF + FTS with pagination, dedupe, and light logging.

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)' } };

module.exports.handler = async function () {
  try {
    const cfItems = await fetchAllCF();
    const ftsItems = await fetchAllFTS();

    console.log('CF total:', cfItems.length, 'FTS total:', ftsItems.length);

    let items = dedupe([...cfItems, ...ftsItems]);

    // Sort by soonest deadline
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        items
      })
    };
  } catch (err) {
    console.error('latest.js fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

/* ---------------- Contracts Finder (all pages) ---------------- */
async function fetchAllCF() {
  let page = 1;
  const all = [];
  while (page <= 100) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=${page}`;
    console.log('CF GET page', page);
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    const records = Array.isArray(data.records) ? data.records
                   : Array.isArray(data.results) ? data.results
                   : Array.isArray(data.items)   ? data.items
                   : [];
    if (!records.length) break;

    all.push(...records.map(r => ({
      source: 'CF',
      title: r.title || r.noticeTitle || '',
      organisation: r.organisationName || r.buyerName || '',
      region: r.region || r.location || '',
      deadline: r.deadline || r.tenderEndDate || r.submissionDeadline || '',
      url: r.noticeIdentifier
        ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
        : (r.url || r.link || '')
    })));

    page++;
  }
  return all;
}

/* ---------------- Find a Tender (all pages) ---------------- */
async function fetchAllFTS() {
  let page = 1;
  const all = [];
  while (page <= 100) {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&page=${page}&order=desc`;
    console.log('FTS GET page', page);
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    let records = [];
    if (Array.isArray(data.records)) records = data.records;
    else if (Array.isArray(data.packages)) records = data.packages.flatMap(p => p.releases || []);
    else if (Array.isArray(data.releases)) records = data.releases;
    else if (Array.isArray(data.items)) records = data.items;

    if (!records.length) break;

    all.push(...records.map(r => {
      const title = r.title || r.tender?.title || r.ocid || '';
      const buyerName = r.buyerName || r.buyer?.name || (r.parties?.find(p => p.roles?.includes('buyer'))?.name || '');
      const region = r.region || r.tender?.deliveryAddresses?.[0]?.region || r.tender?.deliveryLocations?.[0]?.nuts || '';
      const deadline = r.deadline || r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || '';
      const noticeId = r.noticeIdentifier || r.id || r.ocid || '';
      const urlLink = noticeId
        ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`
        : (r.url || r.links?.self || '');
      return { source: 'FTS', title, organisation: buyerName, region, deadline, url: urlLink };
    }));

    page++;
  }
  return all;
}

/* ---------------- Utils ---------------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = `${(item.title||'').trim()}|${(item.organisation||'').trim()}|${(item.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
