import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import Globe from "react-globe.gl";
import * as d3geo from "d3-geo";

// Data sources (world borders)
const WORLD_GEOJSON_URL =
  "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

// Globe textures
const GLOBE_IMG = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const BUMP_IMG  = "https://unpkg.com/three-globe/example/img/earth-topology.png";

// Brand
const GLEEDS_YELLOW   = "#FFC300";
const NON_GLEEDS_GREY = "#555555";
const HOVER_BORDER    = "#FFFFFF";
const DEFAULT_BORDER  = "rgba(0,0,0,0.7)";

// Gleeds presence (ISO_A3)
const GLEEDS_COUNTRIES = new Set([
  "GBR","IRL",
  "AUT","CZE","FRA","DEU","HUN","ITA","POL","PRT","ROU","SVK","ESP","UKR",
  "EGY","QAT","SAU","ARE",
  "AUS","CHN","HKG","IND","SGP","VNM",
  "CAN","PER","TTO","USA",
  "BGR","HRV","MNE","SRB","BEL","CHE","LUX","GRC","DNK","FIN","NLD","NOR","SWE",
  "ZAF","LKA","ECU"
]);

function displayName(feat){
  if (!feat) return "";
  if (feat.id === "GBR") return "United Kingdom";
  return feat.properties?.name || feat.id;
}

function centroidOf(feature){
  try { return d3geo.geoCentroid(feature); }
  catch { return [0,0]; }
}

function altitudeForFeature(feat){
  try{
    const [[minLng, minLat],[maxLng, maxLat]] = d3geo.geoBounds(feat);
    const latSpan   = Math.max(0.0001, Math.abs(maxLat - minLat));
    const midLat    = (maxLat + minLat)/2;
    const lngSpan   = Math.max(0.0001, Math.abs(maxLng - minLng)) * Math.cos(Math.abs(midLat)*Math.PI/180);
    const span      = Math.max(latSpan, lngSpan);
    if (span > 60) return 1.6;
    if (span > 30) return 1.2;
    if (span > 15) return 0.9;
    if (span >  8) return 0.65;
    if (span >  4) return 0.5;
    if (span >  2) return 0.38;
    return 0.28;
  }catch{ return 1.0; }
}

function App(){
  const globeRef = useRef(null);

  const [world, setWorld]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [hovered, setHovered]   = useState(null);
  const [active, setActive]     = useState(null);
  const [autoRotate, setRotate] = useState(true);

  // responsive container
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      setDims({
        w: containerRef.current.clientWidth,
        h: containerRef.current.clientHeight
      });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // load world
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setError("");
        const res = await fetch(WORLD_GEOJSON_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gj = await res.json();
        if (alive) setWorld(gj.features || []);
      } catch (e) {
        if (alive) setError("Couldn't load world map.");
        console.error(e);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // controls
  useEffect(() => {
    const c = globeRef.current?.controls?.();
    if (!c) return;
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = 0.4;
  }, [autoRotate]);

  const focus = useCallback((feat)=>{
    if (!feat || !globeRef.current) return;
    setActive(feat);
    const [lng, lat] = centroidOf(feat);
    const alt = altitudeForFeature(feat);
    const c = globeRef.current.controls?.();
    if (c) c.autoRotate = false;
    globeRef.current.pointOfView({ lat, lng, altitude: alt }, 1200);
  },[]);

  const reset = useCallback(()=>{
    setActive(null);
    globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1200);
  },[]);

  const polygons = useMemo(()=>world, [world]);

  return (
    <div style="position:fixed; inset:0; background:#000; color:#fff;">
      {/* top bar */}
      <div style="position:fixed; left:0; right:0; top:0; z-index:10; background:rgba(0,0,0,.5); border-bottom:1px solid rgba(255,255,255,.12);">
        <div style="display:flex; gap:12px; align-items:center; padding:8px 12px;">
          <strong>Interactive Globe</strong>
          <div style="margin-left:auto; display:flex; gap:12px; align-items:center; font-size:13px;">
            <label style="display:flex; gap:6px; align-items:center; cursor:pointer; user-select:none;">
              <input type="checkbox" checked={autoRotate} onChange={e=>setRotate(e.target.checked)} />
              Auto-rotate
            </label>
            <button onClick={reset} style="padding:6px 10px; border:1px solid rgba(255,255,255,.2); background:transparent; color:#fff; border-radius:6px;">Reset</button>
          </div>
        </div>
      </div>

      {/* status */}
      <div style="position:fixed; left:50%; transform:translateX(-50%); bottom:16px; z-index:10; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); padding:8px 12px; border-radius:12px; font-size:13px;">
        {active ? <b>{displayName(active)}</b> : <span style="opacity:.8">Drag to spin • Scroll to zoom • Click a country to focus</span>}
      </div>

      {/* globe */}
      <div ref={containerRef} style="position:absolute; inset:0; top:44px;">
        {loading ? (
          <div style="width:100%; height:100%; display:grid; place-items:center; opacity:.85;">Loading world…</div>
        ) : error ? (
          <div style="width:100%; height:100%; display:grid; place-items:center; color:#ff7b7b;">{error}</div>
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
            polygonsData={polygons}
            polygonCapColor={d => (GLEEDS_COUNTRIES.has(d.id) ? GLEEDS_YELLOW : NON_GLEEDS_GREY)}
            polygonSideColor={d => (d === hovered ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)")}
            polygonStrokeColor={d => (d === hovered ? HOVER_BORDER : DEFAULT_BORDER)}
            polygonAltitude={d => (d === hovered ? 0.06 : 0.01)}
            polygonsTransitionDuration={300}
            polygonLabel={d => `<b>${displayName(d)}</b>`}
            onPolygonHover={setHovered}
            onPolygonClick={focus}
            onGlobeReady={() => globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1200)}
          />
        )}
      </div>
    </div>
  );
}

// mount into globe.html's #root
const rootEl = document.getElementById('root');
createRoot(rootEl).render(<App />);
