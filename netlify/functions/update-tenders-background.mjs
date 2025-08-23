// netlify/functions/update-tenders-background.mjs
// Queue-then-work background runner

import { runUpdate } from './update-tenders.mjs';

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler() {
  try {
    // Immediately hand back 202 so the browser/UI doesn't wait
    setTimeout(() => {
      runUpdate({ fast: false })
        .then(c => console.log('[bg] update complete', c))
        .catch(e => console.error('[bg] update error', e?.stack || e));
    }, 0);

    return json(202, { ok:true, queued:true });
  } catch (err) {
    console.error('[bg] handler failed before queue:', err?.stack || err);
    return json(500, { ok:false, error: err?.message || String(err) });
  }
}
