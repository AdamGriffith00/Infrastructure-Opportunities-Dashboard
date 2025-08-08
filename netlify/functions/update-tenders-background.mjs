// netlify/functions/update-tenders-background.mjs
import { handler as runNow } from "./update-tenders.mjs";

export async function handler() {
  // just delegate to the foreground logic so both paths behave the same
  const res = await runNow();
  // background functions ignore response body, but returning is harmless
  return res;
}
