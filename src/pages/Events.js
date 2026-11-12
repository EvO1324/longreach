/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Plane, MapPin, Users, ArrowLeft, Settings2 } from 'lucide-react';
import { events as eventsApi } from '../api/client';
import { showToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import Loader from '../components/Loader';
import { splitAircraft } from '../components/AircraftLabel';
import UserAvatar from '../components/UserAvatar';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors as BRAND } from '../brand';

const zulu = d => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;

export function fmtWhen(startIso, endIso) {
  if (!startIso) return '';
  const s = new Date(startIso);
  const day = s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const end = endIso ? new Date(endIso) : null;
  const endTime = end ? ` to ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  return `${day}, ${time}${endTime} (${zulu(s)}${end ? `–${zulu(end)}` : ''})`;
}

const isPast = ev => new Date(ev.end_at || new Date(ev.start_at).getTime() + 12 * 3600 * 1000) < new Date();

function Chip({ children, tone = 'muted' }) {
  const tones = {
    muted: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' },
    gold:  { bg: 'var(--avg-gold-pale)', color: 'var(--avg-gold-dark)' },
    green: { bg: 'var(--avg-green-pale)', color: 'var(--avg-green)' },
    red:   { bg: 'rgba(198,40,40,0.1)', color: '#c62828' },
  }[tone];
  return <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 6, background: tones.bg, color: tones.color, whiteSpace: 'nowrap' }}>{children}</span>;
}

// List

function EventCard({ ev }) {
  const gates = ev.gates?.length || 0;
  return (
    <Link to={`/events?id=${ev.id}`} className="card" style={{ display: 'block', padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ height: 130, background: 'linear-gradient(135deg, var(--avg-green-dark), var(--avg-green))', position: 'relative' }}>
        {ev.header_image && <img src={ev.header_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
          {ev.multiplier > 1 && <Chip tone="gold">×{ev.multiplier}</Chip>}
          {ev.myRegistration && <Chip tone="green">Signed up{ev.myRegistration.gate ? ` · ${ev.myRegistration.gate}` : ''}</Chip>}
          {ev.status === 'cancelled' && <Chip tone="red">Cancelled</Chip>}
          {ev.status === 'draft' && <Chip>Draft</Chip>}
        </div>
      </div>
      <div style={{ padding: '0.9rem 1rem 1rem' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.3rem' }}>{ev.title}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'grid', gap: '0.2rem' }}>
          <span><CalendarDays size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{fmtWhen(ev.start_at, ev.end_at)}</span>
          <span><MapPin size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{ev.departure_icao} → {ev.arrival_icao}{ev.flight_number ? ` · ${ev.flight_number}` : ''}</span>
          <span><Users size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{ev.registrationCount} signed up{gates ? ` · ${gates - (ev.takenGates?.length || 0)} of ${gates} gates free` : ''}</span>
        </div>
      </div>
    </Link>
  );
}

function EventsList() {
  const [data, setData] = useState(null);
  useEffect(() => {
    eventsApi.list().then(setData).catch(err => { showToast(err.message || 'Failed to load events', 'error'); setData({ events: [] }); });
  }, []);
  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}><Loader size={72} /></div>;
  const upcoming = data.events.filter(e => !isPast(e) && e.status !== 'cancelled').sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const past = data.events.filter(e => isPast(e) || e.status === 'cancelled');
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Events</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>Group flights. Grab a gate, fly together, and log it here.</p>
        </div>
        {data.canManage && <Link to="/admin?tab=events" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Settings2 size={15} />Manage events</Link>}
      </div>
      {upcoming.length ? <div style={grid}>{upcoming.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        : <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>No events coming up. Keep an eye out: new ones pop up here and on Discord.</div>}
      {past.length > 0 && (
        <>
          <h3 style={{ margin: '2rem 0 0.75rem', color: 'var(--text-secondary)' }}>Past events</h3>
          <div style={{ ...grid, opacity: 0.8 }}>{past.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        </>
      )}
    </div>
  );
}

// Detail

// Route map

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILES = {
  light: { base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  dark:  { base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,  labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
};
const isDark = () => document.body.classList.contains('dark-mode');
function useDarkMode() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const o = new MutationObserver(() => setDark(isDark()));
    o.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return dark;
}

// Points along the great circle from a to b ([lat, lng]), and its length in nm
function greatCircle(a, b, n = 64) {
  const R = Math.PI / 180;
  const [l1, o1] = [a[0] * R, a[1] * R], [l2, o2] = [b[0] * R, b[1] * R];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((l2 - l1) / 2) ** 2 + Math.cos(l1) * Math.cos(l2) * Math.sin((o2 - o1) / 2) ** 2));
  if (!d) return { points: [a, b], nm: 0 };
  const points = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(l1) * Math.cos(o1) + B * Math.cos(l2) * Math.cos(o2);
    const y = A * Math.cos(l1) * Math.sin(o1) + B * Math.cos(l2) * Math.sin(o2);
    const z = A * Math.sin(l1) + B * Math.sin(l2);
    points.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / R, Math.atan2(y, x) / R]);
  }
  // Keep the line continuous across the antimeridian
  for (let i = 1; i < points.length; i++) {
    while (points[i][1] - points[i - 1][1] > 180) points[i][1] -= 360;
    while (points[i][1] - points[i - 1][1] < -180) points[i][1] += 360;
  }
  return { points, nm: Math.round(d * 3440.065) };
}

// Same rough block time as Live Mode's estimate (routes/ifLive.js)
const estBlock = nm => {
  const mins = Math.max(45, Math.round((nm / 450) * 60 + 30));
  return `~${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

function FitRoute({ points, padTL }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => map.fitBounds(L.latLngBounds(points), { paddingTopLeft: padTL(), paddingBottomRight: [40, 40], maxZoom: 9 });
    fit();
    map.on('resize', fit);
    return () => { map.off('resize', fit); };
  }, [map, points, padTL]);
  return null;
}

const tag = (html, anchor) => L.divIcon({ className: '', html, iconAnchor: anchor });

// A plane pointing along the pilot's heading, with their initials beside it
const planeIcon = (heading, initials, mine) => L.divIcon({
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div class="ev-plane"><svg width="26" height="26" viewBox="0 0 24 24" style="transform:rotate(${heading}deg)"><path d="M12 2c.6 0 1 .9 1 2v5l8 4.5v2L13 13v5l2.5 2v1.5L12 20.5 8.5 21.5V20L11 18v-5l-8 2.5v-2L11 9V4c0-1.1.4-2 1-2z" fill="${mine ? BRAND.accent : BRAND.primary}" stroke="#fff" stroke-width="1.2"/></svg><span class="ev-plane-tag${mine ? ' mine' : ''}">${initials}</span></div>`,
});
const nearLng = (lng, ref) => { let l = lng; while (l - ref > 180) l -= 360; while (l - ref < -180) l += 360; return l; };
const initialsOf = name => String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function RouteMap({ dep, arr, height, pilots = [], meId = null }) {
  const dark = useDarkMode();
  const route = useMemo(() => greatCircle([dep.lat, dep.lng], [arr.lat, arr.lng]), [dep.lat, dep.lng, arr.lat, arr.lng]);
  const tiles = dark ? TILES.dark : TILES.light;
  const padTL = useCallback(() => (window.innerWidth > 760 ? [420, 50] : [40, 40]), []);
  const mid = route.points[Math.floor(route.points.length / 2)];
  const westward = arr.lng < dep.lng;
  const label = t => `<span class="ev-map-apt">${t}</span>`;
  return (
    <MapContainer className="ev-map" style={{ height }} zoomSnap={0.25} attributionControl
      dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} zoomControl={false}
      bounds={route.points} boundsOptions={{ padding: [40, 40] }}>
      <TileLayer key={`b-${dark}`} url={tiles.base} attribution="Tiles &copy; Esri" maxZoom={16} />
      <TileLayer key={`l-${dark}`} url={tiles.labels} maxZoom={16} />
      <Polyline positions={route.points} pathOptions={{ color: dark ? BRAND.primaryLight : BRAND.primary, weight: 3, dashArray: '2 8', lineCap: 'round' }} />
      {pilots.filter(p => p.status === 'flying' && p.lat != null && p.progress > 0).map(p => {
        const upTo = Math.floor(p.progress * (route.points.length - 1));
        const flown = [...route.points.slice(0, upTo + 1), [p.lat, nearLng(p.lng, route.points[upTo][1])]];
        return <Polyline key={`flown-${p.userId}`} positions={flown} interactive={false}
          pathOptions={{ color: p.userId === meId ? BRAND.accent : (dark ? BRAND.primaryLight : BRAND.primary), weight: 3.5, opacity: 0.95, lineCap: 'round' }} />;
      })}
      <CircleMarker center={[dep.lat, dep.lng]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: BRAND.accent, fillOpacity: 1 }} />
      <CircleMarker center={route.points[route.points.length - 1]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: BRAND.primary, fillOpacity: 1 }} />
      <Marker position={[dep.lat, dep.lng]} icon={tag(label(dep.icao), westward ? [-10, 10] : [52, 10])} interactive={false} />
      <Marker position={route.points[route.points.length - 1]} icon={tag(label(arr.icao), westward ? [52, 10] : [-10, 10])} interactive={false} />
      {route.nm > 0 && <Marker position={mid} icon={tag(`<span class="ev-map-dist">${route.nm.toLocaleString()} nm · ${estBlock(route.nm)}</span>`, [70, 26])} interactive={false} />}
      {pilots.filter(p => p.status === 'flying' && p.lat != null).map(p => (
        <Marker key={p.userId} position={[p.lat, p.lng]} icon={planeIcon(p.heading || 0, initialsOf(p.name), p.userId === meId)} interactive={false} zIndexOffset={1000} />
      ))}
      <FitRoute points={route.points} padTL={padTL} />
    </MapContainer>
  );
}

const EVENT_STYLES = `
.ev-plane { position: relative; width: 26px; height: 26px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)); }
.ev-plane-tag { position: absolute; left: 24px; top: 4px; background: var(--avg-green); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
.ev-plane-tag.mine { background: var(--avg-gold); color: #1c1c1a; }
.ev-bar { height: 5px; border-radius: 3px; background: var(--bg-hover); overflow: hidden; margin-top: 5px; max-width: 160px; }
.ev-bar > span { display: block; height: 100%; background: var(--avg-green); border-radius: 3px; }
.ev-live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--avg-green); margin-right: 6px; box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb),0.18); vertical-align: 1px; }
.ev-hero { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-hover); }
.ev-map { width: 100%; z-index: 0; font-family: inherit; cursor: default; }
.ev-map .leaflet-interactive { cursor: default; }
.ev-title { position: absolute; left: 20px; top: 20px; bottom: 20px; z-index: 500; width: 380px; max-width: calc(100% - 40px); box-shadow: 0 10px 30px rgba(0,0,0,0.14); padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.ev-title-img { flex: 1; min-height: 120px; background: var(--bg-hover) center / cover no-repeat; }
.ev-title-body { padding: 1.1rem 1.3rem 1.25rem; }
.ev-h { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 0.85rem; }
.ev-section + .ev-section { margin-top: 2.25rem; }
.ev-map-apt { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 7px; font: 800 12px monospace; box-shadow: 0 1px 3px rgba(0,0,0,0.12); white-space: nowrap; }
.ev-map-dist { background: var(--avg-green); color: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.ev-who { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 2.5rem; align-items: start; margin-top: 2rem; }
.ev-panel { position: sticky; top: 1rem; display: grid; gap: 0.9rem; }
.ev-stack { display: flex; }
.ev-stack > * + * { margin-left: -10px; }
.ev-stack > * { border: 3px solid var(--bg-secondary); border-radius: 50%; }
.ev-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.ev-table th { text-align: left; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); padding: 0 0.75rem 0.6rem; }
.ev-table td { padding: 0.7rem 0.75rem; border-top: 1px solid var(--border-color); vertical-align: middle; }
.ev-table tr:last-child td { border-bottom: 1px solid var(--border-color); }
.ev-table tr.mine td:first-child { box-shadow: inset 3px 0 0 var(--avg-gold); }
.ev-table tr.mine td { background: var(--avg-gold-pale); }
.ev-take { background: none; border: none; color: var(--avg-green); font: inherit; font-weight: 700; cursor: pointer; padding: 0.25rem 0; white-space: nowrap; }
.ev-take:disabled { color: var(--text-secondary); cursor: default; }
@media (max-width: 1000px) { .ev-who { grid-template-columns: minmax(0, 1fr); } .ev-panel { position: static; } }
@media (max-width: 640px) { .ev-table .ev-hide-sm { display: none; } }
@media (max-width: 760px) { .ev-title { position: static; width: auto; max-width: none; box-shadow: none; border: none; border-top: 1px solid var(--border-color); border-radius: 0; } .ev-title-img { flex: none; height: 150px; } }
`;

// Countdown

const pad2 = n => String(n).padStart(2, '0');

function Countdown({ start, end }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 12 * 3600 * 1000;
  if (now >= e) return null;

  if (now >= s) {
    const left = Math.round((e - now) / 60000);
    return (
      <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', borderColor: 'var(--avg-green)', background: 'var(--avg-green-pale)' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--avg-green)', boxShadow: '0 0 0 4px rgba(var(--brand-primary-rgb),0.18)', flex: 'none' }} />
        <strong style={{ color: 'var(--avg-green)' }}>Happening now</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginLeft: 'auto' }}>{end ? `ends in ${Math.floor(left / 60)}h ${pad2(left % 60)}m` : ''}</span>
      </div>
    );
  }

  let secs = Math.floor((s - now) / 1000);
  const units = [['Weeks', 604800], ['Days', 86400], ['Hours', 3600], ['Mins', 60], ['Secs', 1]].map(([label, size]) => {
    const v = Math.floor(secs / size);
    secs -= v * size;
    return [label, v];
  });
  return (
    <div className="card" style={{ padding: '1rem 1.1rem 1.1rem' }}>
      <div className="ev-h" style={{ marginBottom: '0.7rem' }}>Starts in</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.4rem' }}>
        {units.map(([label, v], i) => (
          <div key={label} style={{ textAlign: 'center', padding: '0.55rem 0 0.45rem', borderRadius: 8, background: 'var(--bg-secondary)', opacity: i === 0 && v === 0 ? 0.45 : 1 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.35rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{i < 2 ? v : pad2(v)}</div>
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Detail

// "2h ago", "3d ago"
function timeAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// "Alex", "Alex and Zac", "Alex, Zac and Luke", "Alex, Zac and 4 others"
function namesLine(regs) {
  const n = regs.map(r => (r.isMe ? 'You' : r.user?.first_name || r.user?.name || 'Pilot'));
  if (n.length <= 1) return n.join('');
  if (n.length <= 3) return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  return `${n.slice(0, 2).join(', ')} and ${n.length - 2} others`;
}

function EventDetail({ id }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);

  const load = useCallback(() => {
    eventsApi.get(id).then(d => { setData(d); setError(''); }).catch(err => setError(err.message || 'Event not found'));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const [live, setLive] = useState(null);
  const liveWindow = data?.event && data.event.status === 'published' && (() => {
    const s = new Date(data.event.start_at).getTime();
    const e = data.event.end_at ? new Date(data.event.end_at).getTime() : s + 12 * 3600 * 1000;
    return Date.now() >= s - 2 * 3600 * 1000 && Date.now() <= e + 2 * 3600 * 1000;
  })();
  useEffect(() => {
    if (!liveWindow) { setLive(null); return undefined; }
    let stop = false;
    const tick = () => eventsApi.live(id).then(d => { if (!stop) setLive(d); }).catch(() => {});
    tick();
    const t = setInterval(tick, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [id, liveWindow]);

  const ev = data?.event;
  const byGate = useMemo(() => Object.fromEntries((ev?.registrations || []).filter(r => r.gate).map(r => [r.gate, r])), [ev]);

  if (error) return <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}><p>{error}</p><Link to="/events">Back to events</Link></div>;
  if (!ev) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}><Loader size={72} /></div>;

  const mine = ev.myRegistration;
  const finished = isPast(ev);
  const canSignUp = ev.status === 'published' && !finished;
  const hasGates = ev.gates.length > 0;
  const freeGates = ev.gates.length - ev.takenGates.length;
  const { type, airline } = splitAircraft({ aircraft: ev.aircraft });
  const hasMap = ev.departure?.lat != null && ev.arrival?.lat != null;
  const regs = ev.registrations;
  // Signed up without one of the current gates (no gates, or a gate since renamed)
  const noGate = regs.filter(r => !hasGates || !r.gate || !ev.gates.includes(r.gate));
  const muted = { color: 'var(--text-secondary)' };
  const canTake = canSignUp && !ev.myFlight && !busy;
  const me = regs.find(r => r.isMe)?.user?.id || null;
  const liveOn = !!live?.active;
  const liveBy = Object.fromEntries((live?.pilots || []).map(p => [p.userId, p]));
  const flyingNow = (live?.pilots || []).filter(p => p.status === 'flying').length;
  const level = a => (a >= 10000 ? `FL${Math.round(a / 100)}` : `${a.toLocaleString()} ft`);
  const landedAt = r => liveBy[r?.user?.id]?.landedAt || r?.landed_at || null;
  const landedTag = r => {
    const at = landedAt(r);
    if (!at) return null;
    const d = new Date(at);
    return <span title={`Landed ${d.toLocaleString()}`} style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 5, background: 'var(--avg-green-pale)', color: 'var(--avg-green)', whiteSpace: 'nowrap' }}>✓ Landed {String(d.getUTCHours()).padStart(2, '0')}{String(d.getUTCMinutes()).padStart(2, '0')}Z</span>;
  };
  const landedCount = regs.filter(r => landedAt(r)).length;
  const statusCell = userId => {
    const p = liveBy[userId];
    if (p?.status === 'landed') return <span style={{ color: 'var(--avg-green)', fontWeight: 700 }}>Landed</span>;
    if (!p) return <span style={muted}>Not flying</span>;
    if (p.status === 'no_plan') return <span style={muted}>No flight plan filed</span>;
    const pct = p.progress != null ? Math.round(p.progress * 100) : null;
    const air = p.phase !== 'At gate' && p.phase !== 'Taxiing' && p.phase !== 'Landed' && p.phase !== 'Taxiing in';
    return (
      <div>
        <div style={{ fontWeight: 600 }}><span className="ev-live-dot" />{p.phase}{pct != null && air ? ` · ${pct}%` : ''}</div>
        <div style={{ ...muted, fontSize: '0.8rem' }}>{air ? `${level(p.altitude)} · ${p.speed} kts · ${p.toGoNm} nm to go` : p.speed > 2 ? `${p.speed} kts` : ''}</div>
        {pct != null && <div className="ev-bar"><span style={{ width: `${pct}%` }} /></div>}
      </div>
    );
  };

  const register = async gate => {
    setBusy(true);
    try {
      await eventsApi.register(ev.id, gate);
      showToast(mine ? `Moved to gate ${gate}` : `Signed up${gate ? ` at gate ${gate}` : ''}`, 'success');
      load();
    } catch (err) { showToast(err.message || 'Failed to sign up', 'error'); load(); }
    finally { setBusy(false); }
  };
  const dropOut = async () => {
    setBusy(true);
    try { await eventsApi.deregister(ev.id); showToast("You've dropped out", 'success'); load(); }
    catch (err) { showToast(err.message || 'Failed to drop out', 'error'); }
    finally { setBusy(false); }
  };

  const titleCard = (
    <div className="card ev-title">
      {ev.header_image
        ? <div className="ev-title-img" role="img" aria-label="" style={{ backgroundImage: `url("${ev.header_image}")` }} />
        : <div className="ev-title-img" style={{ background: 'linear-gradient(135deg, var(--avg-green-dark), var(--avg-green))' }} />}
      <div className="ev-title-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {ev.multiplier > 1 && <Chip tone="gold">×{ev.multiplier} hours</Chip>}
          {ev.status === 'cancelled' && <Chip tone="red">Cancelled</Chip>}
          {ev.status === 'draft' && <Chip>Draft, only staff can see this</Chip>}
          {finished && ev.status === 'published' && <Chip>Finished</Chip>}
        </div>
        <h1 style={{ margin: 0, fontSize: '1.75rem', lineHeight: 1.12, letterSpacing: '-0.01em' }}>{ev.title}</h1>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem', display: 'grid', gap: 2 }}>
          <span>{fmtWhen(ev.start_at, ev.end_at)}</span>
          <span>{ev.flight_number ? `${ev.flight_number} · ` : ''}{ev.departure?.city || ev.departure_icao} → {ev.arrival?.city || ev.arrival_icao}</span>
        </div>
      </div>
    </div>
  );

  const apt = (a, icao, align) => (
    <div style={{ textAlign: align }}>
      <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>{icao}</div>
      <div style={{ ...muted, fontSize: '0.8rem', marginTop: 3 }}>{a?.city || ''}</div>
    </div>
  );

  // The ticket on the right: the flight, then where you stand and what you can do
  const ticket = (
    <div className="card" style={{ display: 'grid', gap: '0.9rem', padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{ev.flight_number || 'Event flight'}</strong>
        {ev.multiplier > 1 && <Chip tone="gold">×{ev.multiplier} hours</Chip>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
        {apt(ev.departure, ev.departure_icao, 'left')}
        <Plane size={16} style={{ color: 'var(--avg-green)', marginBottom: 8, flex: 'none' }} />
        {apt(ev.arrival, ev.arrival_icao, 'right')}
      </div>
      <div style={{ ...muted, fontSize: '0.85rem' }}>{type || ev.aircraft}{airline ? ` · ${airline}` : ''}</div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.9rem', display: 'grid', gap: '0.75rem' }}>
        {mine ? (
          <>
            <div style={{ fontWeight: 700 }}>
              {mine.gate ? <>You're at gate <span style={{ fontFamily: 'monospace', color: 'var(--avg-green)' }}>{mine.gate}</span></> : "You're going"}
            </div>
            {ev.myFlight ? (
              <div style={{ fontSize: '0.88rem' }}>
                Logged {new Date(ev.myFlight.date).toLocaleDateString()} · <Chip tone={ev.myFlight.status === 'approved' ? 'green' : 'gold'}>{ev.myFlight.status === 'approved' ? 'Approved' : 'Waiting on review'}</Chip>{' '}
                <Link to="/logbook" style={{ marginLeft: 4 }}>Logbook</Link>
              </div>
            ) : ev.filing.open ? (
              <>
                <div style={{ ...muted, fontSize: '0.85rem' }}>Landed? Log it from File PIREP: your event shows there with a Log event button{ev.multiplier > 1 ? `, and the ×${ev.multiplier} is applied for you` : ''}.</div>
                <Link to="/log-flight" className="btn btn-primary" style={{ textAlign: 'center' }}>File PIREP</Link>
              </>
            ) : (
              <div style={{ ...muted, fontSize: '0.85rem' }}>
                {ev.filing.reason}{ev.filing.opensAt && !finished ? ` That's ${new Date(ev.filing.opensAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : ''}
              </div>
            )}
            {!ev.myFlight && <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDrop(true)}>Drop out</button>}
          </>
        ) : !canSignUp ? (
          <div style={muted}>{ev.status === 'cancelled' ? 'This event was cancelled.' : 'Sign-ups have closed.'}</div>
        ) : hasGates ? (
          <div style={{ ...muted, fontSize: '0.88rem' }}>{freeGates ? 'Take an open gate to sign up.' : 'Every gate is taken.'}</div>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => register('')}>Sign up</button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <style>{EVENT_STYLES}</style>
      <button onClick={() => navigate('/events')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: '0.9rem', fontFamily: 'inherit', fontSize: '0.88rem' }}><ArrowLeft size={15} />All events</button>

      <div className="ev-hero">
        {hasMap ? <RouteMap dep={ev.departure} arr={ev.arrival} height={400} pilots={live?.pilots || []} meId={me} /> : <div style={{ height: 160 }} />}
        {titleCard}
      </div>

      <div className="ev-who">
        <div>
          {/* Who's going */}
          <div className="ev-section">
          <div className="ev-h">Who's going{liveOn && flyingNow > 0 && <span style={{ color: 'var(--avg-green)', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}><span className="ev-live-dot" />{flyingNow} flying now</span>}{landedCount > 0 && <span style={{ color: 'var(--avg-green)', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>✓ {landedCount} landed</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            {regs.length > 0 && (
              <div className="ev-stack">
                {regs.slice(0, 6).map(r => <UserAvatar key={r.id} user={r.user} size={40} fontSize="0.9rem" />)}
                {regs.length > 6 && <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>+{regs.length - 6}</div>}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{regs.length ? `${regs.length} pilot${regs.length === 1 ? '' : 's'} going` : 'Nobody\'s going yet'}</div>
              <div style={{ ...muted, fontSize: '0.9rem' }}>
                {regs.length ? namesLine(regs) : canSignUp ? (hasGates ? 'Take a gate below to be the first.' : 'Be the first.') : ''}
              </div>
            </div>
          </div>

          </div>

          {ev.body && (
            <div className="ev-section">
              <div className="ev-h">Briefing</div>
              <p style={{ fontSize: '1rem', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', maxWidth: 820 }}>{ev.body}</p>
            </div>
          )}

          {hasGates ? (
            <div className="ev-section">
            <div className="ev-h">Gates · {freeGates} of {ev.gates.length} free</div>
            <table className="ev-table">
              <thead><tr><th>Gate</th><th>Pilot</th><th className="ev-hide-sm">Rank</th>{liveOn ? <th>Status</th> : <th className="ev-hide-sm">Signed up</th>}<th /></tr></thead>
              <tbody>
                {ev.gates.map(g => {
                  const r = byGate[g];
                  return (
                    <tr key={g} className={r?.isMe ? 'mine' : ''}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.95rem', width: 70 }}>{g}</td>
                      <td>
                        {r ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                            <UserAvatar user={r.user} size={26} fontSize="0.7rem" />
                            <strong>{r.user?.name}</strong>{r.isMe && <span style={muted}>(you)</span>}{landedTag(r)}
                          </span>
                        ) : <span style={muted}>Open</span>}
                      </td>
                      <td className="ev-hide-sm" style={muted}>{r?.user?.rank || ''}</td>
                      {liveOn ? <td>{r ? statusCell(r.user?.id) : ''}</td> : <td className="ev-hide-sm" style={muted}>{r ? timeAgo(r.created) : ''}</td>}
                      <td style={{ textAlign: 'right', width: 110 }}>
                        {!r && canSignUp && !ev.myFlight && (
                          <button className="ev-take" disabled={!canTake} onClick={() => register(g)}>{mine ? 'Move here' : 'Take'} →</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          ) : null}

          {noGate.length > 0 && (
            <div className="ev-section">
            <div className="ev-h">{hasGates ? 'Also flying' : 'Pilots'}</div>
            <table className="ev-table">
              <thead><tr><th>Pilot</th><th className="ev-hide-sm">Rank</th>{liveOn ? <th>Status</th> : <th className="ev-hide-sm">Signed up</th>}</tr></thead>
              <tbody>
                {noGate.map(r => (
                  <tr key={r.id} className={r.isMe ? 'mine' : ''}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><UserAvatar user={r.user} size={26} fontSize="0.7rem" /><strong>{r.user?.name}</strong>{r.isMe && <span style={muted}>(you)</span>}{landedTag(r)}</span></td>
                    <td className="ev-hide-sm" style={muted}>{r.user?.rank || ''}</td>
                    {liveOn ? <td>{statusCell(r.user?.id)}</td> : <td className="ev-hide-sm" style={muted}>{timeAgo(r.created)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="ev-panel">
          {ev.status === 'published' && <Countdown start={ev.start_at} end={ev.end_at} />}
          {ticket}
          {data.canManage && (
            <Link to={`/admin?tab=events&id=${ev.id}`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Settings2 size={15} />Manage this event</Link>
          )}
        </div>
      </div>

      {confirmDrop && (
        <ConfirmModal title="Drop out of this event?" message={mine?.gate ? `Gate ${mine.gate} will be free for someone else.` : 'You can sign up again while it\'s open.'}
          confirmLabel="Drop out" danger onConfirm={dropOut} onClose={() => setConfirmDrop(false)} />
      )}
    </div>
  );
}

export default function Events() {
  const [params] = useSearchParams();
  const id = params.get('id');
  return id ? <EventDetail id={id} /> : <EventsList />;
}
