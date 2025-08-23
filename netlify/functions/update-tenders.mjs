// netlify/functions/update-tenders.mjs

import { getStore } from '@netlify/blobs';

// ADAPTERS (make sure these files exist at these paths)
import contractsFinder from './adapters/contracts-finder.mjs';
import findATender     from './adapters/find-a-tender.mjs';

// ---- ENV for Blobs (your original style)
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ---- Relevance rules (copied from your original)
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

// ---- Helpers (from your previous function)
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
    // init store
    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });
    if (!store) {
      return json(500, { ok: false, error: 'Blobs store not initialised (check BLOBS_SITE_ID/BLOBS_TOKEN).' });
    }

    // fetch from both sources via adapters
    const [cfItems, ftsItems] = await Promise.all([
      contractsFinder(),
      findATender(),
    ]);

    // merge + dedupe
    const merged = dedupe([...cfItems, ...ftsItems]);

    // relevance + upcoming only
    const nowMs = Date.now();
    const relevant = merged.filter(it => {
      const hasFutureDeadline = it.deadline && Date.parse(it.deadline) > nowMs;
      return hasFutureDeadline && looksRelevant(it);
    });

    // sort by earliest deadline
    relevant.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    // write to blobs (use generic set for widest compatibility)
    const payload = {
      updatedAt: new Date().toISOString(),
      count: relevant.length,
      items: relevant,
      sources: { cf: cfItems.length, fts: ftsItems.length }
    };

    await store.set(
      'latest.json',
      JSON.stringify(payload),
      { contentType: 'application/json' }
    );

    return json(200, { ok: true, ...payload });
  } catch (err) {
    console.error('update-tenders error:', err);
    return json(500, { ok: false, error: err.message ?? String(err) });
  }
}
