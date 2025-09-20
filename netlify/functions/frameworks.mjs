// netlify/functions/frameworks.mjs
// Reads frameworks from Netlify Blobs (fast). Falls back to data/frameworks.json.
// Filters: ?q=   ?sector=All|Highways|Rail|Aviation|Maritime|Utilities|Infrastructure   ?liveOnly=1
import { getStore } from '@netlify/blobs';
import fs from 'node:fs';
import path from 'node:path';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(+d)) return null;
  const now = Date.now();
  return Math.ceil((+d - now) / (1000*60*60*24));
}
function withCountdown(items) {
  return items.map(r => {
    const cd = daysUntil(r.expected_award_date);
    return { ...r, countdown_days: cd, stale: cd !== null && cd < 0 };
  });
}
function canonicalSector(s) {
  if (!s) return s;
  if (s === 'Maritime & Ports') return 'Maritime';
  return s;
}

export async function handler(event) {
  try {
    const qRaw = event.queryStringParameters?.q || '';
    const q = qRaw.toLowerCase();
    const sector = canonicalSector(event.queryStringParameters?.sector || 'All');
    const liveOnly = event.queryStringParameters?.liveOnly === '1';

    let payload = null;

    // Try blobs
    if (SITE_ID && TOKEN) {
      const store = getStore({ name: 'frameworks', siteID: SITE_ID, token: TOKEN });
      const raw = await store.get('latest.json');
      if (raw) payload = JSON.parse(raw);
    }

    // Fallback to repo file on first run
    if (!payload) {
      const file = path.join(process.cwd(), 'data', 'frameworks.json');
      const rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
      payload = { updatedAt: null, count: rows.length, items: rows };
    }

    let rows = payload.items || [];

    if (sector && sector !== 'All') rows = rows.filter(r => r.sector === sector);
    if (q) rows = rows.filter(r => `${r.name} ${r.client}`.toLowerCase().includes(q));
    if (liveOnly) rows = rows.filter(r => r.status === 'Live' || r.status === 'Open');

    rows = withCountdown(rows);

    return json(200, { updatedAt: payload.updatedAt, count: rows.length, items: rows });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}
