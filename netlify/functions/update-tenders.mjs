// netlify/functions/update-tenders.mjs
import { getStore } from '@netlify/blobs';

// Adapters (ensure these files exist)
import contractsFinder from './adapters/contracts-finder.mjs';
import findATender     from './adapters/find-a-tender.mjs';

// Relevance rules (same spirit as your original)
const SECTOR_KEYWORDS = [
  'infrastructure','rail','aviation','airport','runway','utilities','water','wastewater','sewer',
  'electric','electricity','energy','power','gas','highways','road','roads','transport','maritime',
  'port','harbour','harbor','dock'
];

const SERVICE_KEYWORDS = [
  'project management','pm support','programme management','contract administration','nec supervisor',
  'nec project manager','quantity surveying','qs','cost management','commercial management',
  'project controls','risk management','estimating','benchmarking','assurance','strategic advice',
  'business case','feasibility','procurement','tender support',"employer's agent"
];

const CLIENT_KEYWORDS = [
  'national highways','highways england','network rail','hs2','department for transport','dft',
  'transport for london','tfl','transport for greater manchester','tfgm','scottish water','scottish forestry',
  'thames water','united utilities','anglian water','yorkshire water','severn trent','welsh water',
  'defence infrastructure organisation','dio','mod','nuclear decommissioning authority','nda',
  'heathrow','gatwick','manchester airport','mag','london luton airport','lla','bristol airport',
  'southampton city council','glasgow city council','edinburgh city council'
];

function looksRelevant(it) {
  const blob = `${it.title || ''} ${it.organisation || ''}`.toLowerCase();
  const sectorHit  = SECTOR_KEYWORDS.some(k => blob.includes(k));
  const serviceHit = SERVICE_KEYWORDS.some(k => blob.includes(k));
  const clientHit  = CLIENT_KEYWORDS.some(k => blob.includes(k));
  return sectorHit || serviceHit || clientHit;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${(it.title||'').trim().toLowerCase()}|${(it.organisation||'').trim().toLowerCase()}|${(it.deadline||'').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler() {
  try {
    // Automatic site binding to the "tenders" store
    const store = getStore({ name: 'tenders' });

    // Fetch from both sources via adapters
    const [cfItems, ftsItems] = await Promise.all([
      contractsFinder(),
      findATender(),
    ]);

    // Merge + dedupe
    const merged = dedupe([...cfItems, ...ftsItems]);

    // Relevance + future deadlines only
    const now = Date.now();
    const relevant = merged.filter(it => {
      const dOk = it.deadline && Date.parse(it.deadline) > now;
      return dOk && looksRelevant(it);
    });

    // Sort earliest deadline first
    relevant.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const payload = {
      updatedAt: new Date().toISOString(),
      count: relevant.length,
      items: relevant,
      sources: { cf: cfItems.length, fts: ftsItems.length },
    };

    // Write JSON (version-agnostic)
    await store.set('latest.json', JSON.stringify(payload), {
      contentType: 'application/json',
    });

    return json(200, { ok: true, ...payload });
  } catch (err) {
    console.error('update-tenders error:', err);
    return json(500, { ok: false, error: err.message ?? String(err) });
  }
}
