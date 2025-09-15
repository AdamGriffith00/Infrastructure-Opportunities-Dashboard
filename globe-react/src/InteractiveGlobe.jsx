import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Globe from "react-globe.gl";
import * as d3geo from "d3-geo";
import { AnimatePresence, motion } from "framer-motion";

// External assets
const WORLD_GEOJSON_URL =
  "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const GLOBE_IMG = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const BUMP_IMG  = "https://unpkg.com/three-globe/example/img/earth-topology.png";

// Styling
const GLEEDS_YELLOW   = "#FFC300";
const NON_GLEEDS_GREY = "#555555";
const HOVER_BORDER    = "#FFFFFF";
const DEFAULT_BORDER  = "rgba(0,0,0,0.7)";

// Gleeds countries (ISO_A3)
const GLEEDS_COUNTRIES = new Set([
  "GBR","IRL",
  "AUT","CZE","FRA","DEU","HUN","ITA","POL","PRT","ROU","SVK","ESP","UKR",
  "EGY","QAT","SAU","ARE",
  "AUS","CHN","HKG","IND","SGP","VNM",
  "CAN","PER","TTO","USA",
  "BGR","HRV","MNE","SRB","BEL","CHE","LUX","GRC","DNK","FIN","NLD","NOR","SWE",
  "ZAF","LKA","ECU"
]);

// Name helpers
function displayName(feat){
  try{
    if (!feat) return "";
    if (feat.id === "GBR") return "United Kingdom";
    const n = feat.properties?.name || feat.id;
    return n === "French Guiana" ? "French Guiana (France)" : n;
  }catch{ return feat?.id || ""; }
}
const polygonLabelText = d => `<b>${displayName(d)}</b>`;

// Camera helpers
const centroidOf = feature => {
  try { return d3geo.geoCentroid(feature); }
  catch { return [0,0]; }
};
function altitudeForFeature(feat){
  try{
    const [[minLng,minLat],[maxLng,maxLat]] = d3geo.geoBounds(feat);
    const latSpan = Math.max(0.0001, Math.abs(maxLat-minLat));
    const midLat  = (maxLat+minLat)/2;
    const lngSpan = Math.max(0.0001, Math.abs(maxLng-minLng)) * Math.cos(Math.abs(midLat)*Math.PI/180);
    const span = Math.max(latSpan, lngSpan);
    if (span > 60) return 1.6;
    if (span > 30) return 1.2;
    if (span > 15) return 0.9;
    if (span >  8) return 0.65;
    if (span >  4) return 0.5;
    if (span >  2) return 0.38;
    return 0.28;
  }catch{ return 1.0; }
}

// Demo budgets (override per ISO code)
const BUDGET_OVERRIDES = {
  GBR:{name:"United Kingdom", y1:131000, y5:265000, y10:725000, basis:"Strategy/Pipeline (preview)"},
  USA:{name:"United States",  y1:195000, y5:936000, y10:1900000, basis:"IIJA/BIL mix; USD->GBP~0.78"},
  FRA:{name:"France",         y1:11500,  y5:57500,  y10:115000,  basis:"Rail & grid programmes (preview)"},
  // … keep the rest of your overrides as needed …
};
function getBudgetsDemo(id){
  const base = (id?.charCodeAt(0) || 70) + (id?.charCodeAt(1) || 30);
  const y1  = Math.round(10 + (base % 200));
  const y5  = Math.round(y1 * 5 * (0.98 + (base % 7)/50));
  const y10 = Math.round(y1 *10 * (0.95 + (base % 9)/40));
  return { y1, y5, y10 };
}
function getBudgets(iso){
  const k = iso?.toUpperCase?.() ?? iso;
  return BUDGET_OVERRIDES[k] || getBudgetsDemo(k || "");
}
const gbp = new Intl.NumberFormat("en-GB",{ style:"currency", currency:"GBP", maximumFractionDigits:0 });

export default function InteractiveGlobe(){
  const globeRef = useRef(null);

  const [worldData, setWorldData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeCountry, setActiveCountry] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({x:0,y:0});

  // container sizing
  const containerRef = useRef(null);
  const [dims, setDims] = useState({w:0,h:0});
  useEffect(()=>{
    const update = ()=> {
      const el = containerRef.current;
      if (!el) return;
      setDims({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return ()=> ro?.disconnect?.();
  },[]);

  // mouse tracking (tooltip)
  useEffect(()=>{
    const onMove = e => setMouse({x:e.clientX,y:e.clientY});
    window.addEventListener("mousemove", onMove);
    return ()=> window.removeEventListener("mousemove", onMove);
  },[]);

  // load world geojson
  useEffect(()=>{
    (async()=>{
      setLoading(true); setError("");
      try{
        const res = await fetch(WORLD_GEOJSON_URL);
        if (!res.ok) throw new Error(String(res.status));
        const gj = await res.json();
        // normalise id with ISO_A3 where present
        const feats = (gj.features||[]).map(f=>{
          const iso = f.properties?.iso_a3 || f.properties?.ISO_A3 || f.id;
          return { ...f, id: iso || f.properties?.name };
        });
        setWorldData(feats);
      }catch(e){ console.error(e); setError("Couldn't load world map."); }
      finally{ setLoading(false); }
    })();
  },[]);

  // auto-rotate
  useEffect(()=>{
    const c = globeRef.current?.controls?.();
    if (!c) return;
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = 0.4;
  },[autoRotate]);

  const filteredFeatures = useMemo(()=>worldData,[worldData]);

  const focusCountry = useCallback((feat)=>{
    if (!feat || !globeRef.current) return;
    const [lng,lat] = centroidOf(feat);
    setActiveCountry(feat);
    globeRef.current.controls?.().autoRotate = false;
    globeRef.current.pointOfView({ lat, lng, altitude: altitudeForFeature(feat) }, 1200);
  },[]);

  const resetView = useCallback(()=>{
    setActiveCountry(null);
    globeRef.current?.pointOfView({ lat:20, lng:0, altitude:2.2 }, 1200);
  },[]);

  return (
    <>
      {/* Top bar */}
      <div className="topbar" style="background:rgba(0,0,0,.4);color:#fff;border-bottom:1px solid rgba(255,255,255,.12);">
        <div style="display:flex;gap:12px;align-items:center;padding:8px 12px;">
          <strong>Interactive Globe</strong>
          <div style="margin-left:auto;display:flex;gap:12px;align-items:center;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="checkbox" checked={autoRotate} onChange={e=>setAutoRotate(e.target.checked)} />
              Auto-rotate
            </label>
            <a className="btn" href="/" title="Back to Dashboard">Back to Home</a>
            <button className="btn" onClick={resetView}>Reset</button>
          </div>
        </div>
      </div>

      {/* Info bubble */}
      <div style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;">
        <div className="panel" style="padding:8px 12px;">
          {activeCountry
            ? <span style="font-weight:600;">{displayName(activeCountry)}</span>
            : <span style="opacity:.8;">Drag to spin • Scroll to zoom • Hover to highlight • Click a country to focus</span>}
        </div>
      </div>

      {/* Globe canvas */}
      <div ref={containerRef} className="canvas" style={{ position:"relative" }}>
        {loading ? (
          <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",color:"#fff",opacity:.85}}>
            Loading world…
          </div>
        ) : error ? (
          <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",color:"#ff8c8c"}}>
            {error}
          </div>
        ) : (
          <Globe
            ref={globeRef}
            width={dims.w}
            height={dims.h}
            backgroundColor="#000000"
            globeImageUrl={GLOBE_IMG}
            bumpImageUrl={BUMP_IMG}
            showAtmosphere
            atmosphereAltitude={0.12}
            style={{ cursor: hovered ? "pointer" : "grab" }}
            polygonsData={filteredFeatures}
            polygonCapColor={d => (GLEEDS_COUNTRIES.has(d.id) && d.properties?.name!=="French Guiana") ? GLEEDS_YELLOW : NON_GLEEDS_GREY}
            polygonSideColor={d => d===hovered ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)"}
            polygonStrokeColor={d => d===hovered ? HOVER_BORDER : DEFAULT_BORDER}
            polygonAltitude={d => d===hovered ? 0.06 : 0.01}
            polygonsTransitionDuration={300}
            polygonLabel={polygonLabelText}
            onPolygonHover={setHovered}
            onPolygonClick={focusCountry}
            onGlobeReady={()=> globeRef.current?.pointOfView({ lat:20,lng:0,altitude:2.2 }, 1200)}
          />
        )}
      </div>

      {/* Hover tooltip (only for Gleeds countries) */}
      <AnimatePresence>
        {hovered && GLEEDS_COUNTRIES.has(hovered.id) && (
          <motion.div
            key={hovered.id}
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type:"spring", stiffness:300, damping:22 }}
            style={{
              position:"fixed", zIndex:30,
              left: Math.min(mouse.x + 16, (window.innerWidth  ?? 1200) - 340),
              top:  Math.min(mouse.y + 16, (window.innerHeight ?? 800)  - 180)
            }}
          >
            <div className="panel" style="width:320px;padding:14px;">
              <div style="font-size:12px;letter-spacing:.06em;opacity:.7;text-transform:uppercase;">Budget projection (preview)</div>
              <div style="font-weight:600;margin-top:-2px;">{displayName(hovered)}</div>
              {(() => {
                const b = getBudgets(hovered.id);
                const override = BUDGET_OVERRIDES[hovered.id];
                const basis = override && override.basis;
                return (
                  <>
                    <div style="margin-top:8px;font-size:14px;display:grid;row-gap:4px;">
                      <div style="display:flex;justify-content:space-between;"><span>1 year</span><span>{gbp.format(b.y1*1_000_000)}</span></div>
                      <div style="display:flex;justify-content:space-between;"><span>5 years</span><span>{gbp.format(b.y5*1_000_000)}</span></div>
                      <div style="display:flex;justify-content:space-between;"><span>10 years</span><span>{gbp.format(b.y10*1_000_000)}</span></div>
                    </div>
                    {basis ? <div style="margin-top:8px;font-size:12px;opacity:.7;line-height:1.2;">{basis}</div> : null}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
