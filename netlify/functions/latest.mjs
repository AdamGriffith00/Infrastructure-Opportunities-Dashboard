// netlify/functions/latest.mjs
export async function handler() {
  try {
    const cf = await fetchCF();
    const fts = await fetchFTS();

    // Merge & dedupe
    let items = dedupe([...(cf.items || []), ...(fts.items || [])]);

    // Sort by soonest deadline
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        items
      })
    };
  } catch (err) {
    console.error("❌ latest.mjs fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

/* ---------------- CF (Contracts Finder) ---------------- */
async function fetchCF() {
  const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=1`;
  const res = await fetch(url);
  const text = await res.text();

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    return { items: [] };
  }

  let records = [];
  if (Array.isArray(data.records)) records = data.records;
  else if (Array.isArray(data.results)) records = data.results;
  else if (Array.isArray(data.items)) records = data.items;
  else if (Array.isArray(data.releases)) records = data.releases;

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

  return { items };
}

/* ---------------- FTS (Find a Tender) ---------------- */
async function fetchFTS() {
  const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&page=1&order=desc`;
  const res = await fetch(url);
  const text = await res.text();

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    return { items: [] };
  }

  let records = [];
  if (Array.isArray(data.records)) records = data.records;
  else if (Array.isArray(data.packages)) records = data.packages.flatMap(p => p.releases || []);
  else if (Array.isArray(data.releases)) records = data.releases;
  else if (Array.isArray(data.items)) records = data.items;

  const items = records.map(r => {
    const title = r.title || r.tender?.title || r.ocid || "";
    const buyerName = r.buyerName || r.buyer?.name || r.parties?.find(p => p.roles?.includes('buyer'))?.name || "";
    const region = r.region || r.tender?.deliveryAddresses?.[0]?.region || r.tender?.deliveryLocations?.[0]?.nuts || "";
    const deadline = r.deadline || r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || "";
    const noticeId = r.noticeIdentifier || r.id || r.ocid || "";

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

  return { items };
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
