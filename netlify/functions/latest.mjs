export async function handler() {
  try {
    // Fetch CF and FTS only
    const cfResults = await fetchContractsFinder();
    console.log("=== CF Debug ===");
    console.log("CF raw count:", cfResults.length);
    if (cfResults[0]) console.log("CF first item:", cfResults[0]);

    const ftsResults = await fetchFindATender();
    console.log("=== FTS Debug ===");
    console.log("FTS raw count:", ftsResults.length);
    if (ftsResults[0]) console.log("FTS first item:", ftsResults[0]);

    // Merge & dedupe
    let allItems = [...cfResults, ...ftsResults];
    allItems = dedupe(allItems);

    // Sort soonest deadline first
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

// ---------- Simple CF / FTS fetchers ----------
async function fetchContractsFinder() {
  try {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=10`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("CF fetch failed:", res.status);
      return [];
    }
    const data = await res.json();
    console.log("CF API keys:", Object.keys(data)); // See structure
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
  } catch (err) {
    console.error("CF error:", err);
    return [];
  }
}

async function fetchFindATender() {
  try {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=10&order=desc`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("FTS fetch failed:", res.status);
      return [];
    }
    const data = await res.json();
    console.log("FTS API keys:", Object.keys(data)); // See structure
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
  } catch (err) {
    console.error("FTS error:", err);
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
