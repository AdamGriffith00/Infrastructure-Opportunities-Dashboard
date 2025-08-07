// netlify/functions/latest.mjs
// UK-wide (England + Scotland + Wales + Northern Ireland)
// Stateless: fetches from Contracts Finder V2 + Find a Tender (OCDS) on each call.

export async function handler() {
  try {
    // --- Filters (services + sectors) ---
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
    const KEYWORD_STRING = [...SERVICE_KEYWORDS, ...SECTOR_KEYWORDS].join(" OR ");
    const textMatches = (t="", buyer="") => {
      const hay = `${t} ${buyer}`.toLowerCase();
      return SECTOR_KEYWORDS.some(k => hay.includes(k)) ||
             SERVICE_KEYWORDS.some(k => hay.includes(k));
    };

    // --- Contracts Finder V2 (no region restriction = all UK) ---
    async function fetchContractsFinder() {
      const res = await fetch(
        "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            searchCriteria: {
              types: ["Opportunity"],
              statuses: ["Open"],
              // regions: "England",   // ⬅ removed so we get UK-wide
              keyword: KEYWORD_STRING,
              cpvCodes: CPV_CODES.join(",")
            },
            size: 200
          })
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`CF ${res.status} ${res.statusText} — ${text.slice(0,160)}`);
      }
      const data = await res.json();
      const items = (data.noticeList || []).map(x => {
        const n = x.item || {};
        return {
          source: "CF",
          id: n.id || "",
          title: n.title || "",
          organisation: n.organisationName || "",
          region: n.regionText || n.region || "",
          deadline: n.deadlineDate || null,
          valueLow: n.valueLow ?? null,
          valueHigh: n.valueHigh ?? null,
          url: n.id ? `https://www.contractsfinder.service.gov.uk/notice/${n.id}` : ""
        };
      });
      return items.filter(i => textMatches(i.title, i.organisation));
    }

    // --- Find a Tender (OCDS) ---
    async function fetchFTS() {
      const now = new Date();
      const from = new Date(now.getTime() - 30*24*60*60*1000);
      const fmt = (d) => d.toISOString().slice(0,19);
      const base = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

      let cursor = "";
      const out = [];

      for (let page = 0; page < 5; page++) {
        const url = new URL(base);
        url.searchParams.set("stages", "tender");
        url.searchParams.set("limit", "100");
        url.searchParams.set("updatedFrom", fmt(from));
        url.searchParams.set("updatedTo", fmt(now));
        if (cursor) url.searchParams.set("cursor", cursor);

        const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`FTS ${res.status} ${res.statusText} — ${text.slice(0,160)}`);
        }
        const pack = await res.json();
        const releases = Array.isArray(pack?.releases) ? pack.releases : [];

        for (const r of releases) {
          const tender = r?.tender || {};
          const parties = Array.isArray(r?.parties) ? r.parties : [];
          const buyerId = r?.buyer?.id;
          const buyer = parties.find(p => String(p.id) === String(buyerId)) ||
                        parties.find(p => (p.roles || []).includes("buyer")) || {};
          const region =
            (tender?.items?.[0]?.deliveryAddresses?.[0]?.region) ||
            buyer?.address?.region || "UK";
          const deadline =
            tender?.tenderPeriod?.endDate ||
            tender?.enquiryPeriod?.endDate || null;
          const amount = tender?.value?.amount ?? null;
          const title = tender?.title || r?.description || "";
          const organisation = buyer?.name || buyer?.identifier?.legalName || "";

          out.push({
            source: "FTS",
            id: r?.id || r?.ocid || "",
            title, organisation, region, deadline,
            valueLow: amount, valueHigh: null,
            url: r?.id ? `https://www.find-tender.service.gov.uk/Notice/${r.id}` : ""
          });
        }

        const next = res.headers.get("Cursor") || res.headers.get("cursor") || pack?.cursor;
        if (!next) break;
        cursor = next;
      }
      return out.filter(i => textMatches(i.title, i.organisation));
    }

    // --- Merge, de-dupe, sort ---
    const [cf, fts] = await Promise.allSettled([fetchContractsFinder(), fetchFTS()]);
    const cfItems  = cf.status  === "fulfilled" ? cf.value  : [];
    const ftsItems = fts.status === "fulfilled" ? fts.value : [];

    const key = (i) => `${(i.title||"").toLowerCase()}|${(i.organisation||"").toLowerCase()}|${i.deadline||""}`;
    const map = new Map();
    [...cfItems, ...ftsItems].forEach(i => { if (!map.has(key(i))) map.set(key(i), i); });

    const merged = Array.from(map.values()).sort((a,b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ updatedAt: new Date().toISOString(), items: merged })
    };
  } catch (err) {
    console.error("latest error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ updatedAt: null, items: [] })
    };
  }
}
