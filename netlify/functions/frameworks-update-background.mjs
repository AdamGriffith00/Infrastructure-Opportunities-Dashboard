// netlify/functions/frameworks-update-background.mjs
import { runFrameworksUpdate } from '../lib/frameworks-runner.mjs';

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler() {
  try {
    const result = await runFrameworksUpdate();
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
