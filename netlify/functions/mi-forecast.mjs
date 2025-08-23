// netlify/functions/mi-forecast.mjs
import { getStore } from '@netlify/blobs';

/**
 * MVP forecaster:
 * - Reads tenders latest payload (items with deadlines)
 * - Aggregates by deadline month for the chosen group (region|sector|client)
 * - Builds a 12-month outlook (naive smoothing + 50% band)
 * - Optional scenario knobs: capex (percent), utilW, hwW (relative weights)
 */

const H_DEFAULT = 12;

export async function handler(event) {
  try {
    const qs = new URLSearchParams(event.rawQuery || '');
    const group = (qs.get('group') || 'region').toLowerCase();        // region|sector|client
    const key   = (qs.get('key') || '').trim();
    const metric= (qs.get('metric') || 'value');                      // value|count
    const h     = Math.min(Math.max(parseInt(qs.get('h')||H_DEFAULT,10), 3), 24);

    // Scenario knobs
    const capex = Number(qs.get('capex') || 0);   // % growth
    const utilW = Number(qs.get('utilW') || 0);   // sector weight tweak
    const hwW   = Number(qs.get('hwW') || 0);

    const store = getStore({ name: 'tenders', siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
    const latest = await store.getJSON('latest.json');
    const items  = Array.isArray(latest?.items) ? latest.items : [];

    // ---- group keys list
    const keys = uniqueKeys(items, group).slice(0, 500);

    // ---- monthly aggregation (future-oriented)
    const byMonth = aggregateByMonth(items, group);

    // build label months for horizon h starting next month
    const labels = horizonLabels(h);

    // choose series base for the selected key (or top-all if no key)
    const chosenKey = key && keys.includes(key) ? key : (keys[0] || '');
    const series = seriesForKey(byMonth, labels, chosenKey, metric);

    // naive smoothing + bands
    const smoothed = smooth(series.y);
    const { lo, hi } = bands(smoothed);

    // scenario adjustments
    const adj = applyScenario(smoothed, labels, chosenKey, capex, utilW, hwW);

    // Top table (next 6m)
    const top = computeTop(byMonth, metric);

    return json(200, {
      ok:true,
      keys,
      series: { labels, y: adj, lo, hi },
      top
    });

  } catch (e) {
    console.error('[mi-forecast] error', e);
    return json(500, { ok:false, error: e.message || String(e) });
  }
}

// -------- helpers

function json(statusCode, body){
  return { statusCode, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) };
}

function horizonLabels(h){
  const labels = [];
  const d = new Date(); // now
  // start from next month
  d.setDate(1);
  d.setMonth(d.getMonth()+1);
  for(let i=0;i<h;i++){
    labels.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    d.setMonth(d.getMonth()+1);
  }
  return labels;
}

function uniqueKeys(items, group){
  const set = new Set();
  for(const it of items){
    const k = pickKey(it, group);
    if(k) set.add(k);
  }
  return [...set].sort();
}

function pickKey(it, group){
  if(group==='region') return (it.region || '').trim();
  if(group==='sector') return (it.sector || '').trim();
  if(group==='client') return (it.organisation || '').trim();
  return '';
}

function monthKey(iso){
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function aggregateByMonth(items, group){
  // shape: map[key][YYYY-MM] -> {count, value}
  const map = new Map();
  for(const it of items){
    const k = pickKey(it, group) || '—';
    const m = monthKey(it.deadline);
    if(!m) continue;
    const value = numberish(it.valueLow) ?? numberish(it.valueHigh) ?? 0;
    if(!map.has(k)) map.set(k, new Map());
    const mm = map.get(k);
    if(!mm.has(m)) mm.set(m, {count:0, value:0});
    const acc = mm.get(m);
    acc.count += 1;
    acc.value += value;
  }
  return map;
}

function seriesForKey(byMonth, labels, key, metric){
  // if empty key, aggregate all keys
  if(!key){
    const y = labels.map(m=>{
      let tot=0;
      for(const mm of byMonth.values()){
        if(mm.has(m)) tot += (metric==='count') ? mm.get(m).count : mm.get(m).value;
      }
      return tot;
    });
    return {y};
  }
  const mm = byMonth.get(key) || new Map();
  const y = labels.map(m=>{
    const v = mm.get(m);
    return v ? (metric==='count'? v.count : v.value) : 0;
  });
  return {y};
}

function smooth(arr){
  // simple single-exponential smoothing with alpha 0.5
  const alpha = 0.5;
  let s = 0, out=[];
  for(let i=0;i<arr.length;i++){
    s = (i===0) ? arr[i] : alpha*arr[i] + (1-alpha)*s;
    out.push(s);
  }
  return out;
}

function bands(arr){
  // 50% band via scaled MAD proxy
  const mean = arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length);
  const devs = arr.map(x=>Math.abs(x-mean));
  const mad  = devs.sort((a,b)=>a-b)[Math.floor(devs.length/2)] || 0;
  const half = Math.max(0.15*mean, 0.75*mad);
  const lo = arr.map(x=>Math.max(0,x-half));
  const hi = arr.map(x=>x+half);
  return {lo,hi};
}

function computeTop(byMonth, metric){
  const next6 = horizonLabels(6);
  const rows = [];
  for(const [k, mm] of byMonth.entries()){
    let sum = 0;
    for(const m of next6){
      const v = mm.get(m);
      if(v) sum += (metric==='count'? v.count : v.value);
    }
    if(sum>0) rows.push({key:k, total:sum, metric});
  }
  rows.sort((a,b)=>b.total-a.total);
  return rows.slice(0,10);
}

function numberish(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function applyScenario(arr, labels, key, capex, utilW, hwW){
  // naive: capex shifts all; sector weights nudge if key matches
  const isUtilities = /utilit/i.test(key);
  const isHighways  = /highway|road/i.test(key);
  const g = 1 + (capex/100);
  return arr.map(v=>{
    let r = v*g;
    if(isUtilities) r *= 1 + utilW/100;
    if(isHighways)  r *= 1 + hwW/100;
    return r;
  });
}
