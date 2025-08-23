// netlify/functions/update-tenders-background.mjs
// Delegate background/scheduled execution to the working update-tenders function.
// This avoids duplicating crawler logic and sidesteps any background-only bundling quirks.

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event, context) {
  try {
    // Let you test a brief/manual run: …/update-tenders-background?fast=1
    const fast = (event?.queryStringParameters?.fast ?? '') === '1';

    // Prefer PRIMARY_URL, then URL (Netlify injects these); fallback to the request host.
    const base =
      process.env.PRIMARY_URL ||
      process.env.URL ||
      `https://${event.headers.host}`;

    const url = `${base}/.netlify/functions/update-tenders${fast ? '?fast=1' : ''}`;

    // Call the working function
    const res = await fetch(url, {
      headers: { 'x-delegate': 'update-tenders-background' },
    });

    let data = null;
    try { data = await res.json(); } catch {}

    // Surface a helpful response so you can see the outcome in your browser
    return json(200, {
      ok: true,
      delegatedTo: url,
      status: res.status,
      data,
    });
  } catch (err) {
    return json(500, { ok: false, error: err?.message ?? String(err) });
  }
}
