import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

const store = getStore({
  name: "tenders",
  siteId: process.env.BLOBS_SITE_ID,
  token: process.env.BLOBS_TOKEN
});

export default async function handler() {
  console.log("▶ update-tenders-background: start");

  let tenders = [];

  // Filters
  const sectors = ["Infrastructure", "Rail", "Aviation", "Utilities", "Highways", "Maritime"];
  const services = [
    "Project management", "Cost consultancy", "Quantity surveying", "Programme management",
    "Commercial management", "Technical advisory", "Feasibility studies",
    "Procurement support", "Contract administration", "Risk management"
  ];
  const clients = [
    "Network Rail", "HS2 Ltd", "National Highways", "Department for Transport", "Transport for London",
    "Crossrail", "Heathrow Airport Holdings", "Gatwick Airport Limited", "Manchester Airports Group",
    "Birmingham Airport", "Scottish Government Transport Scotland", "Associated British Ports", "Peel Ports",
    "Dover Harbour Board", "Anglian Water", "Thames Water", "Yorkshire Water", "Severn Trent Water",
    "United Utilities", "Scottish Water", "Northern Powergrid", "National Grid", "UK Power Networks",
    "Electricity North West", "Scottish and Southern Electricity Networks"
  ];

  // Pull from Contracts Finder
  for (let page = 1; page <= 20; page++) {
    console.log(`CF page ${page}`);
    const cfRes = await fetch(
      `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=50&page=${page}`
    );
    if (!cfRes.ok) break;
    const cfData = await cfRes.json();
    if (!cfData.records?.length) break;

    const filtered = cfData.records.filter(r =>
      sectors.some(s => r.sector?.includes(s)) ||
      services.some(s => r.description?.toLowerCase().includes(s.toLowerCase())) ||
      clients.some(c => r.organisation?.toLowerCase().includes(c.toLowerCase()))
    );

    tenders.push(...filtered);
  }

  // Pull from Find a Tender
  let cursor = null;
  let batch = 1;
  do {
    console.log(`FTS batch ${batch}`);
    const ftsURL = new URL("https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages");
    ftsURL.searchParams.set("stages", "tender");
    ftsURL.searchParams.set("limit", "100");
    if (cursor) ftsURL.searchParams.set("cursor", cursor);

    const ftsRes = await fetch(ftsURL);
    if (!ftsRes.ok) break;
    const ftsData = await ftsRes.json();

    const filtered = (ftsData.records || []).filter(r =>
      sectors.some(s => r.sector?.includes(s)) ||
      services.some(s => r.description?.toLowerCase().includes(s.toLowerCase())) ||
      clients.some(c => r.organisation?.toLowerCase().includes(c.toLowerCase()))
    );

    tenders.push(...filtered);
    cursor = ftsData.nextCursor;
    batch++;
  } while (cursor);

  console.log(`✔ saving ${tenders.length} tenders`);
  await store.setJSON("latest", tenders);
  return new Response(JSON.stringify({ saved: tenders.length }), { status: 200 });
}
