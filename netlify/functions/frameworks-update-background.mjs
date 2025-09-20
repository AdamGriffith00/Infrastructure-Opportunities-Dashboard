// Proxy to the inline updater so the old URL keeps working
function json(s,b){return{statusCode:s,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}}
export async function handler(event){
  try{
    const q = event?.queryStringParameters || {};
    const fast = q.fast === "1";
    const mod = await import("./frameworks-update-bg-inline.mjs");
    if (!mod?.handler) throw new Error("inline handler not found");
    // Call inline handler directly to avoid another HTTP hop
    return await mod.handler(event);
  }catch(err){
    return json(500,{ ok:false, error: err?.message || String(err), stack: err?.stack || null });
  }
}
