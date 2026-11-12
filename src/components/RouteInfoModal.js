/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getAirport } from '../services/airportService';
import { flights as flightsApi } from '../api/client';
import { colors as BRAND } from '../brand';

const ICAO_FLAG = {
  Y:'AU', N:'US', K:'US', P:'US', C:'CA', E:'GB', EG:'GB', EI:'IE', EK:'DK', EL:'LU',
  EN:'NO', EP:'PL', ES:'SE', ET:'DE', EV:'LV', EY:'LT', EZ:'EE', EB:'BE', ED:'DE', EH:'NL',
  LF:'FR', LI:'IT', LE:'ES', LP:'PT', LK:'CZ', LZ:'SK', LH:'HU', LB:'BG', LR:'RO',
  LO:'AT', LM:'MT', LS:'CH', LG:'GR', LW:'MK', LD:'HR', LJ:'SI', LY:'RS', LQ:'BA',
  UB:'AZ', UC:'KG', UD:'AM', UG:'GE', UK:'UA', UM:'BY', UT:'TJ', UU:'RU', UW:'RU',
  UL:'RU', UE:'RU', UI:'RU', UN:'RU', UO:'RU', UH:'RU', UA:'KZ', UZ:'UZ',
  Z:'CN', R:'JP', RK:'KR', VH:'AU', VT:'TH', VV:'VN', VN:'NP', VD:'KH', VL:'LA',
  VY:'MM', VM:'MO', VR:'TL', VB:'BN', WA:'ID', WI:'ID', WQ:'ID', WR:'ID',
  WM:'MY', WS:'SG', RP:'PH', PK:'PW', PG:'GU', PH:'US',
  O:'IR', OA:'AF', OI:'IR', OJ:'JO', OK:'KW', OL:'LB', OO:'SA', OP:'PK', OR:'IQ',
  OS:'SY', OT:'QA', OY:'YE',
  H:'AF', HA:'ET', HB:'ER', HC:'SO', HD:'DJ', HE:'EG', HH:'ET', HK:'KE', HL:'LY',
  HT:'TZ', HU:'UG', HV:'TZ', DA:'DZ', DB:'BJ', DF:'BF', DG:'GH', DI:'CI', DN:'NG',
  DR:'NE', DT:'TN', DX:'TG', FA:'ZA', FB:'BW', FC:'CG', FD:'SZ', FE:'CF', FG:'GQ',
  FK:'CM', FL:'ZM', FM:'MG', FN:'AO', FO:'GA', FQ:'MZ', FS:'SC', FT:'TD', FV:'ZW',
  FW:'MW', FX:'LS', FY:'NA', FZ:'CD', GA:'ML', GC:'ES', GF:'SL', GG:'GW', GL:'LR',
  GM:'MA', GO:'SN', GQ:'MR', GV:'CV', MB:'TC', MD:'DO', MG:'GT', MH:'HN', MK:'KY',
  MM:'MX', MN:'NI', MP:'PA', MR:'CR', MS:'SV', MT:'HT', MU:'CU', MW:'KY', MY:'BS',
  MZ:'BZ', SB:'BR', SC:'CL', SE:'EC', SG:'PY', SK:'CO', SL:'BO', SM:'SR', SO:'GY',
  SP:'PE', SU:'UY', SV:'VE', SW:'BR', TB:'BB', TD:'GD', TF:'GP', TG:'MQ', TI:'VI',
  TJ:'PR', TK:'KN', TL:'LC', TN:'AN', TQ:'AG', TV:'VC', TX:'BM', AG:'SB', AN:'NR',
  AY:'PG', NS:'WS', NF:'FJ', NZ:'NZ', BG:'GL', BI:'IS', EF:'FI',
  VG:'BD', VE:'IN', VI:'IN', VO:'IN', VA:'IN', VQ:'MV',
};

function getCC(icao) {
  if (!icao) return null;
  const c = icao.toUpperCase();
  return ICAO_FLAG[c.slice(0,2)] || ICAO_FLAG[c.slice(0,1)] || null;
}

function greatCirclePoints(lat1, lng1, lat2, lng2, steps = 80) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lng1), φ2 = toRad(lat2), λ2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2));
  if (d === 0) return [[lat1, lng1]];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const f = i / steps;
    const A = Math.sin((1-f)*d)/Math.sin(d), B = Math.sin(f*d)/Math.sin(d);
    const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
    const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
    const z = A*Math.sin(φ1) + B*Math.sin(φ2);
    return [toDeg(Math.atan2(z, Math.sqrt(x*x+y*y))), toDeg(Math.atan2(y, x))];
  });
}

function fmtMins(mins) {
  if (!mins) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function fmtHours(h) {
  if (!h) return '—';
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}
function rawHours(f) {
  const mult = f.multiplier_value && f.multiplier_value > 1 ? f.multiplier_value : 1;
  return (f.flight_time || 0) / mult;
}
function parseAircraft(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
  const s = String(raw);
  try { if (s.startsWith('[')) { const p = JSON.parse(s); return (Array.isArray(p) ? p : [p]).flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean); } } catch {}
  return s.split('|').map(v => v.trim()).filter(Boolean);
}

function FlagCircle({ icao, size = 20 }) {
  const cc = getCC(icao);
  if (!cc) return null;
  return (
    <img src={`https://flagcdn.com/w40/${cc.toLowerCase()}.png`} alt={cc}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
  );
}

export default function RouteInfoModal({ route, onClose, fleetImageMap = {} }) {
  const [dep, setDep] = useState(null);
  const [arr, setArr] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [pireps, setPireps] = useState([]);
  const [pirepsLoading, setPirepsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAirport(route.departure_icao), getAirport(route.arrival_icao)])
      .then(([d, a]) => { setDep(d); setArr(a); setTimeout(() => setMapReady(true), 50); });
    flightsApi.byRoute(route.departure_icao, route.arrival_icao)
      .then(data => setPireps(data.flights || []))
      .catch(() => setPireps([]))
      .finally(() => setPirepsLoading(false));
  }, [route.departure_icao, route.arrival_icao]);

  const aircraft = parseAircraft(route.aircraft);
  const imageUrl = (() => {
    for (const n of aircraft) if (fleetImageMap[n]) return fleetImageMap[n];
    for (const n of aircraft) {
      const t = n.includes(' - ') ? n.split(' - ')[0].trim().toLowerCase() : n.toLowerCase();
      const m = Object.keys(fleetImageMap).find(k => k.toLowerCase().startsWith(t));
      if (m) return fleetImageMap[m];
    }
    return null;
  })();

  const arc = dep && arr ? greatCirclePoints(dep.lat, dep.lng, arr.lat, arr.lng) : null;
  const center = dep && arr ? [(dep.lat + arr.lat) / 2, (dep.lng + arr.lng) / 2] : [0, 0];
  const avgRaw = pireps.length > 0 ? pireps.reduce((s, f) => s + rawHours(f), 0) / pireps.length : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', borderRadius: 14, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>

        {/* Hero: aircraft image + route overlay */}
        <div style={{ position: 'relative', height: 240, background: '#0a0e12', flexShrink: 0, overflow: 'hidden' }}>
          {imageUrl && (
            <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.65 }}
              onError={e => e.target.style.display = 'none'} />
          )}
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.85) 100%)' }} />

          {/* Close */}
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.8)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          {/* Flight number top-left */}
          <div style={{ position: 'absolute', top: 14, left: 18, zIndex: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.35)', padding: '3px 10px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
              {route.flight_number}
            </span>
          </div>

          {/* Route ICAO overlay at bottom */}
          <div style={{ position: 'absolute', bottom: 18, left: 20, right: 20, zIndex: 10, display: 'grid', gridTemplateColumns: '1fr 48px 1fr', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <FlagCircle icao={route.departure_icao} />
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, fontFamily: 'monospace', color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>{route.departure_icao}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{dep?.city || dep?.name || ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.2)' }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'flex-end' }}>
                <FlagCircle icao={route.arrival_icao} />
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, fontFamily: 'monospace', color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>{route.arrival_icao}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{arr?.city || arr?.name || ''}</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          {[
            { label: 'Distance',  value: route.distance_nm ? `${route.distance_nm.toLocaleString()} nm` : '—' },
            { label: 'Scheduled', value: fmtMins(route.duration) },
            { label: 'Avg actual', value: avgRaw ? fmtHours(avgRaw) : pirepsLoading ? '…' : 'No data' },
          ].map(({ label, value }, i) => (
            <div key={label} style={{ padding: '0.85rem 1.25rem', borderRight: i < 2 ? '1px solid var(--border-color)' : 'none' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Map + PIREPs */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* Map */}
          <div style={{ height: 200, background: '#0f172a', position: 'relative', flexShrink: 0 }}>
            {mapReady && arc ? (
              <MapContainer center={center} zoom={3} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="rim-dark-tiles" />
                <Polyline positions={arc} pathOptions={{ color: BRAND.primary, weight: 2.5, opacity: 1 }} />
                {dep && <CircleMarker center={[dep.lat, dep.lng]} radius={5} pathOptions={{ color: '#fff', fillColor: BRAND.primary, fillOpacity: 1, weight: 2 }}>
                  <Tooltip permanent direction="top" offset={[0, -8]} className="rim-tt">{route.departure_icao}</Tooltip>
                </CircleMarker>}
                {arr && <CircleMarker center={[arr.lat, arr.lng]} radius={5} pathOptions={{ color: '#fff', fillColor: BRAND.accent, fillOpacity: 1, weight: 2 }}>
                  <Tooltip permanent direction="top" offset={[0, -8]} className="rim-tt">{route.arrival_icao}</Tooltip>
                </CircleMarker>}
              </MapContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 24, height: 24, border: '2px solid #333', borderTop: '2px solid var(--brand-primary)', borderRadius: '50%', animation: 'rim-spin 0.8s linear infinite' }} />
              </div>
            )}
          </div>

          {/* PIREPs table */}
          <div style={{ borderTop: '1px solid var(--border-color)' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Recent PIREPs on this route</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>last 30 days
              </span>
            </div>

            {pirepsLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading…</div>
            ) : pireps.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No approved PIREPs on this route in the last 30 days.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Aircraft', 'Flight time', 'Date'].map((h, i) => (
                      <th key={h} style={{ padding: '0.55rem 1.25rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 0 ? 'left' : 'right', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pireps.map((f, i) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border-color)', background: i % 2 === 1 ? 'var(--bg-secondary)' : 'transparent' }}>
                      <td style={{ padding: '0.65rem 1.25rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>{f.aircraft || '—'}</td>
                      <td style={{ padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', textAlign: 'right' }}>{fmtHours(rawHours(f))}</td>
                      <td style={{ padding: '0.65rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {new Date(f.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .rim-tt { background: rgba(0,0,0,0.8) !important; border: none !important; color: #fff !important; font-size: 11px !important; font-weight: 700 !important; font-family: monospace !important; padding: 2px 6px !important; border-radius: 4px !important; box-shadow: none !important; }
        .rim-tt::before { display: none !important; }
        @keyframes rim-spin { to { transform: rotate(360deg); } }
        .rim-dark-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92) saturate(0.7); }
      `}</style>
    </div>
  );
}
