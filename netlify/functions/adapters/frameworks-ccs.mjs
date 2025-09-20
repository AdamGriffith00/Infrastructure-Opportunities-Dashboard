// netlify/functions/adapters/frameworks-ccs.mjs
// Scrapes CCS current and upcoming agreements (public pages).
const HEADERS = { headers: { 'User-Agent': 'Gleeds Growth Portal (Netlify Function)' } };

function clean(t = '') {
  return t.replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
}
function toISO(s) {
  if (!s) return null;
  const m1 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); // dd/mm/yyyy
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}T00:00:00Z`;
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})/);   // yyyy-mm-dd
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T00:00:00Z`;
  return null;
}
function inferSector(title = '') {
  const t = title.toLowerCase();
  if (/(highways|road|civil|highway)/.test(t)) return 'Highways';
  if (/(rail|railway|network rail|hs2)/.test(t)) return 'Rail';
  if (/(airport|aviation|runway|taxiway)/.test(t)) return 'Aviation';
  if (/(port|harbour|maritime|dock|quay)/.test(t)) return 'Maritime';
  if (/(water|wastewater|sewer|utilities|power|electric|gas|substation)/.test(t)) return 'Utilities';
  return 'Infrastructure';
}
function parseAgreementsHTML(html, base = 'https://www.crowncommercial.gov.uk') {
  const items = [];
  // Split on agreement tiles/cards
  const blocks = html.split(/<h3[^>]*>/i).slice(1);
  for (const raw of blocks) {
    const titleMatch = raw.match(/>([^<]+)<\/h3>/i);
    const hrefMatch  = raw.match(/<a[^>]+href="([^"]+\/agreements\/[^"]+)"[^>]*>/i);
    const idMatch    = raw.match(/Agreement ID:\s*([A-Z]+\d+(?:\.\d+)?)/i);
    const startMatch = raw.match(/Start Date:\s*([0-9/ -]+)/i);
    const endMatch   = raw.match(/End Date:\s*([0-9/ -]+)/i);

    if (!titleMatch || !idMatch) continue;
    const name = clean(titleMatch[1]);
    const url  = hrefMatch ? (hrefMatch[1].startsWith('http') ? hrefMatch[1] : base + hrefMatch[1]) : '';

    items.push({
      id: idMatch[1],
      name,
      client: 'Crown Commercial Service',
      sector: inferSector(name),
      region: 'UK',
      value: null,
      start_date: toISO(startMatch?.[1] || null),
      end_date: toISO(endMatch?.[1] || null),
      expected_award_date: null,
      status: 'Live',
      url,
      source_url: url
    });
  }
  return items;
}
function parseUpcomingHTML(html) {
  const text = clean(html);
  const lines = text.split(/\n/);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/Agreement ID:\s*([A-Z]+\d+(?:\.\d+)?)/i);
    if (!idMatch) continue;
    // find a plausible title within the last few lines
    let name = '';
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const t = lines[j].trim();
      if (t && !/Agreement ID|Start Date|End Date|Regulation/i.test(t)) { name = t; break; }
    }
    items.push({
      id: idMatch[1],
      name,
      client: 'Crown Commercial Service',
      sector: inferSector(name),
      region: 'UK',
      value: null,
      expected_award_date: null,
      status: 'Upcoming',
      url: 'https://www.crowncommercial.gov.uk/agreements/upcoming',
      source_url: 'https://www.crowncommercial.gov.uk/agreements/upcoming'
    });
  }
  return items;
}
export default async function fetchCCSFrameworks() {
  const out = [];
  try {
    const res1 = await fetch('https://www.crowncommercial.gov.uk/agreements', HEADERS);
    const html1 = await res1.text();
    out.push(...parseAgreementsHTML(html1));
  } catch (e) { console.warn('CCS current parse failed:', e?.message || e); }
  try {
    const res2 = await fetch('https://www.crowncommercial.gov.uk/agreements/upcoming', HEADERS);
    const html2 = await res2.text();
    out.push(...parseUpcomingHTML(html2));
  } catch (e) { console.warn('CCS upcoming parse failed:', e?.message || e); }

  const seen = new Set();
  return out.filter(x => { const k = (x.id || x.url || x.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
