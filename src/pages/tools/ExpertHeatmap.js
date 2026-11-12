/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { expertHeatmap as expertHeatmapApi } from '../../api/client';
import { RefreshCw } from 'lucide-react';

const DEFAULT_CENTER = [20, 10];
const DEFAULT_ZOOM = 2;
const WINDOW_OPTIONS = [1, 6, 12, 24];
const HEAT_GRADIENT = { 0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 0.8: 'orange', 1.0: 'red' };

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [];
  const r = parseInt(m[1] || 'ff', 16) / 255;
  const g = parseInt(m[2] || 'aa', 16) / 255;
  const b = parseInt(m[3] || '00', 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100 };
}

function buildSingleHueGradient(hex) {
  const { h, s } = hexToHsl(hex);
  const sat = Math.max(s, 45);
  return {
    0.15: `hsl(${h}, ${sat}%, 10%)`,
    0.35: `hsl(${h}, ${sat}%, 26%)`,
    0.55: `hsl(${h}, ${sat}%, 44%)`,
    0.75: `hsl(${h}, ${sat}%, 62%)`,
    0.9: `hsl(${h}, ${sat}%, 80%)`,
    1.0: `hsl(${h}, ${Math.min(sat, 25)}%, 95%)`,
  };
}

const DEFAULT_EXPORT_COLOR = '#f2a900'; // amber, close to the reference look

let html2canvasPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return html2canvasPromise;
}

let heatPluginPromise = null;
function loadHeatPlugin() {
  if (window.L && window.L.heatLayer) return Promise.resolve();
  if (heatPluginPromise) return heatPluginPromise;
  window.L = L;
  heatPluginPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return heatPluginPromise;
}

function HeatLayer({ points, radius, blur, max, gradient }) {
  const map = useMap();
  const layerRef = useRef(null);
  const [ready, setReady] = useState(!!(window.L && window.L.heatLayer));

  useEffect(() => {
    let cancelled = false;
    loadHeatPlugin()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => console.error('[expert-heatmap] Failed to load leaflet.heat plugin'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const layer = window.L.heatLayer(points, {
      radius,
      blur,
      max,
      maxZoom: 7,
      gradient,
    });
    layerRef.current = layer;
    layer.addTo(map);
    return () => { map.removeLayer(layer); layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, map, radius, blur, max, gradient]);

  useEffect(() => {
    layerRef.current?.setLatLngs(points);
  }, [points]);

  return null;
}

function Leaderboard({ title, rows, renderLabel }) {
  const max = rows.length ? rows[0].count : 0;
  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem', flex: '1 1 320px' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.85rem' }}>{title}</div>
      {!rows.length && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Not enough data yet.</div>}
      {rows.map((row, i) => (
        <div key={i} style={{ marginBottom: i === rows.length - 1 ? 0 : '0.55rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', marginRight: '0.4rem' }}>{i + 1}.</span>
              {renderLabel(row)}
            </span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{row.count.toLocaleString()}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--border-color, #eee)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${max ? (row.count / max) * 100 : 0}%`, background: 'var(--avg-green)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: '1rem 1.25rem', flex: '1 1 160px', minWidth: 140 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  );
}

export default function ExpertHeatmap() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportColor, setExportColor] = useState(DEFAULT_EXPORT_COLOR);
  const [exporting, setExporting] = useState(false);
  const [exportGradient, setExportGradient] = useState(null);
  const mapRef = useRef(null);

  const load = useCallback(async (h) => {
    setLoading(true);
    setError(null);
    try {
      const d = await expertHeatmapApi.get(h);
      setData(d);
    } catch (err) {
      setError(err.message || 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(hours); }, [hours, load]);

  useEffect(() => {
    const id = setInterval(() => load(hours), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [hours, load]);

  const points = useMemo(
    () => (data?.points || []).map(p => [p[0], p[1], 0.5]),
    [data]
  );

  const heatRadius = 2;
  const heatBlur = 2;
  const heatMax = 8 * hours;

  const handleExportImage = useCallback(async () => {
    if (!points.length || !mapRef.current) return;
    setExporting(true);
    try {
      await loadHtml2Canvas();
      setExportGradient(buildSingleHueGradient(exportColor));
      await new Promise(resolve => setTimeout(resolve, 200));

      const container = mapRef.current.getContainer();
      const canvas = await window.html2canvas(container, {
        useCORS: true,
        backgroundColor: '#0d0d0f',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `expert-heatmap-${hours}h-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('[expert-heatmap] Export failed:', err);
      alert('Failed to export image — the basemap tiles may have blocked the capture. See console for details.');
    } finally {
      setExportGradient(null); // back to the normal multi-color view
      setExporting(false);
    }
  }, [points, hours, exportColor]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Where the Expert Server has actually been busy — every aircraft on the server, polled every 20s.
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {WINDOW_OPTIONS.map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-color, #ddd)',
                background: hours === h ? 'var(--avg-green)' : 'transparent',
                color: hours === h ? '#fff' : 'var(--text-primary)',
                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {h}h
            </button>
          ))}
          <button
            onClick={() => load(hours)}
            title="Refresh"
            style={{ padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-color, #ddd)', background: 'transparent', cursor: 'pointer', display: 'flex' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>

          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color, #ddd)', margin: '0 0.2rem' }} />

          <input
            type="color"
            value={exportColor}
            onChange={e => setExportColor(e.target.value)}
            title="Export color"
            style={{ width: 34, height: 34, padding: 0, border: '1px solid var(--border-color, #ddd)', borderRadius: '8px', cursor: 'pointer', background: 'none' }}
          />
          <button
            onClick={handleExportImage}
            disabled={!points.length || exporting}
            title="Download a high-res image of the current view"
            style={{
              padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-color, #ddd)',
              background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem',
              cursor: (!points.length || exporting) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: (!points.length || exporting) ? 0.5 : 1,
            }}
          >
            {exporting ? 'Rendering…' : 'Download image'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', color: '#c0392b' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <StatCard label="Aircraft right now" value={data ? data.currentAircraft.toLocaleString() : '—'} />
        <StatCard label={`Avg over ${hours}h`} value={data ? data.avgAircraft.toLocaleString() : '—'} />
        <StatCard
          label={`Peak over ${hours}h`}
          value={data ? data.peakAircraft.toLocaleString() : '—'}
          sub={data?.peakAt ? new Date(data.peakAt).toLocaleString() : undefined}
        />
        <StatCard label="Periods logged" value={data ? data.periodCount.toLocaleString() : '—'} sub={data ? `${data.bucketMinutes}min each` : undefined} />
        <StatCard label="Unique flights" value={data?.uniqueFlights != null ? data.uniqueFlights.toLocaleString() : '—'} sub={`over ${hours}h`} />
        <StatCard
          label="Points plotted"
          value={data ? points.length.toLocaleString() : '—'}
          sub={data?.sampled ? `sampled from ${data.pointCount.toLocaleString()}` : 'every sighting'}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer
          ref={mapRef}
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          minZoom={2}
          worldCopyJump
          style={{ height: 520, width: '100%', background: '#111' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
            crossOrigin="anonymous"
          />
          <HeatLayer points={points} radius={heatRadius} blur={heatBlur} max={heatMax} gradient={exportGradient || HEAT_GRADIENT} />
        </MapContainer>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
        <Leaderboard
          title={`Top Aircraft — last ${hours}h`}
          rows={data?.topAircraft || []}
          renderLabel={row => row.aircraftName}
        />
        <Leaderboard
          title={`Top Liveries — last ${hours}h`}
          rows={data?.topLiveries || []}
          renderLabel={row => `${row.aircraftName} — ${row.liveryName}`}
        />
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.6rem' }}>
Top Aircraft/Liveries counts are unique flights seen in this window (deduplicated across every ~20s poll it appeared in), not raw sightings — a 14h widebody flight counts once, the same as a 1h domestic hop, so this reflects how often something is actually flown rather than how long it stays on screen.
      </p>

      <style>{`
        .spin { animation: eh-spin 0.9s linear infinite; }
        @keyframes eh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
