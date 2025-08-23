// Central place for "Gleeds infra-worthy" rules.
// Tune freely without touching adapters.

const MIN_VALUE_GBP = 100000; // ignore micro purchases
const EXCLUDE_PATTERNS = [
  /(cleaning|catering|uniform|security guard|software|licen[cs]e|printing|stationery|school meals)/i,
  /(temporary staff|agency staff|recruitment services)/i,
  /(legal services|audit|insurance|marketing|public relations)/i,
];

export function isInfraWorthy(n) {
  // hard excludes
  if (EXCLUDE_PATTERNS.some(rx => rx.test(`${n.title} ${n.organisation}`))) return false;

  // value gate (keep if either bound clears threshold)
  const passValue =
    (typeof n.valueHigh === 'number' && n.valueHigh >= MIN_VALUE_GBP) ||
    (typeof n.valueLow === 'number' && n.valueLow >= MIN_VALUE_GBP);

  // sector: only our five, plus general Infrastructure
  const okSector = /^(Aviation|Utilities|Rail|Highways|Maritime|Infrastructure)$/.test(n.sector);

  return okSector && passValue;
}
