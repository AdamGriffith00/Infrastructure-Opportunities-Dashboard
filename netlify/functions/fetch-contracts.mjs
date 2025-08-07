// fetch-contracts.mjs
import { blob } from "@netlify/blobs";

export async function handler() {
  try {
    // Keywords to filter relevant to your business (no energy)
    const keywords = [
      "rail", "railway", "station",
      "airport", "aviation", "runway", "terminal",
      "port", "maritime", "dock", "harbour", "harbor",
      "utilities", "water", "wastewater", "gas", "telecom",
      "highway", "road", "roads", "bridge"
    ];

    // POST body for Contracts Finder API
    const body = {
      size: 50,
      searchTerm: keywords.join(" OR "),
      filters: {
        regions: ["England"]
      },
      sort: { field: "deadline", direction: "asc" }
    };

    // Use built-in fetch in Node 18+
    const res = await fetch("https://www.contractsfinder.service.gov.uk/Published/Notices/Search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Contracts Finder API returned ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // Map to simplified items
    const items = (data?.notices || []).map(n => ({
      title: n.title,
      organisation: n.organisationName,
      region: n.region || "",
      deadline: n.deadline,
      valueLow: n.valueLow,
      valueHigh: n.valueHigh,
      url: n.noticeIdentifier ? `https://www.contractsfinder.service.gov.uk/Notice/${n.noticeIdentifier}` : ""
    }));

    // Save to Netlify Blobs
    const store = blob();
    await store.setJSON("latest", {
      updatedAt: new Date().toISOString(),
      items
    });

    return {
      statusCode: 200,
      body: `Saved ${items.length} notices at ${new Date().toISOString()}`
    };
  } catch (err) {
    console.error("Fetch contracts error:", err);
    return {
      statusCode: 500,
      body: `Error - ${err.message}`
    };
  }
}
