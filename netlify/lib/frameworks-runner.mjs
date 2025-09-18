// netlify/lib/frameworks-runner.mjs
// Merges framework records (from your repo JSON today; adapters later)
// → normalises → dedupes → writes to Netlify Blobs at frameworks/latest.json

import { getStore } from '@netlify/blobs';
import fs from 'node:fs';
import path from 'node:path';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ── Tunables (adjust later if you want server-side filtering)
const DROP_EXPIRED_BEFORE_DAYS = 365;  // drop frameworks that expired > 1yr ago

// --- Helpers
function toISO(d) {
  if (!d) return null;
  const s = String(d);
  return s.length === 10 ? `${s}T00:00:00Z` : s;
}

function normalise(rec) {
  // Keep your current frontend expectations: id, name, client, sector, region(string), value(object), expected_award_date, url
  const valueObj =
    rec.value && typeof rec.value === 'object'
      ? rec.value
      : (typeof rec.value === 'number'
          ? { amount: rec.value }
          : (rec.valueHigh || rec.valueLow)
            ? undefined
            : null);

  return {
    id: rec.id || rec.ref || `${(rec.name||'').trim()}|${(rec.client||'').trim()}`,
    name: rec.name || rec.title || '',
    client: rec.client || rec.authority || '',
    sector: rec.sector || 'Infrastructure',
    region: Array.isArray(rec.regions) ? rec.regions.join(' · ') : (rec.region || ''),
    // keep old value shape for your UI; also include numeric bounds for future use
    value: valueObj || (rec.valueHigh || rec.valueLow ? null : null),
    valueLow: typeof rec.valueLow === 'number' ? rec.valueLow : null,
    valueHigh: typeof rec.valueHigh === 'number' ? rec.valueHigh : null,
    expected_award_date: toISO(rec.expected_award_date || rec.awardDate),
    start_date: toISO(rec.start_date || rec.startDate),
    end_date: toISO(rec.end_date || rec.endDate),
    status: rec.status || inferStatus(rec),
    url: rec.url || rec.link || rec.source_url || '',
    source_url: rec.source_url || rec.url || '',
    // optional extras your drawer supports
    position: rec.position || null,
    key_dates: rec.key_dates || [],
    incumbents: rec.incumbents || [],
    competition_watch: rec.competition_watch || [],
    competition_notes: rec.competition_notes || '',
    recruitment: rec.recruitment || [],
    bid_insights: rec.bid_insights || [],
  };
}

function inferStatus(r) {
  const now = Date.now();
  const start = r.start_date ? +new Date(r.start_date) : null;
  const end   = r.end_date ? +new Date(r.end_date) : null;
  const exp   = r.expected_award_date ? +new Date(r.expected_award_date) : null;
  if (end && end < now) return 'Expired';
  if (start && start <= now && (!end || end >= now)) return 'Live';
  if (exp && exp > now) return 'Upcoming';
  return 'Open';
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(x => {
    const key = (x.id || `${x.name}|${x.client}|${x.expected_award_date||''}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dropVeryOldExpired(items) {
  const cutoff = Date.now() - DROP_EXPIRED_BEFORE_DAYS * 24 * 60 * 60 * 1000;
  return items.filter(x => {
    if (x.status !== 'Expired') return true;
    const end = x.end_date ? +new Date(x.end_date) : null;
    if (!end) return true;
    return end >= cutoff;
  });
}

async function loadFromRepoFile() {
  const p = path.join(process.cwd(), 'data', 'frameworks.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const rows = JSON.parse(raw);
  return rows.map(normalise);
}

export async function runFrameworksUpdate() {
  if (!SITE_ID || !TOKEN) {
    throw new Error('Blobs not configured. Set BLOBS_SITE_ID and BLOBS_TOKEN.');
  }

  // TODO: when you add adapters, import and merge them here (like tenders)
  // const [ccs, espo, nepo] = await Promise.all([ fetchCCS(), fetchESPO(), fetchNEPO() ]);

  const fromFile = await loadFromRepoFile();
  let items = dedupe(fromFile);
  items = dropVeryOldExpired(items);

  const store = getStore({ name: 'frameworks', siteID: SITE_ID, token: TOKEN });
  const payload = { updatedAt: new Date().toISOString(), count: items.length, items };
  await store.set('latest.json', JSON.stringify(payload));

  return { count: items.length };
}
