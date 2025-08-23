// netlify/functions/mi-frameworks-rebid.mjs
import { getStore } from '@netlify/blobs';

/**
 * Predict notice windows for known frameworks (very simple):
 * - Expects a blob like 'frameworks/latest.json' or 'frameworks.json'
 *   with items having: name, client, expected_award_date (ISO), value.amount
 * - Notice assumed ~ 4–6 months before award.
 */

export async function handler(){
  try{
    const store = getStore({ name:'tenders', siteID:process.env.BLOBS_SITE_ID, token:process.env.BLOBS_TOKEN });

    // try several keys (use whichever you save)
    const fw = await (store.getJSON('frameworks/latest.json')
      .catch(()=>store.getJSON('frameworks.json'))
      .catch(()=>null));

    const arr = Array.isArray(fw?.items) ? fw.items : [];

    const out = arr.map(x=>{
      const award = dateOrNull(x.expected_award_date);
      const value = x?.value?.amount ?? null;
      let notice=null;
      if(award){
        const d = new Date(award.getTime());
        d.setMonth(d.getMonth()-5); // 5 months earlier
        notice = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }
      return { name: x.name||'—', client:x.client||x.organisation||'', notice, value };
    }).filter(x=>x.notice).sort((a,b)=>a.notice.localeCompare(b.notice));

    return json(200, { ok:true, items: out });

  }catch(e){
    console.error('[mi-frameworks-rebid]', e);
    return json(200, { ok:true, items: [] }); // graceful empty
  }
}

function json(statusCode, body){
  return { statusCode, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) };
}
function dateOrNull(s){ const d=new Date(s); return isNaN(d)?null:d; }
