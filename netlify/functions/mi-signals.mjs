// netlify/functions/mi-signals.mjs
import { getStore } from '@netlify/blobs';

/**
 * Momentum signals (very first cut):
 * - Reads latest tenders and scores weak signals from titles:
 *   PIN/VEAT/consultation/strategy/framework/etc.
 * - Returns list of keys and a detailed score breakdown for a selected key.
 */

const SIGNAL_PATTERNS = [
  {name:'PIN / Prior Information Notice', re:/\bpin\b|prior information notice/i, weight:1.0},
  {name:'VEAT',                          re:/\bveat\b/i, weight:0.9},
  {name:'Consultation',                  re:/consultation|call for views/i, weight:0.7},
  {name:'Strategy / Plan',               re:/strategy|masterplan|capital plan|capex plan/i, weight:0.5},
  {name:'Framework activity',            re:/framework|dps|dynamic purchasing/i, weight:0.8},
  {name:'Market engagement / Supplier day', re:/market engagement|supplier day|soft market test/i, weight:0.6}
];

export async function handler(event){
  try{
    const qs = new URLSearchParams(event.rawQuery || '');
    const group = (qs.get('group') || 'client').toLowerCase(); // client|sector|region
    const key   = (qs.get('key') || '').trim();

    const store = getStore({ name:'tenders', siteID:process.env.BLOBS_SITE_ID, token:process.env.BLOBS_TOKEN });
    const latest = await store.getJSON('latest.json');
    const items  = Array.isArray(latest?.items) ? latest.items : [];

    // Build keys
    const keyFn = (it)=> (group==='sector'? it.sector : group==='region'? it.region : it.organisation) || '—';
    const set = new Set(items.map(keyFn));
    const keys = [...set].sort();

    // If no key requested return just keys
    if(!key){
      return json(200, { ok:true, keys });
    }

    // Score the requested key
    const subset = items.filter(it => keyFn(it) === key);
    const signals = SIGNAL_PATTERNS.map(sig=>{
      let score = 0, hits=0;
      for(const it of subset){
        const blob = `${it.title||''} ${it.description||''}`;
        if(sig.re.test(blob)){ score += sig.weight; hits += 1; }
      }
      return { name: sig.name, score, note: hits? `${hits} matches`:'none' };
    }).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);

    // Normalised total for context
    const total = signals.reduce((a,b)=>a+b.score,0);
    if(total===0) signals.push({name:'No signal', score:0, note:'No weak signals detected for this key'});

    return json(200, { ok:true, keys, signals });

  }catch(e){
    console.error('[mi-signals]', e);
    return json(500, { ok:false, error:String(e) });
  }
}

function json(statusCode, body){
  return { statusCode, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) };
}
