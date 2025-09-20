// netlify/functions/adapters/frameworks-yorhub.mjs
// Scrapes YORhub frameworks index + detail snippets.
const HEADERS = { headers: { 'User-Agent': 'Gleeds Growth Portal (Netlify Function)' } };
function clean(t = '') {
  return t.replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
}
function toISO(d){ if(!d) return null; const m = d.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/); if(!m) return null;
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const mi = months[m[2].slice(0,3).toLowerCase()]; if (mi==null) return null;
  return new Date(Date.UTC(+m[3], mi, +m[1])).toISOString();
}
function inferSector(name=''){ const t=name.toLowerCase();
  if (/(highway|road|bridge|civil)/.test(t)) return 'Highways';
  if (/(rail|station|platform)/.test(t)) return 'Rail';
  if (/(airport|aviation|runway|taxiway)/.test(t)) return 'Aviation';
  if (/(port|harbour|maritime|dock|quay)/.test(t)) return 'Maritime';
  if (/(water|utilities|power|gas|sewer|wastewater)/.test(t)) return 'Utilities';
  return 'Infrastructure';
}
export default async function fetchYORhubFrameworks() {
  // Index of frameworks
  let html;
  try {
    const res = await fetch('https://www.yorhub.com/frameworks/', HEADERS);
    html = await res.text();
  } catch { return []; }

  // Framework cards typically link to detail pages; extract titles and hrefs.
  const items = [];
  const cardRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRegex.exec(html))) {
    const href = m[1];
    const chunk = m[2];
    const nameMatch = chunk.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const name = clean(nameMatch ? nameMatch[1] : '');
    if (!name || !/framework/i.test(name)) continue; // keep obvious frameworks
    const url = href.startsWith('http') ? href : `https://www.yorhub.com${href}`;
    items.push({
      id: url,
      name,
      client: 'YORhub',
      sector: inferSector(name),
      region: 'Yorkshire & Humber',
      value: null,
      expected_award_date: null,
      status: 'Live',
      url,
      source_url: url
    });
  }

  // Optionally, follow each detail page to look for dates (do it lightly)
  const out = [];
  for (const it of items.slice(0, 40)) { // throttle: follow first 40 to be polite
    try {
      const r = await fetch(it.url, HEADERS);
      const body = await r.text();
      const text = clean(body);
      // Look for validity or end date patterns
      const end = text.match(/End\s*Date:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i)?.[1];
      const start = text.match(/Start\s*Date:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i)?.[1];
      const exp = text.match(/expected\s+award\s+date[:\s]*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i)?.[1];

      out.push({
        ...it,
        start_date: toISO(start || null),
        end_date: toISO(end || null),
        expected_award_date: toISO(exp || null)
      });
    } catch {
      out.push(it);
    }
  }
  return out;
}
