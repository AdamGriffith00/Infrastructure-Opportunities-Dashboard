import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN   = process.env.BLOBS_TOKEN;

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler() {
  try {
    const present = {
      hasSiteId: !!SITE_ID,
      hasToken : !!TOKEN,
      // never return actual secrets
    };

    if (!SITE_ID || !TOKEN) {
      return json(500, { ok:false, where:'env', present, error:'Missing BLOBS_SITE_ID or BLOBS_TOKEN' });
    }

    const store = getStore({ name: 'tenders', siteID: SITE_ID, token: TOKEN });

    // write a ping file and read it back
    const stamp = new Date().toISOString();
    await store.set('diag.json', JSON.stringify({ wroteAt: stamp }), { contentType: 'application/json' });
    const text = await store.get('diag.json');

    return json(200, { ok:true, present, wrote: stamp, readBack: text ? JSON.parse(text) : null });
  } catch (err) {
    console.error('blobs-diagnostics error:', err);
    return json(500, { ok:false, where:'runtime', error: err.message ?? String(err) });
  }
}
