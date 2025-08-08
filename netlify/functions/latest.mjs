export async function handler() {
  try {
    const cfResults = await fetchAllCF();
    const ftsResults = await fetchAllFTS();

    console.log(`CF fetched: ${cfResults.length} tenders`);
    console.log(`FTS fetched: ${ftsResults.length} tenders`);

    let allItems = [...cfResults, ...ftsResults];
    allItems = dedupe(allItems);

    // Sort by soonest deadline
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
    console.error("Error in latest.js:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

// ---------- Fetch all CF tenders ----------
async function fetchAllCF() {
  let results = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/Search?status=Open&order=desc&pageSize=50&page=${page}`;
    console.log(`Fetching CF page ${page}...`);
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();

    const records = data.records || [];
    if (records.length === 0) {
      keepGoing = false;
    } else {
      results.push(
        ...records.map(r => ({
          source: "CF",
          title: r.title,
          organisation: r.organisationName,
          region: r.region,
          deadline: r.deadline,
          url: r.noticeIdentifier
            ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}`
            : ""
        }))
      );
      page++;
    }
  }
  return results;
}

// ---------- Fetch all FTS tenders ----------
async function fetchAllFTS() {
  let results = [];
  let page = 0;
  let keepGoing = true;

  while (keepGoing) {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?status=Open&size=50&order=desc&from=${page * 50}`;
    console.log(`Fetching FTS page starting at ${page * 50}...`);
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();

    const records = data.records || [];
    if (records.length === 0) {
      keepGoing = false;
    } else {
      results.push(
        ...records.map(r => ({
          source: "FTS",
          title: r.title,
          organisation: r.buyerName,
          region: r.region,
          deadline: r.deadline,
          url: r.noticeIdentifier
            ? `https://www.find-tender.service.gov.uk/Notice/${r.noticeIdentifier}`
            : ""
        }))
      );
      page++;
    }
  }
  return results;
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
