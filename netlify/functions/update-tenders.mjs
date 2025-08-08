import { getStore } from "@netlify/blobs";

const UA = { headers: { "user-agent": "Gleeds-Infra-Dashboard/1.0" } };

export async function handler() {
  try {
    const { BLOBS_SITE_ID, BLOBS_TOKEN } = process.env;
    if (!BLOBS_SITE_ID || !BLOBS_TOKEN) {
      return json(500, { ok: false, error: "Missing BLOBS_SITE_ID or BLOBS_TOKEN" });
    }

    const store = getStore({ name: "tenders", siteID: BLOBS_SITE_ID, token: BLOBS_TOKEN });

    const [cfItems, ftsItems] = await Promise.all([fetchCF_OCDS(), fetchFTS()]);
    let items = dedupe([...cfItems, ...ftsItems]);

    const payload = { updatedAt: new Date().toISOString(), items };
    await store.setJSON("latest.json", payload);

    return json(200, { ok: true, counts: { cf: cfItems.length, fts: ftsItems.length, final: items.length } });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
}

/* ---------------- CF (OCDS) with pagination ---------------- */
async function fetchCF_OCDS() {
  const pageSize = 100, maxPages = 20;
  let page = 1, out = [];
  while (page <= maxPages) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=${pageSize}&page=${page}`;
    const { data, status } = await getJSON(url);
    if (status !== 200) break;
    const releases = Array.isArray(data.releases) ? data.releases : [];
    out.push(...releases.map(normaliseCF));
    if (releases.length < pageSize) break;
    page++;
  }
  return out;
}
function normaliseCF(r = {}) {
  const t = r.tender || {};
  const buyer = (r.parties || []).find(p => p.roles?.includes("buyer"));
  return {
    source: "CF",
    title: t.title || r.title || "",
    organisation: buyer?.name || "",
    region: firstStr(t.deliveryLocations?.[0]?.nuts) || "",
    deadline: t.tenderPeriod?.endDate || "",
    url: r.id ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(r.id)}` : ""
  };
}

/* ---------------- FTS (OCDS) with cursor pagination ---------------- */
async function fetchFTS() {
  const limit = 100, maxBatches = 20;
  let cursorParam = "", out = [];
  for (let i = 0; i < maxBatches; i++) {
    const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=${limit}${cursorParam}`;
    const { data, status, text } = await getJSON(url);
    if (status !== 200) break;
    let releases = [];
    if (Array.isArray(data.releases)) releases = data.releases;
    else if (Array.isArray(data.packages)) releases = data.packages.flatMap(p => p.releases || []);
    out.push(...releases.map(normaliseFTS));
    const cursor = parseNextCursor(text) || parseNextCursorFromData(data);
    if (!cursor) break;
    cursorParam = `&cursor=${encodeURIComponent(cursor)}`;
  }
  return out;
}
function normaliseFTS(r = {}) {
  const t = r.tender || {};
  const buyer = (r.parties || []).find(p => p.roles?.includes("buyer"));
  return {
    source: "FTS",
    title: t.title || r.title || "",
    organisation: buyer?.name || "",
    region: firstStr(t.deliveryLocations?.[0]?.nuts) || "",
    deadline: t.tenderPeriod?.endDate || "",
    url: r.ocid ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.ocid)}` : ""
  };
}

/* ---------------- utils ---------------- */
async function getJSON(url) {
  const res = await fetch(url, UA);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Non-JSON from ${url} (status ${res.status}) first 400: ${text.slice(0,400)}`);
  }
  return { status: res.status, data, text };
}
function parseNextCursor(bodyText = "") {
  const m = bodyText.match(/cursor=([A-Za-z0-9+/=%-]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function parseNextCursorFromData(d = {}) {
  const link = d.links?.next || d.link?.next;
  const m = link ? String(link).match(/cursor=([A-Za-z0-9+/=%-]+)/) : null;
  return m ? decodeURIComponent(m[1]) : "";
}
function firstStr(x) { return typeof x === "string" ? x : (Array.isArray(x) ? x[0] : ""); }
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(x => {
    const key = `${(x.title||"").trim()}|${(x.organisation||"").trim()}|${(x.deadline||"").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function json(status, obj) {
  return { statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
