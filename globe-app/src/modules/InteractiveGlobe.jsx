import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Globe from "react-globe.gl";
import * as d3geo from "d3-geo";
import { feature as topoToGeo } from "topojson-client";

// World boundaries sources (fallback chain)
const WORLD_SOURCES = [
  { url: "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson", type: "geojson" },
  { url: "https://unpkg.com/world-atlas@2/countries-110m.json", type: "topojson", objectName: "countries" },
  { url: "./data/world-110m.json", type: "topojson", objectName: "countries", optional: true } // optional local copy
];

const GLEEDS_YELLOW = "#FFC300";
const NON_GLEEDS_GREY = "#555555";
const HOVER_BORDER = "#FFFFFF";
const DEFAULT_BORDER = "rgba(0,0,0,0.7)";

// Example Gleeds ISO3 set — highlight countries (optional)
const GLEEDS_COUNTRIES = new Set([
  "GBR","IRL",
  "AUT","CZE","FRA","DEU","HUN","ITA","POL","PRT","ROU","SVK","ESP","UKR",
  "EGY","QAT","SAU","ARE",
  "AUS","CHN","HKG","IND","SGP","VNM",
  "CAN","PER","TTO","USA",
  "BGR","HRV","MNE","SRB","BEL","CHE","LUX","GRC","DNK","FIN","NLD","NOR","SWE",
  "ZAF","LKA","ECU"
]);

function centroidOf(feature) {
  try { return d3geo.geoCentroid(feature); } catch { return [0, 0]; }
}
function altitudeForFeature(feat) {
  try {
    const [[minLng, minLat], [maxLng, maxLat]] = d3geo.geoBounds(feat);
    const latSpan = Math.max(0.0001, Math.abs(maxLat - minLat));
    const midLat = (maxLat + minLat) / 2;
    const lngSpanRaw = Math.max(0.0001, Math.abs(maxLng - minLng));
    const lngSpan = lngSpanRaw * Math.cos((Math.PI / 180) * Math.abs(midLat));
    const span = Math.max(latSpan, lngSpan);
    if (span > 60) return 1.6;
    if (span > 30) return 1.2;
    if (span > 15) return 0.9;
    if (span > 8)  return 0.65;
    if (span > 4)  return 0.5;
    if (span > 2)  return 0.38;
    return 0.28;
  } catch { return 1.0; }
}
function ensureIsoId(features) {
  for (const f of features) {
    const iso =
      f.id ||
      f.properties?.ISO_A3 ||
      f.properties?.ADM0_A3 ||
      f.properties?.iso_a3 ||
      f.properties?.iso3 ||
      null;
    if (iso) f.id = iso.toUpperCase();
  }
  return features;
}

export default function InteractiveGlobe() {
  const globeRef = useRef(null);
  const [worldData, setWorldData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeCountry, setActiveCountry] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });

  // responsive
  useEffect(() => {
    const upd = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  // Load world with fallbacks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      for (const src of WORLD_SOURCES) {
        try {
          const res = await fetch(src.url, { mode: "cors" });
          if (!res.ok) {
            if (src.optional) continue;
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          let features = [];
          if (src.type === "geojson") {
            features = Array.isArray(data.features) ? data.features : [];
          } else {
            const objName = src.objectName || Object.keys(data.objects)[0];
            features = topoToGeo(data, data.objects[objName]).features || [];
          }
          if (features.length) {
            ensureIsoId(features);
            if (!cancelled) setWorldData(features);
            break;
          }
        } catch (e) {
          console.warn(`World load failed from ${src.url}:`, e);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // autorotate
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.4;
  }, [autoRotate]);

  const focusCountry = useCallback((feat) => {
    if (!feat || !globeRef.current) return;
    const [lng, lat] = centroidOf(feat);
    setActiveCountry(feat);
    const controls = globeRef.current.controls?.();
    if (controls) controls.autoRotate = false;
    globeRef.current.pointOfView({ lat, lng, altitude: altitudeForFeature(feat) }, 1100);
  }, []);
  const resetView = useCallback(() => {
    if (!globeRef.current) return;
    setActiveCountry(null);
    globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1000);
  }, []);

  const features = useMemo(() => worldData, [worldData]);

  return (
    <>
      <div className="topbar">
        <strong>Interactive Globe</strong>
        <span className="spacer" />
        <label className="switch">
          <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />
          Auto-rotate
        </label>
        <button className="btn" onClick={resetView}>Reset</button>
      </div>

      <div style={{ position:'fixed', left:'50%', transform:'translateX(-50%)', bottom:16, zIndex:10 }}>
        <div className="panel">
          {activeCountry
            ? <b>{activeCountry.properties?.name || activeCountry.id}</b>
            : <>Drag to spin • Scroll to zoom • Hover to highlight • Click a country</>}
        </div>
      </div>

      <div style={{ position:'absolute', inset:0, top:48 }}>
        {loading ? (
          <div style={{display:'grid',placeItems:'center',width:'100%',height:'100%',color:'#bbb'}}>Loading world…</div>
        ) : (
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            backgroundColor="#000000"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            showAtmosphere
            atmosphereAltitude={0.12}
            style={{ cursor: hovered ? "pointer" : "grab" }}

            polygonsData={features}
            polygonCapColor={d => GLEEDS_COUNTRIES.has(d.id) ? GLEEDS_YELLOW : NON_GLEEDS_GREY}
            polygonSideColor={d => d === hovered ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)"}
            polygonStrokeColor={d => d === hovered ? HOVER_BORDER : DEFAULT_BORDER}
            polygonAltitude={d => (d === hovered ? 0.06 : 0.01)}
            polygonsTransitionDuration={300}
            polygonLabel={d => `\n<b>${d.properties?.name || d.id}</b>\n`}

            onPolygonHover={setHovered}
            onPolygonClick={focusCountry}

            onGlobeReady={() => {
              if (!globeRef.current) return;
              globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1000);
            }}
          />
        )}
      </div>
    </>
  );
}
