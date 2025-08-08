export async function handler() {
  try {
    let allItems = [];

    // Fetch from core government sources
    const cfResults = await fetchContractsFinder();
    console.log(`CF items: ${cfResults.length}`);

    const ftsResults = await fetchFindATender();
    console.log(`FTS items: ${ftsResults.length}`);

    // National Highways split from CF
    const nhResults = cfResults.filter(r =>
      (r.organisation || "").toLowerCase().includes("national highways")
    );
    const cfWithoutNH = cfResults.filter(r =>
      !(r.organisation || "").toLowerCase().includes("national highways")
    );
    console.log(`National Highways items: ${nhResults.length}`);

    // Other live sources
    const scotWaterResults = await safeFetch(fetchScottishWater, "Scottish Water");
    const s2wResults = await safeFetch(fetchSell2Wales, "Sell2Wales");
    const tfgmResults = await safeFetch(fetchTfGM, "TfGM");
    const magResults = await safeFetch(fetchMAG, "MAG");

    // Merge all
    allItems = [
      ...cfWithoutNH,
      ...ftsResults,
      ...nhResults.map(i => ({ ...i, source: "National Highways" })),
      ...scotWaterResults,
      ...s2wResults,
      ...tfgmResults,
      ...magResults
    ];

    // Deduplicate
    allItems = dedupe(allItems);

    // Sort by deadline soonest
    allItems.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        items: allItems
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

// ---------------- Core fetchers ----------------
async function fetchContractsFinder() {
  try {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records || []).map(r => ({
      source: "CF",
      title: r.title,
      organisation: r.organisationName,
      region: r.region,
      deadline: r.deadline,
      url: r.noticeIdentifier
        ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
        : ""
    }));
  } catch {
    return [];
  }
}

async function fetchFindATender() {
  try {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&order=desc`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records || []).map(r => ({
      source: "FTS",
      title: r.title,
      organisation: r.buyerName,
      region: r.region,
      deadline: r.deadline,
      url: r.noticeIdentifier
        ? `https://www.find-tender.service.gov.uk/Notice/${r.noticeIdentifier}`
        : ""
    }));
  } catch {
    return [];
  }
}

async function fetchScottishWater() {
  const url = `https://publiccontractsscotland.scot/api/NoticeSearch?keyword=Scottish%20Water`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.notices || []).map(n => ({
    source: "Scottish Water",
    title: n.title,
    organisation: n.organisationName || "Scottish Water",
    region: "Scotland",
    deadline: n.deadlineDate,
    url: n.noticeUrl
  }));
}

async function fetchSell2Wales() {
  const url = `https://www.sell2wales.gov.wales/api/searchnotices?keyword=utilities`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.notices || []).map(n => ({
    source: "Sell2Wales",
    title: n.title,
    organisation: n.organisationName,
    region: "Wales",
    deadline: n.deadlineDate,
    url: n.noticeUrl
  }));
}

async function fetchTfGM() {
  const url = `https://procontract.due-north.com/Advert?advertId=&fromAdvert=true&SearchString=tfGM`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const html = await res.text();
  const matches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?Deadline:(.*?)</g)];
  return matches.map(m => ({
    source: "TfGM",
    title: m[2].trim(),
    organisation: "Transport for Greater Manchester",
    region: "England",
    deadline: m[3] ? m[3].trim() : "",
    url: m[1].startsWith("http") ? m[1] : `https://procontract.due-north.com${m[1]}`
  }));
}

async function fetchMAG() {
  const url = `https://www.magairports.com/current-opportunities/`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const html = await res.text();
  const matches = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?Closing Date:?<\/strong>([^<]+)/gi)];
  return matches.map(m => ({
    source: "MAG",
    title: m[2].trim(),
    organisation: "Manchester Airports Group",
    region: "England",
    deadline: m[3] ? m[3].trim() : "",
    url: m[1].startsWith("http") ? m[1] : `https://www.magairports.com${m[1]}`
  }));
}

// ---------------- Helpers ----------------
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = `${item.title}|${item.organisation}|${item.deadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function safeFetch(fn, name) {
  try {
    const result = await fn();
    console.log(`${name} items: ${result.length}`);
    return result;
  } catch (err) {
    console.error(`${name} fetch failed:`, err);
    return [];
  }
}
