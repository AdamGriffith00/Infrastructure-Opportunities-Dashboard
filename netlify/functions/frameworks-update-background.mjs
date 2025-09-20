// netlify/functions/frameworks-update-background.mjs
function json(s, b) {
  return { statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) };
}

export async function handler(event) {
  try {
    const fast = event?.queryStringParameters?.fast === "1";
    const mod = await import("./lib/frameworks-runner.mjs"); // dot-path is critical
    if (!mod?.runFrameworksUpdate) throw new Error("runFrameworksUpdate export not found");
    const result = await mod.runFrameworksUpdate({ fast });
    return json(200, result);
  } catch (err) {
    // if you still see Netlify's opaque page, check Function logs; otherwise this will show
    return json(500, { ok: false, error: err?.message || String(err), stack: err?.stack || null });
  }
}
