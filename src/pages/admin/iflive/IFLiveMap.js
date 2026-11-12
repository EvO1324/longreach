/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw } from 'lucide-react';
import { ifLive, liveMap } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import { useIFLive } from './IFLiveContext';
import { LIVE_CSS, splitType, zWhen } from './liveData';

import brand from '../../../brand';

const POLL_MS = 20_000;
const DEFAULT_CENTER = brand.map.center;
const DEFAULT_ZOOM = brand.map.zoom;
const LIVE_COLOUR = '#1f6b4a';
const IDLE_COLOUR = '#7b8580';

function iconKeyFor(typeName) {
  if (!typeName) return 'unknown';
  const t = typeName.toLowerCase();
  if (t.includes('a320') || t.includes('a319') || t.includes('a321') || t.includes('a220')) return 'a320';
  if (t.includes('a330') || t.includes('a350')) return 'a330';
  if (t.includes('a340')) return 'a340';
  if (t.includes('a380')) return 'a380';
  if (t.includes('737'))  return 'b737';
  if (t.includes('747'))  return 'b747';
  if (t.includes('767'))  return 'b767';
  if (t.includes('777'))  return 'b777';
  if (t.includes('787'))  return 'b787';
  if (t.includes('e19') || t.includes('embraer')) return 'e195';
  if (t.includes('q400') || t.includes('dash')) return 'q400';
  return 'unknown';
}

// The type's silhouette, filled with a flat colour through a CSS mask.
function planeIcon(heading, typeName, { live, selected }) {
  const size = selected ? 40 : 30;
  const colour = live ? LIVE_COLOUR : IDLE_COLOUR;
  const src = `/aircraft-icons/${iconKeyFor(typeName)}.svg`;
  const mask = `url(${src}) center / contain no-repeat`;
  const html = `<div style="width:${size}px;height:${size}px;transform:rotate(${heading || 0}deg);background:${selected ? '#0f3d2a' : colour};-webkit-mask:${mask};mask:${mask};filter:drop-shadow(0 1px 1px rgba(255,255,255,.9));"></div>`;
  return L.divIcon({ html, className: 'if-plane', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

// Longitude moved by whole turns to within 180° of `ref`.
const near = (lng, ref) => lng + 360 * Math.round((ref - lng) / 360);

function unwrap(points, ref) {
  const out = [];
  let prev = ref;
  for (const [lat, lng] of points) {
    const l = near(lng, prev);
    out.push([lat, l]);
    prev = l;
  }
  return out;
}

const MAP_CSS = `
.if-map { background: #dceef8 !important; }
.if-map .leaflet-control-zoom { display: none !important; }
.if-map .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,.75) !important; color: #555 !important; }
.if-plane { background: none; border: none; }
.if-tip { background: #fff !important; color: #1c1c1a !important; border: 1px solid #dcd9d1 !important; border-radius: 8px !important; box-shadow: 0 4px 14px rgba(0,0,0,.12) !important; font-size: 0.75rem !important; padding: 6px 9px !important; }
.if-tip::before { display: none !important; }
.fm-card { position: absolute; left: 12px; bottom: 12px; z-index: 500; display: flex; align-items: center; gap: 0.75rem; max-width: calc(100% - 24px); background: #fff; color: #1c1c1a; border: 1px solid #dcd9d1; border-radius: 10px; padding: 0.55rem 0.85rem 0.55rem 0.55rem; box-shadow: 0 4px 16px rgba(0,0,0,.12); }
.fm-card img { width: 52px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.fm-idle { display: flex; flex-wrap: wrap; gap: 0.4rem 1.25rem; font-size: 0.82rem; color: var(--text-secondary); }
`;

function IFLiveMap() {
  const { orgId, typeNames, fleetImages } = useIFLive();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [paths, setPaths] = useState({}); // flightId -> [[lat, lng], ...]
  const pathReq = useRef(0);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const d = await ifLive.positions(orgId);
      const list = d.aircraft || [];
      setRows(list);
      setUpdatedAt(new Date());
      // Flown path for every aircraft on a live flight.
      const req = ++pathReq.current;
      const live = list.filter(r => r.position?.flightId && r.position?.sessionId);
      const results = await Promise.all(live.map(r => liveMap.route(r.position.sessionId, r.position.flightId)
        .then(x => [r.position.flightId, (x.route || []).map(p => [p.latitude, p.longitude]).filter(p => typeof p[0] === 'number' && typeof p[1] === 'number')])
        .catch(() => [r.position.flightId, null])));
      if (req === pathReq.current) {
        setPaths(prev => {
          const next = {};
          for (const [id, pts] of results) next[id] = pts || prev[id] || [];
          return next;
        });
      }
    } catch (err) {
      showToast(err.message || 'Failed to load aircraft positions', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const placed = (rows || []).filter(r => r.position && typeof r.position.latitude === 'number' && typeof r.position.longitude === 'number'
    && (r.position.latitude !== 0 || r.position.longitude !== 0));
  const unplaced = (rows || []).filter(r => !placed.includes(r));
  const isLive = r => r.position.stale === false;
  const flying = placed.filter(r => isLive(r) && (r.position.speed || 0) > 40);
  const selected = placed.find(r => r.aircraft.id === selectedId) || null;
  const typeOf = r => typeNames[r.aircraft.aircraftId] || '';

  const onFlight = placed.filter(r => isLive(r) && r.position.flightId);
  const lines = new Map();
  for (const r of onFlight) {
    const pts = paths[r.position.flightId] || [];
    if (pts.length) lines.set(r.aircraft.id, unwrap([...pts, [r.position.latitude, r.position.longitude]], DEFAULT_CENTER[1]));
  }
  const markerAt = r => {
    const line = lines.get(r.aircraft.id);
    return line ? line[line.length - 1] : [r.position.latitude, near(r.position.longitude, DEFAULT_CENTER[1])];
  };

  const statusText = r => {
    const p = r.position;
    if (!isLive(r)) return p.updatedAt ? `Last seen ${zWhen(Date.parse(p.updatedAt))}` : 'Last known position';
    if ((p.speed || 0) <= 40) return 'On the ground';
    return `${Math.round(p.altitude || 0).toLocaleString()} ft, ${Math.round(p.speed || 0)} kts`;
  };

  return (
    <div className="lv">
      <style>{LIVE_CSS}{MAP_CSS}</style>
      <div className="lv-bar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.9rem' }}>
          <strong>{flying.length}</strong> <span className="lv-muted">flying</span>
          <span style={{ marginLeft: '1.25rem' }}><strong>{placed.length - flying.length}</strong> <span className="lv-muted">on the ground or last seen</span></span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem' }} className="lv-muted">
          {updatedAt && <span>Updated {updatedAt.toISOString().slice(11, 16).replace(':', '')}Z</span>}
          <button onClick={load} disabled={loading} className="lv-btn" style={{ padding: '0.4rem 0.55rem' }} aria-label="Refresh"><RefreshCw size={15} /></button>
        </span>
      </div>

      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-color)', height: 520, marginBottom: '1rem' }}>
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} minZoom={2} maxZoom={18} style={{ height: '100%', width: '100%' }} zoomControl={false} className="if-map">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors"
            maxZoom={18}
          />

          {onFlight.map(r => {
            const line = lines.get(r.aircraft.id);
            if (!line) return null;
            const isSel = r.aircraft.id === selectedId;
            return (
              <Polyline key={r.aircraft.id} positions={line}
                pathOptions={{ color: isSel ? '#0f3d2a' : LIVE_COLOUR, weight: isSel ? 3 : 2, opacity: isSel ? 0.95 : 0.55 }} />
            );
          })}

          {placed.map(r => {
            const isSel = selectedId === r.aircraft.id;
            return (
              <Marker
                key={r.aircraft.id}
                position={markerAt(r)}
                icon={planeIcon(r.position.heading, typeOf(r), { live: isLive(r), selected: isSel })}
                zIndexOffset={isSel ? 1000 : isLive(r) ? 500 : 0}
                eventHandlers={{ click: () => setSelectedId(isSel ? null : r.aircraft.id) }}
              >
                <Tooltip direction="top" offset={[0, -14]} opacity={1} className="if-tip">
                  <div><strong className="lv-mono">{r.aircraft.registration}</strong> <span style={{ color: '#6b6b63' }}>{splitType(typeOf(r)).model}</span></div>
                  <div style={{ color: isLive(r) ? LIVE_COLOUR : '#6b6b63', fontWeight: 600 }}>{statusText(r)}</div>
                  {r.position.lastPilotUsername && <div style={{ color: '#6b6b63' }}>{r.position.lastPilotUsername}{r.position.callsign ? `, ${r.position.callsign}` : ''}</div>}
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>

        {loading && !rows && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 600, background: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', color: '#6b6b63' }}>
            Loading positions…
          </div>
        )}

        {selected && (
          <div className="fm-card">
            {fleetImages?.[selected.aircraft.aircraftId] && <img src={fleetImages[selected.aircraft.aircraftId]} alt="" />}
            <div style={{ minWidth: 0 }}>
              <div>
                <strong className="lv-mono" style={{ fontSize: '1rem' }}>{selected.aircraft.registration}</strong>
                <span style={{ color: '#6b6b63', fontSize: '0.82rem', marginLeft: '0.5rem' }}>{typeOf(selected)}</span>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <span style={{ color: isLive(selected) ? LIVE_COLOUR : '#6b6b63', fontWeight: 600 }}>{statusText(selected)}</span>
                {selected.position.lastPilotUsername && <span style={{ color: '#6b6b63' }}>, {selected.position.lastPilotUsername}</span>}
                {selected.position.callsign && <span style={{ color: '#6b6b63' }}> ({selected.position.callsign})</span>}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} className="lv-link" style={{ marginLeft: '0.5rem', color: '#6b6b63' }}>Close</button>
          </div>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="fm-idle">
          <span>No position yet:</span>
          {unplaced.map(r => <span key={r.aircraft.id}><strong className="lv-mono" style={{ color: 'var(--text-primary)' }}>{r.aircraft.registration}</strong> {splitType(typeOf(r)).model}</span>)}
        </div>
      )}
    </div>
  );
}

export default IFLiveMap;
