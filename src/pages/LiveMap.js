/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, AttributionControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw, X } from 'lucide-react';
import { liveMap } from '../api/client';
import '../styles/livemap.css';
import { colors as BRAND } from '../brand';

import brand from '../brand';
const POLL_MS = 30_000;
const DEFAULT_CENTER = brand.map.center;
const DEFAULT_ZOOM = brand.map.zoom;

// Esri's grey canvas maps: no API key, and a dark version for dark mode
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILES = {
  light: { base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  dark:  { base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,  labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
};
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

const fmtAlt = ft => `${Math.round(ft || 0).toLocaleString()} ft`;
const fmtSpd = kt => `${kt} kts`;
const fmtTime = d => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const isMobile = () => window.innerWidth <= 768;
const isDark = () => document.body.classList.contains('dark-mode');

function greatCirclePoints(lat1, lng1, lat2, lng2, steps = 32) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  while (lng2 - lng1 > 180)  lng2 -= 360;
  while (lng2 - lng1 < -180) lng2 += 360;

  const φ1 = toRad(lat1), λ1 = toRad(lng1);
  const φ2 = toRad(lat2), λ2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
  ));
  if (d < 0.001) return [[lat1, lng1], [lat2, lng2]];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  return pts;
}

// ETE / ETA calculation
function haversineNm(lat1, lng1, lat2, lng2) {
  const R = 3440.065; // Earth radius in nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcETE(flight) {
  // Need arrival planPoint, current position, and speed
  if (!flight.planPoints?.length || !flight.speed || flight.speed < 50) return null;
  const dest = flight.planPoints[flight.planPoints.length - 1];
  const remainingNm = haversineNm(flight.lat, flight.lng, dest.lat, dest.lng);
  const hoursRemaining = remainingNm / flight.speed;
  if (hoursRemaining > 24 || hoursRemaining < 0) return null;
  const totalMins = Math.round(hoursRemaining * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ete = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const eta = fmtTime(new Date(Date.now() + hoursRemaining * 3600 * 1000));
  return { ete, eta };
}

function interpolatePlanLine(planPoints) {
  if (!planPoints || planPoints.length < 2) return planPoints?.map(p => [p.lat, p.lng]) || [];
  const result = [];
  for (let i = 0; i < planPoints.length - 1; i++) {
    const pts = greatCirclePoints(planPoints[i].lat, planPoints[i].lng, planPoints[i + 1].lat, planPoints[i + 1].lng, 24);
    if (i === 0) result.push(...pts);
    else result.push(...pts.slice(1));
  }
  return result;
}

function unwrapLongitudes(pts) {
  if (!pts || pts.length < 2) return pts || [];
  const result = [[...pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    let [lat, lng] = pts[i];
    const prevLng = result[i - 1][1];
    // Normalise so this point is within ±180° of the previous
    while (lng - prevLng > 180)  lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    result.push([lat, lng]);
  }
  return result;
}

async function loadFlightDetail({ sessionId, flightId }) {
  const [planRes, routeRes] = await Promise.allSettled([
    liveMap.flightPlan(sessionId, flightId),
    liveMap.route(sessionId, flightId),
  ]);
  const items = planRes.status === 'fulfilled' ? planRes.value?.flightPlan?.flightPlanItems || [] : [];
  const route = routeRes.status === 'fulfilled' ? routeRes.value?.route || [] : [];

  const planPoints = [];
  const addPoint = item => {
    if (item.location && (item.location.latitude !== 0 || item.location.longitude !== 0)) {
      planPoints.push({ lat: item.location.latitude, lng: item.location.longitude, name: item.name });
    }
  };
  for (const item of items) {
    addPoint(item);
    (item.children || []).forEach(addPoint);
  }

  return {
    planPoints,
    route,
    departure: items[0]?.name || null,
    arrival:   items.length > 1 ? items[items.length - 1].name || null : null,
  };
}

function getAircraftIcon(aircraft) {
  if (!aircraft) return 'unknown';
  const a = aircraft.toLowerCase();
  if (a.includes('a380'))                                return 'a380';
  if (a.includes('a340'))                                return 'a340';
  if (a.includes('a330') || a.includes('a350'))          return 'a330';
  if (/a3(19|20|21)|a220/.test(a))                       return 'a320';
  if (a.includes('717') || a.includes('737'))            return 'b737';
  if (a.includes('747'))                                 return 'b747';
  if (a.includes('767'))                                 return 'b767';
  if (a.includes('777'))                                 return 'b777';
  if (a.includes('787'))                                 return 'b787';
  if (a.includes('q400') || a.includes('dash'))          return 'q400';
  if (/e1[79]\d|embraer/.test(a))                        return 'e195';
  return 'unknown';
}

function createPlaneIcon(heading, { selected, fleet, aircraft }) {
  const size = selected ? 30 : 22;
  const mask = `url(/aircraft-icons/${getAircraftIcon(aircraft)}.svg) center / contain no-repeat`;
  const html = `<div style="width:${size}px;height:${size}px;transform:rotate(${heading || 0}deg);-webkit-mask:${mask};mask:${mask}"></div>`;
  return L.divIcon({
    html,
    className: `lm-plane${fleet ? ' is-fleet' : ''}${selected ? ' is-selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function mergeFlights(flights, sessionId, fleet) {
  const fleetByFlight = new Map(fleet.filter(a => a.flightId).map(a => [a.flightId, a]));
  const merged = flights.map(f => {
    const ac = fleetByFlight.get(f.id);
    fleetByFlight.delete(f.id);
    return ac
      ? { ...f, sessionId: ac.sessionId || sessionId, flightId: f.id, fleet: ac, aircraft: f.aircraft || ac.aircraft, image_url: ac.image_url || f.image_url }
      : { ...f, sessionId, flightId: f.id, fleet: null };
  });
  const onList = new Set(flights.map(f => f.id));
  for (const ac of fleet) {
    if (ac.flightId && onList.has(ac.flightId)) continue;
    merged.push({
      id: ac.flightId || `live-${ac.id}`,
      callsign: ac.callsign || ac.registration,
      username: ac.username,
      lat: ac.lat, lng: ac.lng, altitude: ac.altitude, speed: ac.speed, heading: ac.heading,
      aircraft: ac.aircraft, image_url: ac.image_url,
      departure: null, arrival: null, stats: null,
      sessionId: ac.sessionId, flightId: ac.flightId, fleet: ac,
    });
  }
  return merged;
}

// Map helpers
function MapController({ selectedFlight }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (selectedFlight && selectedFlight.id !== prev.current) {
      const zoom = Math.max(map.getZoom(), 6);
      const shift = isMobile() ? 0 : 160;
      const point = map.project([selectedFlight.lat, selectedFlight.lng], zoom).subtract([shift, 0]);
      map.flyTo(map.unproject(point, zoom), zoom, { duration: 0.8 });
    }
    prev.current = selectedFlight?.id || null;
  }, [selectedFlight, map]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Follows the site's dark mode toggle (a class on <body>)
function useDarkMode() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Flight details
function FlightDetails({ flight, onClose }) {
  const time = calcETE(flight);
  const planLoaded = flight.planPoints !== undefined;
  const airport = code => code || (planLoaded ? '—' : '…');

  return (
    <>
      {flight.image_url ? (
        <div className="lm-photo">
          <img src={flight.image_url} alt="" />
          <span>{flight.aircraft || 'Unknown aircraft'}</span>
        </div>
      ) : flight.aircraft && (
        <div className="lm-aircraft">{flight.aircraft}</div>
      )}

      <div className="lm-body">
        <div className="lm-title">
          <div>
            <h3>{flight.callsign}</h3>
            {(flight.username || flight.fleet) && (
              <p>
                {flight.username}
                {flight.fleet?.session && !/expert/i.test(flight.fleet.session) && <> · {flight.fleet.session}</>}
              </p>
            )}
            {flight.fleet && (
              <div className="lm-fleet-tag"><span>{flight.fleet.registration}</span>Live fleet</div>
            )}
          </div>
          <button type="button" className="lm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="lm-route">
          <div>
            <strong>{airport(flight.departure)}</strong>
            <span>Dep</span>
          </div>
          <div className="lm-route-mid">
            <span className="lm-route-line" />
            {time && <span>{time.ete}</span>}
          </div>
          <div>
            <strong>{airport(flight.arrival)}</strong>
            <span>{time ? `ETA ${time.eta}` : 'Arr'}</span>
          </div>
        </div>

        <dl className="lm-stats">
          <div><dt>Altitude</dt><dd>{fmtAlt(flight.altitude)}</dd></div>
          <div><dt>Speed</dt><dd>{fmtSpd(flight.speed)}</dd></div>
          <div><dt>Heading</dt><dd>{flight.heading}°</dd></div>
        </dl>

        {flight.stats && (
          <div className="lm-pilot">
            <div className="lm-pilot-tags">
              {flight.stats.rank && <span className="lm-rank">{flight.stats.rank}</span>}
              {flight.stats.is_legacy && <span className="lm-legacy">Legacy Pilot</span>}
            </div>
            <dl className="lm-stats lm-stats-2">
              <div><dt>Flights</dt><dd>{(flight.stats.total_flights || 0).toLocaleString()}</dd></div>
              <div><dt>Hours</dt><dd>{(flight.stats.total_hours || 0).toFixed(1)}</dd></div>
            </dl>
          </div>
        )}
      </div>
    </>
  );
}

// Mobile bottom sheet
function MobileSheet({ flight, onClose }) {
  const [expanded, setExpanded] = useState(false);
  if (!flight) return null;
  const close = () => { setExpanded(false); onClose(); };

  return (
    <>
      {expanded && <div className="lm-sheet-backdrop" onClick={() => setExpanded(false)} />}
      <div className={`lm-sheet${expanded ? ' is-expanded' : ''}`}>
        <button type="button" className="lm-sheet-handle" onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Show less' : 'Show more'}>
          <span />
        </button>

        {expanded ? (
          <div className="lm-sheet-body">
            <FlightDetails flight={flight} onClose={close} />
          </div>
        ) : (
          <div className="lm-peek" onClick={() => setExpanded(true)}>
            {flight.image_url && <img src={flight.image_url} alt="" />}
            <div>
              <strong>{flight.callsign}{flight.fleet && <em className="lm-peek-rego">{flight.fleet.registration}</em>}</strong>
              {flight.departure && flight.arrival && <span>{flight.departure} → {flight.arrival}</span>}
              <span>{fmtAlt(flight.altitude)} · {fmtSpd(flight.speed)} · {flight.heading}°</span>
            </div>
            <button type="button" className="lm-close" onClick={e => { e.stopPropagation(); close(); }} aria-label="Close"><X size={18} /></button>
          </div>
        )}
      </div>
    </>
  );
}

// Page
export default function LiveMap() {
  const [flights, setFlights]           = useState([]);
  const [fleet, setFleet]               = useState([]); // Live fleet aircraft in multiplayer
  const [details, setDetails]           = useState({});
  const [selected, setSelected]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [error, setError]               = useState(null);
  const [mobile, setMobile]             = useState(isMobile());
  const [sessionId, setSessionId]       = useState(null);
  const dark = useDarkMode();

  useEffect(() => {
    const handler = () => setMobile(isMobile());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const fetchFlights = useCallback(async () => {
    // the fleet is a bonus layer: if it fails, the AVG flights still show
    const [flightsRes, fleetRes] = await Promise.allSettled([liveMap.flights(), liveMap.fleet()]);
    if (fleetRes.status === 'fulfilled') setFleet(fleetRes.value.aircraft || []);
    if (flightsRes.status === 'fulfilled') {
      const data = flightsRes.value;
      setFlights(data.flights || []);
      setSessionId(data.sessionId || null);
      setServerOnline(data.serverOnline !== false);
      setError(null);
    } else {
      setError("Couldn't load live flights. Trying again shortly.");
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  // Polls only while the tab is visible, and catches up when it comes back
  useEffect(() => {
    fetchFlights();
    const id = setInterval(() => { if (!document.hidden) fetchFlights(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) fetchFlights(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchFlights]);

  const all = mergeFlights(flights, sessionId, fleet);
  const flight = all.find(f => f.id === selected);
  const canLoadDetail = !!(flight?.sessionId && flight?.flightId);

  // Plan + flown path for the picked flight, refreshed with each poll
  useEffect(() => {
    if (!selected || !canLoadDetail) return;
    let cancelled = false;
    loadFlightDetail(flight)
      .then(d => { if (!cancelled) setDetails(prev => ({ ...prev, [selected]: d })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected, canLoadDetail, lastUpdated]); // eslint-disable-line react-hooks/exhaustive-deps

  // A picked flight that has landed and gone drops out of the list
  useEffect(() => {
    if (selected && !loading && !flight) setSelected(null);
  }, [flight, selected, loading]);

  const detail = selected ? details[selected] : null;
  const selectedFlight = !flight ? null
    : detail ? { ...flight, ...detail }
    // without ids to fetch a plan with there's nothing to wait for
    : canLoadDetail ? { ...flight, departure: null, arrival: null, planPoints: undefined } : { ...flight, planPoints: [] };
  const tiles = dark ? TILES.dark : TILES.light;
  const fleetCount = all.filter(f => f.fleet).length;
  const count = `${all.length} ${all.length === 1 ? 'flight' : 'flights'}`;

  return (
    <div className="lm">
      {!mobile && (
        <div className="page-header lm-header">
          <div>
            <h2>Live Map</h2>
            <p>{brand.abbreviation} flights and Live fleet aircraft on Infinite Flight</p>
          </div>
          <div className="lm-header-actions">
            <span className={`lm-pill${serverOnline ? '' : ' is-offline'}`}>
              <i />{serverOnline ? 'Expert Server online' : 'Expert Server offline'}
            </span>
            <span className="lm-pill">{count}</span>
            {fleetCount > 0 && <span className="lm-pill"><i className="is-fleet" />{fleetCount} Live fleet</span>}
            <button type="button" className="lm-refresh" onClick={fetchFlights}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      )}

      <div className="lm-map">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} minZoom={2} zoomControl={false} attributionControl={false} worldCopyJump>
          <AttributionControl position="bottomright" prefix={false} />
          <TileLayer key={`base-${dark}`} url={tiles.base} attribution={ATTRIBUTION} maxZoom={16} />
          <TileLayer key={`labels-${dark}`} url={tiles.labels} maxZoom={16} />

          <MapController selectedFlight={selectedFlight} />

          {selectedFlight?.planPoints?.length > 1 && (
            <Polyline
              positions={unwrapLongitudes(interpolatePlanLine(selectedFlight.planPoints))}
              pathOptions={{ color: BRAND.accent, weight: 1.5, opacity: 0.7, dashArray: '6 5' }}
            />
          )}
          {selectedFlight?.planPoints?.map((p, i) => (
            <CircleMarker key={`wp-${i}`} center={[p.lat, p.lng]} radius={3}
              pathOptions={{ color: dark ? '#252525' : '#fff', fillColor: BRAND.accent, fillOpacity: 1, weight: 1.5 }}>
              {p.name && <Tooltip permanent direction="top" offset={[0, -5]} className="lm-wp">{p.name}</Tooltip>}
            </CircleMarker>
          ))}
          {selectedFlight?.route?.length > 1 && (
            <Polyline
              positions={unwrapLongitudes(interpolatePlanLine(selectedFlight.route.map(p => ({ lat: p.latitude, lng: p.longitude }))))}
              pathOptions={{ color: BRAND.accent, weight: 3, opacity: 0.95 }}
            />
          )}

          {all.map(f => {
            const isSel = f.id === selected;
            return (
              <Marker
                key={f.id}
                position={[f.lat, f.lng]}
                icon={createPlaneIcon(f.heading, { selected: isSel, fleet: !!f.fleet, aircraft: f.aircraft })}
                zIndexOffset={isSel ? 1000 : f.fleet ? 500 : 0}
                eventHandlers={{ click: () => setSelected(isSel ? null : f.id) }}
              >
                {!mobile && !isSel && (
                  <Tooltip direction="top" offset={[0, -12]} className="lm-callsign">
                    {f.callsign}{f.fleet && f.fleet.registration !== f.callsign && <span className="lm-tip-rego">{f.fleet.registration}</span>}
                  </Tooltip>
                )}
              </Marker>
            );
          })}
        </MapContainer>

        {!mobile && selectedFlight && (
          <div className="lm-panel">
            <FlightDetails flight={selectedFlight} onClose={() => setSelected(null)} />
          </div>
        )}

        {loading && (
          <div className="lm-loading">
            <div className="loading-spinner" />
            <span>Loading live flights…</span>
          </div>
        )}

        {!loading && !error && all.length === 0 && (
          <div className="lm-empty">
            <strong>No flights airborne</strong>
            <span>{serverOnline ? `No ${brand.abbreviation} pilots or Live fleet aircraft are flying right now.` : 'Expert Server is offline.'}</span>
          </div>
        )}

        {error && <div className="lm-error">{error}</div>}

        {mobile && (
          <div className="lm-mobile-bar">
            <span className={`lm-pill${serverOnline ? '' : ' is-offline'}`}><i />{serverOnline ? 'Expert' : 'Offline'}</span>
            <span className="lm-pill">{count}</span>
            {fleetCount > 0 && <span className="lm-pill"><i className="is-fleet" />{fleetCount} Live</span>}
            <button type="button" className="lm-pill" onClick={fetchFlights} aria-label="Refresh"><RefreshCw size={13} /></button>
          </div>
        )}

        {!mobile && fleetCount > 0 && (
          <div className="lm-key">
            <span><i />{brand.abbreviation} flight</span>
            <span><i className="is-fleet" />Live fleet</span>
          </div>
        )}

        {!mobile && lastUpdated && (
          <div className="lm-updated">Updated {fmtTime(lastUpdated)} · refreshes every 30s</div>
        )}
      </div>

      {mobile && <MobileSheet flight={selectedFlight} onClose={() => setSelected(null)} />}
    </div>
  );
}
