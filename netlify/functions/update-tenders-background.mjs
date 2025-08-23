// netlify/functions/update-tenders-background.mjs
import { runUpdate } from '../lib/update-runner.mjs';

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler() {
  try {
    // Return immediately so the browser doesn't wait
    setTimeout(() => {
      runUpdate({ fast: false })
        .then(c => console.log('[bg] update complete', c))
        .catch(e => console.error('[bg] update error', e?.stack || e));
    }, 0);

    return json(202, { ok: true, queued: true });
  } catch (err) {
    console.error('[bg] handler failed before queue:', err?.stack || err);
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
