import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

// SERVICES/SECTORS you provided
const SERVICE_KEYWORDS = [
  "cost management","project management","project controls","programme advisory",
  "quantity surveying","QS","PMO","schedule","planning","estimating"
];

const SECTOR_KEYWORDS = [
  "rail","utilities","water","energy","power","aviation","airport","maritime","port","highways","roads"
];

// Consultancy/PM/QS/engineering/project mgmt CPVs (tune as needed)
const CPV_CODES = ["71300000","71315200","71324000","71541000","71530000"];

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
