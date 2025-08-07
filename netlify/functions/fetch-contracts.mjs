import { getStore } from "@netlify/blobs";

export async function handler() {
  try {
    const keywords = [
      "rail", "railway", "station",
      "airport", "aviation", "runway", "terminal",
      "port", "maritime", "dock", "harbour", "harbor",
      "utilities", "water", "wastewater", "gas", "telecom",
      "highway", "road", "roads", "bridge"
    ];

    const body = {
      size: 100,
      searchTerm: keywords.join(" OR "),
      filters: { regions: ["England"], status: ["Open"] },
      sort: { field: "deadline", direction: "asc" }
    };

    const res = await fetch(
      "https://www.contractsfinder.service.gov.uk/Published/Notices/Search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Contracts Finder ${res.status} ${res.statusText} — ${text.slice(0,180)}`);
    }

    const data = await res.json().catch(() => ({}));
    const notices = Array.isArray(data?.notices) ? data.notices : [];

    const items = notices.map(n => ({
      title: n.title || "",
      organisation: n.organisationName || "",
      region: n.region || "England",
      deadline: n.deadline || n.deadlineDate || null,
      valueLow: n.valueLow ?? null,
      valueHigh: n.valueHigh ?? null,
      url: n.noticeIdentifier
        ? `https://www.contractsfinder.service.gov.uk/Notice/${n.noticeIdentifier}`
        : ""
    }));

    const payload = { updatedAt: new Date().toISOString(), items };

    const store = getStore();                // default site store
    await store.set("latest.json", JSON.stringify(payload));

    return { statusCode: 200, body: `Saved ${items.length} notices at ${payload.updatedAt}` };
  } catch (err) {
    console.error("fetch-contracts error:", err);
    return { statusCode: 500, body: `Error - ${err.message}` };
  }
}
