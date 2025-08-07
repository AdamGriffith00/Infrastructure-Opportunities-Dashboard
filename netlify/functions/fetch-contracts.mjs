import { getStore } from "@netlify/blobs";

const CPV_CODES = [
  "71300000","71311000","71311200","71311300",
  "71312000","71313000","71315200","71317100",
  "71317210","71324000","71530000","71541000"
];

const SERVICE_KEYWORDS = [
  "cost management","quantity surveying","project controls",
  "project management","cost assurance","procurement advisory",
  "digital PMO","ESG","net zero","sustainability"
];

const SECTOR_KEYWORDS = [
  "rail","railway","station",
  "aviation","airport","runway","terminal",
  "maritime","port","dock","harbour","harbor",
  "utilities","water","wastewater","gas","telecom",
  "highways","highway","road","roads","bridge"
];

export async function handler() {
  try {
    const keyword = [...SERVICE_KEYWORDS, ...SECTOR_KEYWORDS].join(" OR ");

    const res = await fetch(
      "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          searchCriteria: {
            types: ["Opportunity"],
            statuses: ["Open"],
            regions: "England",
            keyword,
            cpvCodes: CPV_CODES.join(",")
          },
          size: 200
        })
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CF V2 ${res.status} ${res.statusText} — ${text.slice(0,180)}`);
    }

    const data = await res.json();
    const items = (data.noticeList || []).map(x => {
      const n = x.item || {};
      return {
        title: n.title || "",
        organisation: n.organisationName || "",
        region: n.regionText || n.region || "England",
        deadline: n.deadlineDate || null,
        valueLow: n.valueLow ?? null,
        valueHigh: n.valueHigh ?? null,
        url: n.id ? `https://www.contractsfinder.service.gov.uk/notice/${n.id}` : ""
      };
    });

    const payload = { updatedAt: new Date().toISOString(), items };

    // ✅ Name the store so Netlify knows where to save
    const store = getStore("contracts-data");
    await store.set("latest.json", JSON.stringify(payload));

    return { statusCode: 200, body: `Saved ${items.length} notices at ${payload.updatedAt}` };
  } catch (err) {
    console.error("fetch-contracts error:", err);
    return { statusCode: 500, body: `Error - ${err.message}` };
  }
}
