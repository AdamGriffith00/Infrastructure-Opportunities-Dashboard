// netlify/functions/latest.js
export async function handler() {
  try {
    const cf = await debugFetchCF();
    const fts = await debugFetchFTS();

    // Merge & dedupe whatever we found
    let items = dedupe([...(cf.items || []), ...(fts.items || [])]);

    // Sort by soonest deadline
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        debug: {
          cf: { status: cf.status, contentType: cf.contentType, keys: cf.keys, count: (cf.rawCount || 0) },
          fts: { status: fts.status, contentType: fts.contentType, keys: fts.keys, count: (fts.rawCount || 0) }
        },
        items
      })
    };
  } catch (err) {
    console.error("❌ latest.js fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

/* ---------------- CF (Contracts Finder) ---------------- */
async function debugFetchCF() {
  const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=1`;
  console.log(`🔎 CF GET ${url}`);
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  const status = res.status;

  let text = '';
  try { text = await res.text(); } catch (_) {}
  console.log(`CF status=${status} content-type=${contentType}`);
  console.log(`CF body preview:`, text.slice(0, 800));

  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.log(`CF JSON parse failed:`, e.message);
    return { status, contentType, keys: [], rawCount: 0, items: [] };
  }

  const keys = Object.keys(data || {});
  console.log(`CF top-level keys:`, keys);

  // Try common shapes
  let records = [];
  if (Array.isArray(data.records)) {
    records = data.records;
  } else if (Array.isArray(data.results)) {
    records = data.results;
  } else if (Array.isArray(data.items)) {
    records = data.items;
  } else if (Array.isArray(data.releases)) {
    records = data.releases;
  }

  console.log(`CF detected records count: ${records.length}`);

  const items = records.map(r => ({
    source: "CF",
    title: r.title || r.noticeTitle || "",
    organisation: r.organisationName || r.buyerName || "",
    region: r.region || r.location || "",
    deadline: r.deadline || r.tenderEndDate || r.submissionDeadline || "",
    url: r.noticeIdentifier
      ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
      : (r.url || r.link || "")
  }));

  // Log first mapped item for sanity
  if (items[0]) console.log(`CF first mapped:`, items[0]);

  return { status, contentType, keys, rawCount: records.length, items };
}

/* ---------------- FTS (Find a Tender) ---------------- */
async function debugFetchFTS() {
  const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&page=1&order=desc`;
  console.log(`🔎 FTS GET ${url}`);
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  const status = res.status;

  let text = '';
  try { text = await res.text(); } catch (_) {}
  console.log(`FTS status=${status} content-type=${contentType}`);
  console.log(`FTS body preview:`, text.slice(0, 800));

  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.log(`FTS JSON parse failed:`, e.message);
    return { status, contentType, keys: [], rawCount: 0, items: [] };
  }

  const keys = Object.keys(data || {});
  console.log(`FTS top-level keys:`, keys);

  // FTS has varied — try likely shapes
  let records = [];
  if (Array.isArray(data.records)) {
    records = data.records;
  } else if (Array.isArray(data.packages)) {
    // sometimes a list of packages with releases
    records = data.packages.flatMap(p => p.releases || []);
  } else if (Array.isArray(data.releases)) {
    records = data.releases;
  } else if (Array.isArray(data.items)) {
    records = data.items;
  }

  console.log(`FTS detected records count: ${records.length}`);

  const items = records.map(r => {
    // Try to normalize fields from different shapes
    const title =
      r.title || r.tender?.title || r.ocid || "";
    const buyerName =
      r.buyerName || r.buyer?.name || r.parties?.find(p => p.roles?.includes('buyer'))?.name || "";
    const region =
      r.region || r.tender?.deliveryAddresses?.[0]?.region || r.tender?.deliveryLocations?.[0]?.nuts || "";
    const deadline =
      r.deadline || r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || "";
    const noticeId =
      r.noticeIdentifier || r.id || r.ocid || "";

    const url = noticeId
      ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`
      : (r.url || r.links?.self || "");

    return {
      source: "FTS",
      title,
      organisation: buyerName,
      region,
      deadline,
      url
    };
  });

  if (items[0]) console.log(`FTS first mapped:`, items[0]);

  return { status, contentType, keys, rawCount: records.length, items };
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
