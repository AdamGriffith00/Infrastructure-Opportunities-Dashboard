export async function handler() {
  try {
    const mod = await import("../lib/frameworks-runner.mjs");
    const hasRun = !!mod?.runFrameworksUpdate;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, hasRun }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err), stack: err?.stack || null }),
    };
  }
}
