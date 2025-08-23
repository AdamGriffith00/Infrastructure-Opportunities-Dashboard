export function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.url || `${it.title}|${it.organisation}|${it.deadline}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

export function sortByDeadlineAsc(items) {
  return items.slice().sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db;
  });
}
