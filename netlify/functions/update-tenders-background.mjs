// netlify/functions/update-tenders-background.mjs
// Run the same code as update-tenders on a schedule.
// This guarantees both manual and scheduled runs share the exact logic.

import { handler as runUpdate } from './update-tenders.mjs';

export async function handler(event, context) {
  // You can pass through ?fast=1 during manual tests:
  return runUpdate(event, context);
}
