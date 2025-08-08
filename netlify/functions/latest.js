// /.netlify/functions/latest  — CF (OCDS) + FTS (stages/cursor) with proper mapping

const UA = {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)'
  }
};

module.exports.handler = async function () {
  try {
    const cfItems = await fetchAllCF_OCDS();
    const ftsItems = await fetchAllFTS_OCDS();

    console.log('✅ CF total:', cfItems.length, 'FTS total:', ftsItems.length);

    let items = dedupe([...cfItems, ...ftsItems]);

    // Sort by soonest deadline
    items.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        total: items.length,
        items
      })
    };
  } catch (e) {
    console.error('latest.js fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

/* ---------------- CF via OCDS ----------------
   The HTML search endpoint 404s; the OCDS endpoint works.
   It can return:
   - { releases: [ release, ... ] }
   - { records: [ { compiledRelease: {...} } ] }
   - { packages: [ { releases:[...]} ] }
------------------------------------------------ */
async function fetchAllCF_OCDS() {
  const all = [];
  let page = 1;

  while (page <= 50) { // safety cap
    const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=100&page=${page}`;
    console.log('CF OCDS GET page', page);
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    let raw = [];
    if (Array.isArray(data.releases)) {
      raw = data.releases;
    } else if (Array.isArray(data.records)) {
      raw = data.records.flatMap(r => r.compiledRelease ? [r.compiledRelease] : []);
    } else if (Array.isArray(data.packages)) {
      raw = data.packages.flatMap(p => Array.isArray(p.releases) ? p.releases : []);
    }

    if (!raw.length) break;

    const mapped = raw.map(normalizeOCDSRelease).filter(Boolean);
    all.push(...mapped);
    page++;
  }

  return all;
}

/* ---------------- FTS via OCDS ----------------
   FTS now wants: stages, limit, cursor (no status/size/page/order).
   We’ll fetch stage=tender, limit=100, follow nextCursor.
------------------------------------------------ */
async function fetchAllFTS_OCDS() {
  const all = [];
  const base = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
  let cursor = '';
  let loops = 0;

  while (loops < 50) { // safety cap
    const params = new URLSearchParams({
      stages: 'tender',
      limit: '100'
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${base}?${params.toString()}`;
    console.log('FTS OCDS GET', cursor ? '(cursor)' : '(first)', cursor || '');
    const res = await fetch(url, UA);
    if (!res.ok) break;

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { break; }

    let raw = [];
    // common FTS shapes
    if (Array.isArray(data.releases)) {
      raw = data.releases;
    } else if (Array.isArray(data.packages)) {
      raw = data.packages.flatMap(p => Array.isArray(p.releases) ? p.releases : []);
    } else if (Array.isArray(data.records)) {
      raw = data.records.flatMap(r => r.compiledRelease ? [r.compiledRelease] : []);
    }

    if (!raw.length) break;

    const mapped = raw.map(normalizeOCDSRelease).filter(Boolean);
    all.push(...mapped);

    // pagination
    cursor = data.nextCursor || data.cursor || '';
    if (!cursor) break;

    loops++;
  }

  return all;
}

/* ---------------- Normalize one OCDS release to our item shape ---------------- */
function normalizeOCDSRelease(r0) {
  // Some APIs return a wrapper with releases:[...] — we already flattened but keep a last safety:
  const r = Array.isArray(r0?.releases) ? r0.releases[0] : (r0 || {});
  const tender = r.tender || {};
  const parties = r.parties || [];
  const buyerName = (r.buyer && r.buyer.name)
    || parties.find(p => Array.isArray(p.roles) && p.roles.includes('buyer'))?.name
    || '';

  const title = tender.title || r.title || '';
  const deadline = tender.tenderPeriod?.endDate || tender.enquiryPeriod?.endDate || r.tenderPeriod?.endDate || '';
  const region =
    tender.deliveryAddresses?.[0]?.region
    || tender.deliveryLocations?.[0]?.nuts
    || tender.items?.[0]?.deliveryLocation?.region
    || '';

  // Make a usable link if possible
  const noticeId = r.id || r.ocid || '';
  let url = '';
  if (noticeId) {
    // Prefer FTS path when ocid/id looks like FTS; otherwise CF will often resolve by ocid as well.
    url = `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`;
  }
  // Fallback URL in case CF
  if (!url && r.planning?.documents?.[0]?.url) url = r.planning.documents[0].url;

  return {
    source: r.publisher?.name?.includes('Find a Tender') ? 'FTS' : 'CF',
    title,
    organisation: buyerName,
    region,
    deadline,
    url
  };
}

/* ---------------- Utils ---------------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(it => {
    const key = `${(it.title||'').trim()}|${(it.organisation||'').trim()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
