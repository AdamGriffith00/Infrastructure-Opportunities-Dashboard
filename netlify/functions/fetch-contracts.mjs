import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

// SERVICES you provide
const SERVICE_KEYWORDS = [
  "cost management", "quantity surveying", "project controls",
  "project management", "cost assurance", "procurement advisory",
  "digital PMO", "ESG", "net zero", "sustainability"
];

// SECTORS to target (no energy-related terms)
const SECTOR_KEYWORDS = [
  "rail", "highways", "road", "aviation", "airport",
  "maritime", "port", "dock", "utilities", "water",
  "gas", "telecom", "infrastructure"
];

// CPV codes for consultancy, PM, QS, etc. in the target sectors
const CPV_CODES = [
  "71300000", // Engineering services
  "71311000", // Civil engineering consultancy
  "71311200", // Transport systems consultancy
  "71311300", // Infrastructure consultancy
  "71312000", // Structural engineering
  "71313000", // Environmental engineering (non-energy)
  "71315200", // Building consultancy
  "71317100", // Highway engineering services
  "71317210", // Highways consultancy
  "71324000", // Quantity surveying
  "71530000", // Construction consultancy
  "71541000"  // Project management
];

// Region filter
const REGIONS = "England";

const API_URL = "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json";

function buildBody() {
  const keyword = [...SERVICE_KEYWORDS, ...SECTOR_KEYWORDS].join(" OR ");
  return {
    searchCriteria: {
      types: ["Opportunity"],
      statuses: ["Open"],
      regions: REGIONS,
      keyword,
      cpvCodes: CPV_CODES.join(",")
    },
    size: 200
  };
}

export default async () => {
  const store = getStore("contracts"); // Netlify Blobs store
  const key = "england-latest.json";

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBody()),
  });

  if (!res.ok) {
    return { statusCode: res.status, body: `Contracts Finder error ${res.status}` };
  }

  const data = await res.json(); // { hitCount, noticeList, ... }
  const now = new Date().toISOString();

  const items = (data.noticeList || []).map(x => {
    const n = x.item || {};
    return {
      id: n.id,
      title: n.title,
      organisation: n.organisationName,
      region: n.regionText || n.region,
      deadline: n.deadlineDate,
      published: n.publishedDate,
      valueLow: n.valueLow,
      valueHigh: n.valueHigh,
      cpv: n.cpvCodes,
      url: `https://www.contractsfinder.service.gov.uk/notice/${n.id}`
    };
  });

  const payload = { updatedAt: now, hitCount: data.hitCount || items.length, items };

  await store.set(key, JSON.stringify(payload));

  return { statusCode: 200, body: `Saved ${items.length} notices at ${now}` };
};
