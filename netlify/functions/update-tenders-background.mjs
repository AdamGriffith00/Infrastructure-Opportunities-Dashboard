import { handler as runNow } from "./update-tenders.mjs";
export async function handler() {
  return await runNow();
}
