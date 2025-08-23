import { createClient } from '@netlify/blobs';
import contractsFinderAdapter from './adapters/contracts-finder.mjs';
import findATenderAdapter from './adapters/find-a-tender.mjs';
import { isInfraWorthy } from './lib/filters.mjs';
import { dedupeByUrl, sortByDeadlineAsc } from './lib/utils.mjs';

const STORE_NAME = 'live-opportunities.json';

export async function handler() {
  try {
    // 1) Run adapters in parallel
    const [cf, fts] = await Promise.allSettled([
      contractsFinderAdapter(),
      findATenderAdapter(),
    ]);

    let items = [];
    if (cf.status === 'fulfilled') items.push(...cf.value);
    if (fts.status === 'fulfilled') items.push(...fts.value);

    // 2) Dedupe + filter + sort
    items = dedupeByUrl(items).filter(isInfraWorthy);
    items = sortByDeadlineAsc(items);

    const payload = {
      updatedAt: new Date().toISOString(),
      items,
      sourceCounts: {
        contractsFinder: cf.status === 'fulfilled' ? cf.value.length : 0,
        findATender: fts.status === 'fulfilled' ? fts.value.length : 0,
      },
    };

    // 3) Store to Netlify Blobs
    const blobs = createClient();
    await blobs.set(STORE_NAME, JSON.stringify(payload), { contentType: 'application/json' });

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: items.length }) };
  } catch (err) {
    console.error('update-tenders error', err);
    return { statusCode: 500, body: 'update-tenders failed' };
  }
}
