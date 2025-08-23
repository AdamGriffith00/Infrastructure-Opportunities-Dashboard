// netlify/functions/update-tenders.mjs
import { runUpdate } from '../lib/update-runner.mjs';

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  try {
    const fast = event?.queryStringParameters?.fast === '1';
    const counts = await runUpdate({ fast });
    return json(200, { ok: true, mode: fast ? 'fast' : 'full', counts });
  } catch (err) {
    console.error('update-tenders error:', err?.stack || err);
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
