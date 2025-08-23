// netlify/functions/update-tenders-background.mjs
import { runUpdate } from '../lib/update-runner.mjs';

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Netlify Background Function
 * - Returns 202 immediately to the caller
 * - Continues processing in the background
 * - Logs appear under Functions > update-tenders-background > Logs
 */
export async function handler(event) {
  try {
    // Log immediately so you can see the invocation in the function logs
    console.log('[bg] invoked at', new Date().toISOString());

    // Kick off the long-running job on the next tick (non-blocking to the HTTP 202)
    setTimeout(async () => {
      try {
        console.log('[bg] starting update…');
        const counts = await runUpdate({ fast: false });
        console.log('[bg] update complete', counts);
      } catch (e) {
        console.error('[bg] update error', e?.stack || e);
      }
    }, 0);

    // Respond right away
    return json(202, { ok: true, queued: true });
  } catch (err) {
    console.error('[bg] handler failed before queue:', err?.stack || err);
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
