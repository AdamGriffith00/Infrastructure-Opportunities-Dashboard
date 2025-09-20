// netlify/functions/fw-debug-ping.mjs
export async function handler() {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, where: "fw-debug-ping", node: process.version }),
  };
}
