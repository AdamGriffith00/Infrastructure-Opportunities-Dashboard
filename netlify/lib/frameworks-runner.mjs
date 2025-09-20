// netlify/lib/frameworks-runner.mjs
import { getStore } from '@netlify/blobs';
import fs from 'node:fs';
import path from 'node:path';

// Adapters (add/remove as you like)
import fetchCCSFrameworks  from '../functions/adapters/frameworks-ccs.mjs';
import fetchYORhubFrameworks from '../functions/adapters/frameworks-yorhub.mjs';
import fetchESPOFrameworks from '../functions/adapters/frameworks-espo.mjs';
import fetchNEPOFrameworks from '../functions/adapters/frameworks-nepo.mjs';

// ---- ENV
const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

// ---- Tunables
const DROP_EXPIRED_BEFORE_DAYS = 365;

// ---- Relevance rules (same as opportunities)
const ALLOWED_SECTORS = new Set(['Highways','Rail','Aviation','Maritime','Utilities','Infrastructure']);
const BLOCKLIST_WORDS = [
  /catering/i, /cleaning/i, /janitorial/i, /grounds?\s*maintenance/i, /landscap(ing|e)/i,
  /security\s+(services?|guard)/i, /parking\s+enforcement/i, /waste\s+collection/i,
  /laundry/i, /uniform/i, /workwear/i, /printing?|photocop(ier|y)/i, /stationer(y|ies)/i,
  /food\s+suppl(y|ies)/i, /school\s+meals?/i, /bus( |-)services?/i, /courier/i, /postal/i,
  /social\s+care/i, /care\s+home/i, /teaching\s+services?/i, /agency\s+staff/i, /recruit(ment|ing)/i,
  /sport(ing)?\s+facilit(y|ies)/i, /leisure\s+centre/i, /cleaner/i, /window\s+clean/i
];
const SECTOR_KEYWORDS = [
  'highway','highways','road','roads','trunk road','bridge','structures','maintenance',
  'pavement','resurfacing','carriageway','footway','roundabout','junction','signals',
  'traffic management','traffic signal','intelligent transport','its',
  'rail','railway','track','signalling','signal','overhead line','ole','platform','station upgrade',
  'depot','level crossing','network rail','hs2',
  'airport','aviation','runway','taxiway','apron','airfield lighting','a-gl','papi','ils',
  'heathrow','gatwick','manchester airport','mag','luton','london city','bristol airport',
  'utility','utilities','water','wastewater','sewer','treatment works','wtw','stw','pipelines',
  'trunk main','potable','flood defence','reservoir','dam','electric','electricity','substation',
  'overhead line','underground cable','renewable','solar','wind','gas','district heating',
  'maritime','port','harbour','harbor','dock','quay','berth','breakwater','lock gate'
];
const SERVICE_KEYWORDS = [
  'project management','programme management','program management','pm support',
  'contract administration','nec supervisor','nec project manager','nec pm',
  'quantity surveying','qs','cost management','commercial management',"employer's agent",
  'project controls','schedule','scheduling','planning','primavera','p6','risk management',
  'estimating','benchmarking','assurance','strategic advice','business case','feasibility',
  'procurement','tender support','cost estimate','cost plan','value management','value engineering',
  'cdm advisor','cdm adviser','client side project management'
];
const CLIENT_KEYWORDS = [
  'national highways','highways england','transport for london','tfl',
  'transport for greater manchester','tfgm','west midlands combined authority','wmca',
  'department for transport','dft','local highways authority','county council',
  'network rail','hs2','great british railways','gbr',
  'scottish water','thames water','united utilities','anglian water','yorkshire water',
  'severn trent','welsh water','northern ireland water','southern water',
  'national grid','uk power networks','ssent','ssen','sse','scottish power','northern powergrid',
  'heathrow','gatwick','manchester airport','mag','london luton airport','lla','london city airport',
  'defence infrastructure organisation','dio','mod',
  'nuclear decommissioning authority','nda','sellafield','hinkley','sizewell'
];

// ---- Helpers
function quickKeywordHit(blob) {
  return (
    SECTOR_KEYWORDS.some(k => blob.includes(k)) ||
    SERVICE_KEYWORDS.some(k => blob.includes(k)) ||
    CLIENT_KEYWORDS.some(k => blob.includes(k))
  );
}
function inferSector(title, client) {
  const txt = `${title || ''} ${client || ''}`.toLowerCase();
  if (/(rail|network rail|hs2|station|platform)/.test(txt)) return 'Rail';
  if (/(airport|aviation|runway|taxiway|heathrow|gatwick|mag|luton|london city|bristol)/.test(txt)) return 'Aviation';
  if (/(road|highway|national highways|carriageway|footway|junction|bridge|resurfac)/.test(txt)) return 'Highways';
  if (/(water|sewer|wastewater|treatment works|utilities|electric|substation|power|gas|district heating|reservoir|dam)/.test(txt)) return 'Utilities';
  if (/(port|harbour|harbor|maritime|dock|quay|berth|breakwater|lock gate)/.test(txt)) return 'Maritime';
  return 'Infrastructure';
}
function toISO(d) {
  if (!d) return null;
  const s = String(d);
  return s.length === 10 ? `${s}T00:00:00Z` : s;
}
function normalise(rec) {
  const name   = rec.name || rec.title || '';
  const client = rec.client || rec.authority || '';
  const sector = rec.sector || inferSector(name, client);
  return {
    id: rec.id || rec.ref || `${name.trim()}|${client.trim()}`,
    name,
    client,
    sector,
    region: Array.isArray(rec.regions) ? rec.regions.join(' · ') : (rec.region || 'UK'),
    value: rec.value && typeof rec.value === 'object' ? rec.value : null,
    valueLow: typeof rec.valueLow === 'number' ? rec.valueLow : null,
    valueHigh: typeof rec.valueHigh === 'number' ? rec.valueHigh : null,
    expected_award_date: toISO(rec.expected_award_date || rec.awardDate),
    start_date: toISO(rec.start_date || rec.startDate),
    end_date: toISO(rec.end_date || rec.endDate),
    status: rec.status || inferStatus(rec),
    url: rec.url || rec.link || rec.source_url || '',
    source_url: rec.source_url || rec.url || ''
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
    const key = (x.id || `${x.name}|${x.client}|${x.expected_award_date || ''}`).toLowerCase();
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
function passesBusinessRules(fr) {
  if (!ALLOWED_SECTORS.has(fr.sector)) return false;
  const hay = `${fr.name || ''} ${fr.client || ''}`.toLowerCase();
  if (BLOCKLIST_WORDS.some(rx => rx.test(hay))) return false;
  if (!quickKeywordHit(hay)) return false;
  return true;
}
async function loadFromRepoFile() {
  const p = path.join(process.cwd(), 'data', 'frameworks.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

// ---- Runner
export async function runFrameworksUpdate() {
  if (!SITE_ID || !TOKEN) {
    throw new Error('Blobs not configured. Set BLOBS_SITE_ID and BLOBS_TOKEN.');
  }

  const [fromFileRaw, ccs, yorhub, espo, nepo] = await Promise.all([
    loadFromRepoFile().catch(() => []),
    fetchCCSFrameworks().catch(() => []),
    fetchYORhubFrameworks().catch(() => []),
    fetchESPOFrameworks().catch(() => []),
    fetchNEPOFrameworks().catch(() => []),
  ]);

  let items = dedupe([
    ...fromFileRaw.map(normalise),
    ...ccs.map(normalise),
    ...yorhub.map(normalise),
    ...espo.map(normalise),
    ...nepo.map(normalise),
  ]);

  items = items.filter(passesBusinessRules);
  items = dropVeryOldExpired(items);

  const store = getStore({ name: 'frameworks', siteID: SITE_ID, token: TOKEN });
  const payload = { updatedAt: new Date().toISOString(), count: items.length, items };
  await store.set('latest.json', JSON.stringify(payload));

  return {
    count: items.length,
    sources: { file: fromFileRaw.length, ccs: ccs.length, yorhub: yorhub.length, espo: espo.length, nepo: nepo.length }
  };
}
