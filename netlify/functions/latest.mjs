import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

export async function handler() {
  try {
    const cf = await fetchCF();
    const fts = await fetchFTS();

    // Merge, dedupe
    let items = dedupe([...(cf.items || []), ...(fts.items || [])]);

    // Remove expired and unwanted sectors
    const now = new Date();
    items = items.filter(item => {
      if (!item.deadline) return false;
      const deadlineDate = new Date(item.deadline);
      if (deadlineDate < now) return false; // expired
      if (
        /other sector/i.test(item.sector || "") ||
        /unspecified/i.test(item.sector || "")
      ) return false; // irrelevant
      return true;
    });

    // Sort by deadline
    items.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    // Optionally store latest in blobs (so background updates can use it too)
    const store = getStore({ name: "tenders" });
    await store.setJSON("latest.json", items);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: items.length,
        items
      })
    };
  } catch (err) {
    console.error("❌ latest.js fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

/* ---------------- Fetch Contracts Finder ---------------- */
async function fetchCF() {
  const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=50&page=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const data = await res.json();
  const records = Array.isArray(data.records) ? data.records : Array.isArray(data.releases) ? data.releases : [];
  
  const items = records.map(r => ({
    source: "CF",
    title: r.title || r.tender?.title || "",
    organisation: r.buyerName || r.parties?.find(p => p.roles?.includes("buyer"))?.name || "",
    sector: r.sector || "",
    deadline: r.deadline || r.tender?.tenderPeriod?.endDate || "",
    url: r.noticeIdentifier ? `https://www.contractsfinder.service.gov.uk/Notice/${r.noticeIdentifier}` : ""
  }));

  return { items };
}

/* ---------------- Fetch Find a Tender ---------------- */
async function fetchFTS() {
  const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=100`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const data = await res.json();
  const records = Array.isArray(data.packages) ? data.packages.flatMap(p => p.releases || []) : Array.isArray(data.releases) ? data.releases : [];
  
  const items = records.map(r => ({
    source: "FTS",
    title: r.title || r.tender?.title || "",
    organisation: r.buyerName || r.parties?.find(p => p.roles?.includes("buyer"))?.name || "",
    sector: r.sector || "",
    deadline: r.deadline || r.tender?.tenderPeriod?.endDate || "",
    url: r.ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}` : ""
  }));

  return { items };
}

/* ---------------- Utils ---------------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = `${item.title}|${item.organisation}|${item.deadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
