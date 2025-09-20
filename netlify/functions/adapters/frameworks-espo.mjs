// netlify/functions/adapters/frameworks-espo.mjs
// Scrapes ESPO frameworks listing pages (public).
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
export default async function fetchESPOFrameworks() {
  let html;
  try {
    const res = await fetch('https://www.espo.org/frameworks', HEADERS);
    html = await res.text();
  } catch { return []; }

  const items = [];
  // ESPO’s page renders cards/rows with links to individual framework pages
  const linkRe = /<a[^>]+href="([^"]+\/frameworks\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html))) {
    const url = m[1].startsWith('http') ? m[1] : `https://www.espo.org${m[1]}`;
    const chunk = m[2];
    const name = clean(chunk).replace(/\s+Learn more.*$/i,'').trim();
    if (!name) continue;

    items.push({
      id: url,
      name,
      client: 'ESPO',
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
