/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ifLiveStats } from '../../../api/client';
import { LIVE_CSS } from './liveData';

// Same Esri grey canvas as the live map (src/pages/LiveMap.js)
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILES = {
  light: { base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  dark:  { base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,  labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
};
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
const ROUTE_COLOUR = 'var(--brand-primary)';
const AIRPORT_COLOUR = 'var(--brand-accent)';

const STATS_CSS = `
.st-strip { display: flex; flex-wrap: wrap; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 1.25rem; }
.st-fig { flex: 1 1 120px; padding: 0.85rem 1.1rem; border-left: 1px solid var(--border-color); min-width: 0; }
.st-fig:first-child { border-left: none; }
.st-fig b { display: block; font-size: 1.45rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.st-fig span { font-size: 0.78rem; color: var(--text-secondary); }
.st-map { height: 440px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); margin-bottom: 1.25rem; }
.st-map .leaflet-container { height: 100%; width: 100%; background: var(--bg-hover); }
.st-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 1.25rem; }
.st-grid .lv-panel { margin-bottom: 0; padding: 1rem 1.15rem 0.6rem; }
.st-row { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr) auto; gap: 0.6rem; align-items: baseline; padding: 0.55rem 0; border-top: 1px solid var(--border-color); font-size: 0.875rem; }
.st-row:first-of-type { border-top: none; }
.st-rank { font-weight: 700; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.st-row:first-of-type .st-rank { color: var(--brand-accent); }
.st-main { min-width: 0; }
.st-main b { font-weight: 700; }
.st-main span { display: block; font-size: 0.78rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-val { font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.st-val small { font-weight: 500; color: var(--text-secondary); }
.st-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem; }
@media (max-width: 600px) { .st-fig { flex-basis: 45%; border-left: none; border-top: 1px solid var(--border-color); } .st-fig:nth-child(-n+2) { border-top: none; } .st-map { height: 320px; } }
`;

const isDark = () => document.body.classList.contains('dark-mode');
function useDarkMode() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const shiftLng = lng => (lng < -30 ? lng + 360 : lng);

// Points along the great circle between two airports, for a curved line
function greatCircle(a, b, steps = 48) {
  const rad = d => (d * Math.PI) / 180;
  const deg = r => (r * 180) / Math.PI;
  const [lat1, lng1, lat2, lng2] = [rad(a.lat), rad(a.lng), rad(b.lat), rad(b.lng)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2));
  if (!d) return [[a.lat, shiftLng(a.lng)], [b.lat, shiftLng(b.lng)]];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), shiftLng(deg(Math.atan2(y, x)))]);
  }
  // keep the line continuous where it crosses the -30° seam
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][1] - pts[i - 1][1] > 180) pts[i][1] -= 360;
    while (pts[i][1] - pts[i - 1][1] < -180) pts[i][1] += 360;
  }
  return pts;
}

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 5 });
  }, [map, points]);
  return null;
}

function RouteMap({ airports, routes }) {
  const dark = useDarkMode();
  const tiles = dark ? TILES.dark : TILES.light;
  const byIcao = useMemo(() => Object.fromEntries(airports.map(a => [a.icao, a])), [airports]);
  const maxFlights = Math.max(1, ...routes.map(r => r.flights));
  const maxVisits = Math.max(1, ...airports.map(a => a.visits));
  const lines = useMemo(() => routes
    .filter(r => byIcao[r.from] && byIcao[r.to] && r.from !== r.to)
    .map(r => ({ ...r, points: greatCircle(byIcao[r.from], byIcao[r.to]) })), [routes, byIcao]);
  const bounds = useMemo(() => airports.map(a => [a.lat, shiftLng(a.lng)]), [airports]);

  return (
    <div className="st-map">
      <MapContainer center={[-25, 150]} zoom={3} minZoom={2} scrollWheelZoom={false} attributionControl>
        <TileLayer key={`base-${dark}`} url={tiles.base} attribution={ATTRIBUTION} maxZoom={16} />
        <TileLayer key={`labels-${dark}`} url={tiles.labels} maxZoom={16} />
        <FitTo points={bounds} />
        {lines.map(r => (
          <Polyline key={`${r.from}-${r.to}`} positions={r.points}
            pathOptions={{ color: ROUTE_COLOUR, weight: 1.5 + 3.5 * (r.flights / maxFlights), opacity: 0.35 + 0.5 * (r.flights / maxFlights) }}>
            <Tooltip sticky>{r.from}-{r.to}, {r.flights} {r.flights === 1 ? 'flight' : 'flights'}</Tooltip>
          </Polyline>
        ))}
        {airports.map(a => (
          <CircleMarker key={a.icao} center={[a.lat, shiftLng(a.lng)]} radius={3 + 7 * Math.sqrt(a.visits / maxVisits)}
            pathOptions={{ color: '#fff', weight: 1.5, fillColor: AIRPORT_COLOUR, fillOpacity: 0.95 }}>
            <Tooltip>{a.icao}{a.city ? ` ${a.city}` : ''}, {a.visits} {a.visits === 1 ? 'visit' : 'visits'}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function TopList({ title, rows, action }) {
  return (
    <section className="lv-panel">
      <div className="st-head"><h3 className="lv-h">{title}</h3>{action}</div>
      {rows.length === 0 ? <p className="lv-sub" style={{ paddingBottom: '0.6rem' }}>Nothing yet.</p> : rows.map((r, i) => (
        <div key={r.key} className="st-row">
          <span className="st-rank">{i + 1}</span>
          <span className="st-main"><b className={r.mono ? 'lv-mono' : undefined}>{r.title}</b>{r.sub && <span>{r.sub}</span>}</span>
          <span className="st-val">{r.value}</span>
        </div>
      ))}
    </section>
  );
}

const shortDate = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null);

export default function IFLiveStatsTab({ onNavigate = () => {} }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ifLiveStats.overview().then(setData).catch(err => setError(err.message || "Couldn't load the stats"));
  }, []);

  if (error) return <div className="lv"><style>{LIVE_CSS}</style><div className="lv-note is-bad">{error}</div></div>;
  if (!data) return <div className="lv"><style>{LIVE_CSS}</style><p className="lv-sub">Loading the stats…</p></div>;
  const { totals } = data;
  const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

  return (
    <div className="lv">
      <style>{LIVE_CSS}{STATS_CSS}</style>

      <div className="st-strip">
        <div className="st-fig"><b>{totals.flights.toLocaleString()}</b><span>flights</span></div>
        <div className="st-fig"><b>{totals.hours.toLocaleString()}h</b><span>flown</span></div>
        <div className="st-fig"><b>{totals.pilots}</b><span>pilots</span></div>
        <div className="st-fig"><b>{totals.aircraft}</b><span>aircraft used</span></div>
        <div className="st-fig"><b>{totals.airports}</b><span>airports</span></div>
        <div className="st-fig"><b>{totals.avgFpm != null ? `${totals.avgFpm} fpm` : '—'}</b><span>avg touchdown</span></div>
      </div>

      {data.routes.length > 0 && <RouteMap airports={data.airports} routes={data.routes} />}

      <div className="st-grid">
        <TopList title="Top aircraft" rows={data.topAircraft.map(a => ({
          key: a.registration, title: a.registration, mono: true, sub: a.type, value: <>{a.hours}h <small>| {plural(a.flights, 'flight')}</small></>,
        }))} />
        <TopList title="Top pilots" action={<button className="lv-link" onClick={() => onNavigate('pilots')}>Full leaderboard</button>}
          rows={data.topPilots.map(p => ({
            key: `${p.callsign}-${p.name}`, title: p.name, sub: p.callsign, value: <>{p.hours}h <small>| {plural(p.flights, 'flight')}</small></>,
          }))} />
        <TopList title="Top routes" rows={data.topRoutes.map(r => ({
          key: `${r.from}-${r.to}`, title: `${r.from} → ${r.to}`, mono: true, value: plural(r.flights, 'flight'),
        }))} />
        <TopList title="Busiest airports" rows={data.topAirports.map(a => ({
          key: a.icao, title: a.icao, mono: true, sub: a.city, value: plural(a.visits, 'visit'),
        }))} />
        <TopList title="Smoothest landings" rows={data.smoothest.map((l, i) => ({
          key: `${l.registration}-${l.date}-${i}`, title: l.pilot,
          sub: [l.airport, l.registration, shortDate(l.date)].filter(Boolean).join(' | '),
          value: <>{l.fpm} fpm{l.g ? <small> | {l.g.toFixed(2)} g</small> : null}</>,
        }))} />
      </div>
    </div>
  );
}
