// Returns 202 immediately, then calls the background updater.
function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler(event) {
  try {
    const origin =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:8888";
    const url = new URL(`${origin}/.netlify/functions/frameworks-update-background`);
    // pass through ?fast=1 if you want a lighter run mode later
    if (event?.queryStringParameters?.fast === "1") url.searchParams.set("fast", "1");

    // fire and forget
    fetch(url.toString()).catch(() => {});
    return json(202, { ok: true, queued: true, note: "Frameworks refresh started." });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err) });
  }
}
