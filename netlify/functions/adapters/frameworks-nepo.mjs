// netlify/functions/adapters/frameworks-nepo.mjs
// Scrapes NEPO solutions/frameworks index (public).
const HEADERS = { headers: { 'User-Agent': 'Gleeds Growth Portal (Netlify Function)' } };
function clean(t=''){ return t.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function inferSector(n=''){ const t=n.toLowerCase();
  if (/(highway|road|civil|bridge)/.test(t)) return 'Highways';
  if (/(rail|railway|station)/.test(t)) return 'Rail';
  if (/(airport|aviation|runway)/.test(t)) return 'Aviation';
  if (/(port|harbour|maritime|dock)/.test(t)) return 'Maritime';
  if (/(water|utilities|energy|power|gas|sewer|wastewater)/.test(t)) return 'Utilities';
  return 'Infrastructure';
}
export default async function fetchNEPOFrameworks() {
  let html;
  try {
    const res = await fetch('https://www.nepo.org/solutions', HEADERS);
    html = await res.text();
  } catch { return []; }

  const items = [];
  const linkRe = /<a[^>]+href="([^"]+\/solutions\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html))) {
    const href = m[1];
    const url = href.startsWith('http') ? href : `https://www.nepo.org${href}`;
    const text = clean(m[2]);
    const name = (text.match(/^(.*?)(?:\s+-\s+NEPO|\s+\|)/)?.[1] || text).trim();
    if (!name) continue;
    // Heuristic: keep “Construction/Engineering/Consultancy/Professional Services”
    if (!/(construction|engineering|consult|professional|survey|framework|highway|civil|infrastructure)/i.test(name)) continue;

    items.push({
      id: url,
      name,
      client: 'NEPO',
      sector: inferSector(name),
      region: 'UK',
      value: null,
      expected_award_date: null,
      status: 'Live',
      url,
      source_url: url
    });
  }
  return items;
}
