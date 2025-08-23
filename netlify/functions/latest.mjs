import { createClient } from '@netlify/blobs';

const STORE_NAME = 'live-opportunities.json';

export async function handler() {
  try {
    const blobs = createClient();
    const text = await blobs.get(STORE_NAME);

    if (!text) {
      return {
        statusCode: 200,
        body: JSON.stringify({ updatedAt: null, items: [] }),
        headers: { 'content-type': 'application/json' },
      };
    }

    return {
      statusCode: 200,
      body: text,
      headers: { 'content-type': 'application/json' },
    };
  } catch (err) {
    console.error('latest error', err);
    return { statusCode: 500, body: 'latest failed' };
  }
}
