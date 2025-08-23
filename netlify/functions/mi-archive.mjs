// netlify/functions/mi-archive.mjs
import { getStore } from '@netlify/blobs';

export async function handler(){
  try{
    const store = getStore({ name:'tenders', siteID:process.env.BLOBS_SITE_ID, token:process.env.BLOBS_TOKEN });
    const payload = await store.getJSON('latest.json');
    if(!payload?.items) return json(200,{ok:false, note:'no latest'});
    const stamp = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    await store.setJSON(`archive/${stamp}.json`, payload);
    return json(200,{ok:true, saved:`archive/${stamp}.json`, count:payload.items.length});
  }catch(e){
    console.error('[mi-archive]', e);
    return json(500,{ok:false, error:String(e)});
  }
}
function json(statusCode, body){ return {statusCode, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)};}
