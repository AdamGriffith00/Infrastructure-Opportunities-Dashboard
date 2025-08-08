// /.netlify/functions/seed-update
// Simple relay so you can manually run the scheduled job via HTTP.

import { handler as runUpdate } from './update-tenders.mjs';

export async function handler(event, context) {
  // You can add a basic secret check here if you want.
  return runUpdate(event, context);
}
