// Long-running background job
import { runUpdate } from '../lib/update-runner.mjs';

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  const fast = event?.queryStringParameters?.fast === '1';
  try {
    console.time(`[update] background ${fast ? 'fast' : 'full'}`);
    const counts = await runUpdate({ fast });
    console.timeEnd(`[update] background ${fast ? 'fast' : 'full'}`);
    return json(200, { ok: true, mode: fast ? 'fast' : 'full', counts });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
