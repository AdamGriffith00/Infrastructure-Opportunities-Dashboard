import { handler as runNow } from "./update-tenders.mjs";
export async function handler() {
  // Returns a response, but Netlify just logs it—fine for our purpose.
  return await runNow();
}
