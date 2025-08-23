// Normalisation and sector inference shared by all adapters

export function toISO(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return isNaN(d) ? null : d.toISOString();
}

export function parseNumberish(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,£\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function inferSector({ title = '', organisation = '', sector = '' }) {
  const hay = `${title} ${organisation} ${sector}`.toLowerCase();

  if (/(airport|aviation|airside|runway|terminal)/.test(hay)) return 'Aviation';
  if (/(water|wastewater|sewer|gas|electric|utilities?\b)/.test(hay)) return 'Utilities';
  if (/(rail|rolling stock|station|track)/.test(hay)) return 'Rail';
  if (/(highways?|roads?\b|junction|carriageway|motorway)/.test(hay)) return 'Highways';
  if (/(port|harbour|harbor|dock|maritime|ferry)/.test(hay)) return 'Maritime';

  // default bucket (still infra enough for us)
  return 'Infrastructure';
}

/**
 * Normalised item your UI expects.
 * All adapters should return an array of this shape.
 */
export function normalizeItem(raw) {
  const title = raw.title?.trim() || 'Untitled';
  const organisation = raw.organisation?.trim() || '';
  const region = raw.region?.trim() || '';
  const deadline = toISO(raw.deadline);
  const valueLow = parseNumberish(raw.valueLow);
  const valueHigh = parseNumberish(raw.valueHigh);
  const url = raw.url || '#';
  const source = raw.source || 'Unknown';

  const sector = raw.sector
    ? raw.sector
    : inferSector({ title, organisation, sector: raw.sector });

  return {
    title,
    organisation,
    region,
    deadline,
    valueLow,
    valueHigh,
    sector,
    url,
    source,
  };
}
