// ESM version compatible with "type": "module"
import fs from "node:fs";
import path from "node:path";

function daysUntil(iso) {
  const d = new Date(iso + "T00:00:00Z").getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

export const handler = async (event) => {
  try {
    const q = event.queryStringParameters?.q?.toLowerCase() || "";
    const sector = event.queryStringParameters?.sector;

    const file = path.join(process.cwd(), "data", "frameworks.json");
    const raw = fs.readFileSync(file, "utf8");
    const json = JSON.parse(raw);

    let rows = json;
    if (sector && sector !== "All") rows = rows.filter(r => r.sector === sector);
    if (q) rows = rows.filter(r => (r.name + " " + r.client).toLowerCase().includes(q));

    rows = rows.map(r => {
      let countdown = null, stale = false;
      if (r.expected_award_date) {
        const d = daysUntil(r.expected_award_date);
        countdown = d;
        if (d < 0) stale = true;
      }
      return { ...r, countdown_days: countdown, stale };
    });

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
