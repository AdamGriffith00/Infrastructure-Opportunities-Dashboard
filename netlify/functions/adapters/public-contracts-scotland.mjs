// netlify/functions/adapters/public-contracts-scotland.mjs
//
// Public Contracts Scotland adapter (CSV export).
// - Set PCS_CSV_URL in Netlify env to a CSV export link from a saved PCS search
//   filtered to "Open" opportunities (date/status filters as you prefer).
// - This adapter fetches the CSV, parses it, normalises to your standard item shape,
//   and applies light sector inference.
//
// Expected columns in CSV (PCS usually provides similar headers; we handle variants):
//   "Notice Title", "Organisation Name", "Deadline Date", "Published Date",
//   "Estimated Value (GBP)", "Contact Details" / "Buyer Address", "Main site or location of works",
//   "CPV Description" / "Category", "Notice URL", "Reference number"
//
// If your export uses slightly different headers, the flexible header mapping below
// will still find them where possible.

const PCS_CSV_URL = process.env.PCS_CSV_URL; // REQUIRED

export default async function fetchPCS({ limit = 500 } = {}) {
  if (!PCS_CSV_URL) {
    console.warn('[PCS] PCS_CSV_URL not set; skipping PCS adapter.');
    return [];
  }

  const res = await fetch(PCS_CSV_URL, {
    headers: {
      'Accept': 'text/csv,application/octet-stream,application/vnd.ms-excel;q=0.9,*/*;q=0.8',
      'User-Agent': 'Gleeds Infra Portal (Netlify Function)'
    }
  });

  if (!res.ok) {
    console.error(`[PCS] CSV fetch failed ${res.status}`);
    return [];
  }

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  if (!rows.length) return [];

  // Map CSV headers to canonical fields with a flexible finder
  const H = headerIndex(rows[0]);

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;

    const title = pick(r, H, ['Notice Title', 'Title']) || '';
    const org   = pick(r, H, ['Organisation Name', 'Buyer', 'Contracting Authority']) || '';
    const url   = pick(r, H, ['Notice URL', 'URL', 'Link']) || '';
    const region= pick(r, H, [
      'Main site or location of works',
      'Region',
      'Place of performance',
      'Location'
    ]) || '';

    const deadlineRaw = pick(r, H, ['Deadline Date', 'Submission Deadline', 'End Date']) || '';
    const publishedRaw= pick(r, H, ['Published Date', 'Publication Date', 'Date Published']) || '';

    // Values may appear in one combined column or separate—handle simply
    const valueStr = pick(r, H, [
      'Estimated Value (GBP)',
      'Estimated value (GBP)',
      'Estimated total value',
      'Value',
      'Contract Value'
    ]) || '';

    // Normalise
    const deadlineISO  = toISO(deadlineRaw);
    const publishedISO = toISO(publishedRaw);
    const value = parseGBP(valueStr);

    // Skip where no title or no URL (usually not actionable)
    if (!title || !url) continue;

    items.push({
      source: 'PCS',
      title,
      organisation: org,
      region,
      deadline: deadlineISO || null,
      published: publishedISO || null,
      url,
      valueLow: value,     // we only have a single estimate; map to Low
      valueHigh: null,
      sector: inferSector(title, org, region)
    });

    if (items.length >= limit) break;
  }

  return items;
}

/* -------------------- helpers -------------------- */

function parseCSV(text) {
  // Minimal CSV parser (handles quoted fields, commas, newlines, and double quotes)
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const peek = text[i + 1];
        if (peek === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // ignore CR; handle CRLF
      } else {
        field += c;
      }
    }
  }
  // push last field/row
  if (field.length || inQuotes || row.length) {
    row.push(field);
    rows.push(row);
  }
  // trim BOM on first cell if present
  if (rows.length && rows[0].length) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  }
  return rows;
}

function headerIndex(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = (headerRow[i] || '').toString().trim().toLowerCase();
    if (!h) continue;
    map[h] = i;
  }
  return map;
}

function pick(row, H, candidates) {
  for (const c of candidates) {
    const idx = H[(c || '').toString().trim().toLowerCase()];
    if (idx != null && row[idx] != null && row[idx] !== '') {
      return row[idx];
    }
  }
  return '';
}

function toISO(s) {
  if (!s) return '';
  // Try common UK formats: "dd/MM/yyyy", "dd/MM/yyyy HH:mm", or ISO already
  const t = s.toString().trim();
  if (!t) return '';
  // If already ISO-ish:
  if (/^\d{4}-\d{2}-\d{2}T/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(t);
    return isNaN(d) ? '' : d.toISOString();
  }
  // dd/MM/yyyy [HH:mm]
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [ , dd, mm, yyyy, HH='00', MM='00' ] = m;
    const iso = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(HH),
      Number(MM)
    );
    return isNaN(iso) ? '' : iso.toISOString();
  }
  // Fallback parse:
  const d = new Date(t);
  return isNaN(d) ? '' : d.toISOString();
}

function parseGBP(s) {
  if (!s) return null;
  const t = s.toString().replace(/[,£\s]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function inferSector(title, org, region) {
  const blob = `${title || ''} ${org || ''} ${region || ''}`.toLowerCase();
  if (/\brail|network rail|hs2\b/.test(blob)) return 'Rail';
  if (/\bairport|aviation|runway|heathrow|gatwick|mag|luton\b/.test(blob)) return 'Aviation';
  if (/\broad|highway|trunk road|national highways\b/.test(blob)) return 'Highways';
  if (/\bwater|sewer|wastewater|utilities|electric|power|gas|scottish water|united utilities|anglian water|thames water\b/.test(blob)) return 'Utilities';
  if (/\bport|harbour|harbor|maritime|dock\b/.test(blob)) return 'Maritime';
  return 'Infrastructure';
}
