export async function handler() {
  try {
    const cfResults = await fetchContractsFinder();
    const ftsResults = await fetchFindATender();

    let allItems = [...cfResults, ...ftsResults];
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

// ---------- Fetchers ----------
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

// ---------- Utils ----------
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = `${item.title}|${item.organisation}|${item.deadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
