// Writes merged tenders into Netlify Blobs at: store "tenders", key "latest.json"
// Reads creds from env (BLOBS_SITE_ID, BLOBS_TOKEN). If missing, uses placeholders below.
import { getStore as _getStore } from '@netlify/blobs';

function getStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || 'PASTE_YOUR_SITE_ID';
  const token  = process.env.BLOBS_TOKEN   || 'PASTE_YOUR_BLOBS_TOKEN';
  return _getStore({ name, siteID, token });
}

// --- helpers ---
const SECTORS_ALLOWED = ['Rail', 'Aviation', 'Maritime', 'Utilities', 'Highways'];

const dedupe = (arr) => {
  const seen = new Set();
  return arr.filter((it) => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const onlyFutureDeadlines = (items) => {
  const now = Date.now();
  return items.filter(i => i.deadline && !isNaN(Date.parse(i.deadline)) && Date.parse(i.deadline) >= now);
};

// --- Contracts Finder (OCDS) pagination ---
async function fetchCF_OCDS(maxPages = 25, pageSize = 100, softTimeMs = 28000) {
  const start = Date.now();
  let page = 1;
  const out = [];

  while (page <= maxPages && (Date.now() - start) < softTimeMs) {
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&page=${page}&limit=${pageSize}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
    if (!res.ok) break;

    const pkg = await res.json(); // OCDS release package
    const releases = Array.isArray(pkg.releases) ? pkg.releases : [];
    if (releases.length === 0) break;

    for (const r of releases) {
      const title = r.tender?.title || r.title || '';
      const buyer = r.parties?.find(p => p.roles?.includes('buyer'))?.name || '';
      const region = r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '';
      const deadline = r.tender?.tenderPeriod?.endDate || '';
      const ocid = r.ocid || r.id || '';
      const urlNotice = ocid
        ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}`
        : '';

      // Try to infer sector tags from text (very loose!)
      const text = `${title} ${buyer}`.toLowerCase();
      const sector =
        text.includes('rail') ? 'Rail' :
        text.includes('airport') || text.includes('aviation') ? 'Aviation' :
        text.includes('port') || text.includes('harbour') || text.includes('maritime') ? 'Maritime' :
        text.includes('water') || text.includes('wastewater') || text.includes('utilities') ? 'Utilities' :
        text.includes('highway') || text.includes('road') ? 'Highways' : 'Other';

      out.push({
        source: 'CF',
        title,
        organisation: buyer,
        region,
        deadline,
        url: urlNotice,
        sector
      });
    }

    page += 1;
  }
  return out;
}

// --- Find a Tender (FTS) best-effort (wrapped so failures don’t kill the run) ---
async function fetchFTS_bestEffort() {
  try {
    // The FTS API has changed a few times; use a resilient query and tolerate 0 results.
    // If this 400’s, we just return [] and rely on CF for now.
    const url = 'https://www.find-tender.service.gov.uk/api/1.0/search/releases?stages=planning,tender';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
    if (!res.ok) return [];

    const data = await res.json();
    const releases = Array.isArray(data.releases) ? data.releases : [];
    return releases.map(r => {
      const title = r.tender?.title || r.title || '';
      const buyer = r.parties?.find(p => p.roles?.includes('buyer'))?.name || '';
      const region = r.tender?.deliveryLocations?.[0]?.nuts || r.tender?.deliveryAddresses?.[0]?.region || '';
      const deadline = r.tender?.tenderPeriod?.endDate || '';
      const noticeId = r.ocid || r.id || '';
      const url = noticeId ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}` : '';

      const text = `${title} ${buyer}`.toLowerCase();
      const sector =
        text.includes('rail') ? 'Rail' :
        text.includes('airport') || text.includes('aviation') ? 'Aviation' :
        text.includes('port') || text.includes('harbour') || text.includes('maritime') ? 'Maritime' :
        text.includes('water') || text.includes('wastewater') || text.includes('utilities') ? 'Utilities' :
        text.includes('highway') || text.includes('road') ? 'Highways' : 'Other';

      return { source: 'FTS', title, organisation: buyer, region, deadline, url, sector };
    });
  } catch {
    return [];
  }
}

export async function handler() {
  try {
    const [cfRaw, ftsRaw] = await Promise.all([
      fetchCF_OCDS(),
      fetchFTS_bestEffort()
    ]);

    // Filter: keep only our 5 sectors + future deadlines
    const filtered = onlyFutureDeadlines(
      (cfRaw.concat(ftsRaw)).filter(i => SECTORS_ALLOWED.includes(i.sector))
    );

    // Dedupe + sort by deadline
    const items = dedupe(filtered).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const store = getStore('tenders');
    await store.setJSON('latest.json', {
      updatedAt: new Date().toISOString(),
      items
    });

    return json({ ok: true, counts: { cf: cfRaw.length, fts: ftsRaw.length, final: items.length } });
  } catch (err) {
    console.error('update-tenders error', err);
    return json({ ok: false, error: err.message }, 500);
  }
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}
