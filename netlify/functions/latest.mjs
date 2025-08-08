// netlify/functions/latest.mjs

export async function handler() {
  try {
    const cfItems = await fetchAllCF();
    const ftsItems = await fetchAllFTS();

    console.log(`✅ CF total fetched: ${cfItems.length}`);
    console.log(`✅ FTS total fetched: ${ftsItems.length}`);

    let items = dedupe([...cfItems, ...ftsItems]);

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
        total: items.length,
        items
      })
    };
  } catch (err) {
    console.error("❌ latest.js fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

/* ---------------- Contracts Finder ---------------- */
async function fetchAllCF() {
  let page = 1;
  const all = [];
  while (true) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=${page}`;
    console.log(`🔎 CF GET ${url}`);
    const res = await fetch(url);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch (e) { break; }

    let records = data.records || data.results || data.items || [];
    if (!records.length) break;

    const mapped = records.map(r => ({
      source: "CF",
      title: r.title || r.noticeTitle || "",
      organisation: r.organisationName || r.buyerName || "",
      region: r.region || r.location || "",
      deadline: r.deadline || r.tenderEndDate || r.submissionDeadline || "",
      url: r.noticeIdentifier
        ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
        : (r.url || r.link || "")
    }));

    all.push(...mapped);
    page++;
    if (page > 100) break; // safeguard
  }
  return all;
}

/* ---------------- Find a Tender ---------------- */
async function fetchAllFTS() {
  let page = 1;
  const all = [];
  while (true) {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&page=${page}&order=desc`;
    console.log(`🔎 FTS GET ${url}`);
    const res = await fetch(url);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch (e) { break; }

    let records = [];
    if (Array.isArray(data.records)) {
      records = data.records;
    } else if (Array.isArray(data.packages)) {
      records = data.packages.flatMap(p => p.releases || []);
    } else if (Array.isArray(data.releases)) {
      records = data.releases;
    } else if (Array.isArray(data.items)) {
      records = data.items;
    }

    if (!records.length) break;

    const mapped = records.map(r => {
      const title = r.title || r.tender?.title || r.ocid || "";
      const buyerName =
        r.buyerName || r.buyer?.name || r.parties?.find(p => p.roles?.includes('buyer'))?.name || "";
      const region =
        r.region || r.tender?.deliveryAddresses?.[0]?.region || r.tender?.deliveryLocations?.[0]?.nuts || "";
      const deadline =
        r.deadline || r.tender?.tenderPeriod?.endDate || r.tender?.enquiryPeriod?.endDate || "";
      const noticeId =
        r.noticeIdentifier || r.id || r.ocid || "";

      const urlLink = noticeId
        ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`
        : (r.url || r.links?.self || "");

      return { source: "FTS", title, organisation: buyerName, region, deadline, url: urlLink };
    });

    all.push(...mapped);
    page++;
    if (page > 100) break; // safeguard
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
