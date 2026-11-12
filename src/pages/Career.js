/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fleet as fleetApi, career as careerApi, liveMap as liveMapApi } from '../api/client';
import Dropdown from '../components/Dropdown';
import { showToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { loadAirportDb } from '../services/airportService';
import { colors as BRAND } from '../brand';

import brand from '../brand';
// Career hubs come from va.config.json
const HUBS = brand.hubs.map(h => h.icao.toUpperCase());
const HUB_NAMES = Object.fromEntries(brand.hubs.map(h => [h.icao.toUpperCase(), h.name || h.icao.toUpperCase()]));

// Globe map (reuses same pattern as LogbookMap)
const CareerGlobe = memo(function CareerGlobe({ flights, currentIcao }) {
  const mountRef  = useRef(null);
  const globeRef  = useRef(null);
  const [ready, setReady] = useState(!!window.Globe);
  const [airportDb, setAirportDb] = useState(null);

  useEffect(() => {
    if (window.__avgAirportDb) { setAirportDb(window.__avgAirportDb); return; }
    loadAirportDb().then(db => {
      window.__avgAirportDb = db;
      setAirportDb(db);
    }).catch(() => setAirportDb({}));
  }, []);

  useEffect(() => {
    if (window.Globe) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/globe.gl@2.27.2/dist/globe.gl.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !mountRef.current || !airportDb) return;
    if (globeRef.current) { mountRef.current.innerHTML = ''; globeRef.current = null; }

    const approved = flights.filter(f => f.departure_icao && f.arrival_icao);
    const arcs = [];
    const pointMap = {};

    for (const f of approved) {
      const dep = airportDb[f.departure_icao?.toUpperCase()];
      const arr = airportDb[f.arrival_icao?.toUpperCase()];
      if (!dep || !arr) continue;
      arcs.push({ startLat: dep.lat, startLng: dep.lng, endLat: arr.lat, endLng: arr.lng });
      pointMap[f.departure_icao] = { ...dep, icao: f.departure_icao };
      pointMap[f.arrival_icao]   = { ...arr, icao: f.arrival_icao };
    }

    // Current position point
    const curPoint = currentIcao ? airportDb[currentIcao] : null;
    const points = Object.values(pointMap).map(p => ({
      ...p, isCurrent: p.icao === currentIcao,
    }));

    const globe = window.Globe()
      .globeImageUrl('/earth-dark.jpg')
      .backgroundImageUrl('/night-sky.png')
      .arcsData(arcs)
      .arcColor(() => [`rgba(${BRAND.primaryRgb}, 0.15)`, `rgba(${BRAND.primaryRgb}, 0.9)`])
      .arcAltitudeAutoScale(0.3)
      .arcStroke(0.15)
      .arcDashLength(1)
      .arcDashGap(0)
      .arcDashAnimateTime(0)
      .pointsData(points)
      .pointLat('lat').pointLng('lng')
      .pointColor(d => d.isCurrent ? BRAND.accent : 'rgba(255,255,255,0.6)')
      .pointAltitude(d => d.isCurrent ? 0.02 : 0.005)
      .pointRadius(d => d.isCurrent ? 0.5 : 0.2)
      .pointLabel(d => `<div style="background:rgba(0,0,0,0.8);padding:4px 8px;border-radius:6px;font-size:11px;color:white;white-space:nowrap"><strong>${d.icao}</strong>${d.city ? `<br/>${d.city}` : ''}${d.isCurrent ? '<br/><span style="color:var(--brand-accent)">Current position</span>' : ''}</div>`)
      .width(mountRef.current.clientWidth)
      .height(380)(mountRef.current);

    globeRef.current = globe;

    // Focus on Australia
    if (curPoint) {
      globe.pointOfView({ lat: curPoint.lat, lng: curPoint.lng, altitude: 2.5 }, 1000);
    } else {
      globe.pointOfView({ lat: -25, lng: 133, altitude: 2 }, 0);
    }

    const handleResize = () => { if (mountRef.current) globe.width(mountRef.current.clientWidth); };
    window.addEventListener('resize', handleResize);
    const el = mountRef.current;
    return () => { window.removeEventListener('resize', handleResize); if (el) el.innerHTML = ''; globeRef.current = null; };
  }, [ready, airportDb, flights, currentIcao]);

  return <div ref={mountRef} style={{ height: 380, width: '100%', background: '#000', borderRadius: '10px', overflow: 'hidden' }} />;
});

// Hub coordinates for globe
const HUB_COORDS = {
  YSSY: { lat: -33.9461, lng: 151.1772 },
  YMML: { lat: -37.6733, lng: 144.8430 },
  YBBN: { lat: -27.3842, lng: 153.1175 },
  YPPH: { lat: -31.9403, lng: 115.9669 },
  YPAD: { lat: -34.9450, lng: 138.5300 },
};

// Enroll flow
function EnrollFlow({ onEnrolled }) {
  const [selectedHub, setHub]         = useState(null);
  const [selectedAc, setAc]           = useState(null);
  const [hubAircraft, setHubAircraft] = useState([]);
  const [loadingAc, setLoadingAc]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [airportDb, setAirportDb]     = useState(window.__avgAirportDb || null);
  const [mobile, setMobile]           = useState(window.innerWidth <= 768);
  const globeRef  = useRef(null);
  const mountRef  = useRef(null);
  const [globeReady, setGlobeReady] = useState(!!window.Globe);

  useEffect(() => {
    const handler = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  // Load airport DB
  useEffect(() => {
    if (window.__avgAirportDb) { setAirportDb(window.__avgAirportDb); return; }
    loadAirportDb().then(db => {
      window.__avgAirportDb = db;
      setAirportDb(db);
    }).catch(() => setAirportDb({}));
  }, []);

  // Load globe.gl
  useEffect(() => {
    if (window.Globe) { setGlobeReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/globe.gl@2.27.2/dist/globe.gl.min.js';
    s.onload = () => setGlobeReady(true);
    document.head.appendChild(s);
  }, []);

  // Init globe once ready
  useEffect(() => {
    if (!globeReady || !mountRef.current || globeRef.current) return;
    const globe = window.Globe()
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .backgroundImageUrl('/night-sky.png')
      .width(mountRef.current.clientWidth)
      .height(mountRef.current.clientHeight)
      .atmosphereAltitude(0.15)
      .arcsData([])
      .arcColor(() => [`rgba(${BRAND.accentRgb}, 0.4)`, `rgba(${BRAND.accentRgb}, 0.9)`])
      .arcAltitudeAutoScale(0.3)
      .arcStroke(0.15)
      .arcDashLength(1)
      .arcDashGap(0)
      .arcDashAnimateTime(0)
      .pointsData(HUBS.map(h => ({ ...HUB_COORDS[h], icao: h, name: HUB_NAMES[h] })))
      .pointLat('lat').pointLng('lng')
      .pointColor(d => d.icao === selectedHub ? BRAND.accent : 'rgba(255,255,255,0.5)')
      .pointAltitude(d => d.icao === selectedHub ? 0.04 : 0.01)
      .pointRadius(d => d.icao === selectedHub ? 0.6 : 0.3)
      .pointLabel(d => `<div style="background:rgba(0,0,0,0.75);padding:4px 8px;border-radius:6px;font-size:11px;color:white;white-space:nowrap"><strong>${d.icao}</strong><br/>${d.name}</div>`)
      .onPointClick(d => handleHubSelect(d.icao))
      (mountRef.current);

    globe.pointOfView({ lat: -25, lng: 133, altitude: 2.2 }, 0);

    const handleResize = () => {
      if (mountRef.current) globe.width(mountRef.current.clientWidth).height(mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    globeRef.current = globe;
    return () => { window.removeEventListener('resize', handleResize); };
  }, [globeReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update arcs when aircraft selection changes
  useEffect(() => {
    if (!globeRef.current || !airportDb) return;
    const acObj = hubAircraft.find(a => a.name === selectedAc);
    const routes = acObj?.routes || [];

    const arcs = routes
      .map(r => {
        const dep = airportDb[r.dep?.toUpperCase()];
        const arr = airportDb[r.arr?.toUpperCase()];
        if (!dep || !arr) return null;
        return { startLat: dep.lat, startLng: dep.lng, endLat: arr.lat, endLng: arr.lng, dep: r.dep, arr: r.arr };
      })
      .filter(Boolean);

    // Unique destination points
    const pointSet = {};
    arcs.forEach(a => {
      pointSet[a.dep] = airportDb[a.dep];
      pointSet[a.arr] = airportDb[a.arr];
    });
    const destPoints = Object.entries(pointSet)
      .filter(([, v]) => v)
      .map(([icao, v]) => ({ lat: v.lat, lng: v.lng, icao, isHub: HUBS.includes(icao) }));

    globeRef.current
      .arcsData(arcs)
      .arcColor(() => [`rgba(${BRAND.accentRgb}, 0.4)`, `rgba(${BRAND.accentRgb}, 0.9)`])
      .arcAltitudeAutoScale(0.3)
      .arcStroke(0.15)
      .arcDashLength(1)
      .arcDashGap(0)
      .arcDashAnimateTime(0)
      .pointsData([
        ...HUBS.map(h => ({ ...HUB_COORDS[h], icao: h, isHub: true })),
        ...destPoints.filter(p => !HUBS.includes(p.icao)),
      ])
      .pointColor(d => d.icao === selectedHub ? BRAND.accent : HUBS.includes(d.icao) ? 'rgba(255,255,255,0.5)' : `rgba(${BRAND.accentRgb}, 0.4)`)
      .pointAltitude(d => d.icao === selectedHub ? 0.04 : 0.01)
      .pointRadius(d => d.icao === selectedHub ? 0.6 : HUBS.includes(d.icao) ? 0.3 : 0.2);
  }, [selectedAc, airportDb, hubAircraft, selectedHub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update point colours when hub changes
  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current
      .pointColor(d => d.icao === selectedHub ? BRAND.accent : 'rgba(255,255,255,0.5)')
      .pointAltitude(d => d.icao === selectedHub ? 0.04 : 0.01)
      .pointRadius(d => d.icao === selectedHub ? 0.6 : 0.3);
    if (selectedHub) {
      const coords = HUB_COORDS[selectedHub];
      globeRef.current.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 0.6 }, 900);
    }
  }, [selectedHub]);

  const handleHubSelect = async (hub) => {
    setHub(hub);
    setAc(null);
    setHubAircraft([]);
    setLoadingAc(true);
    try {
      const data = await careerApi.hubAircraft(hub);
      setHubAircraft(data.aircraft || []);
    } catch {
      showToast('Failed to load aircraft for this hub', 'error');
    } finally {
      setLoadingAc(false);
    }
  };

  const handleEnroll = async () => {
    try {
      setLoading(true);
      await careerApi.enroll({ aircraft: selectedAc, hub: selectedHub });
      showToast('Welcome to Career Mode!', 'success');
      onEnrolled();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedAcObj = hubAircraft.find(a => a.name === selectedAc);
  const canEnroll = selectedHub && selectedAc;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {mobile ? (
        /* MOBILE: globe full width, bottom sheet */
        <div style={{ position: 'relative' }}>
          {/* Globe */}
          <div style={{ background: '#0a0f1a', borderRadius: '14px', overflow: 'hidden', height: 420, position: 'relative' }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
            {!globeReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
                Loading globe…
              </div>
            )}
            {/* Hub pills */}
            <div style={{ position: 'absolute', bottom: '1rem', left: '0.75rem', right: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
              {HUBS.map(hub => {
                const sel = selectedHub === hub;
                return (
                  <button key={hub} onClick={() => handleHubSelect(hub)} style={{
                    padding: '0.35rem 0.75rem', borderRadius: '20px', cursor: 'pointer',
                    border: `1.5px solid ${sel ? 'var(--brand-accent)' : 'rgba(255,255,255,0.2)'}`,
                    background: sel ? 'rgba(var(--brand-accent-rgb),0.15)' : 'rgba(0,0,0,0.55)',
                    color: sel ? 'var(--brand-accent)' : 'rgba(255,255,255,0.75)',
                    fontSize: '0.75rem', fontWeight: sel ? 700 : 500,
                    transition: 'all 0.15s',
                  }}>
                    {hub} <span style={{ opacity: 0.7 }}>— {HUB_NAMES[hub]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom sheet */}
          <div style={{
            marginTop: '1rem',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '16px', overflow: 'hidden',
          }}>
            {/* Aircraft preview image */}
            <div style={{ height: 140, background: '#0f172a', position: 'relative' }}>
              {selectedAcObj?.image_url && (
                <img src={selectedAcObj.image_url} alt={selectedAcObj.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
              <div style={{ position: 'absolute', bottom: '0.875rem', left: '1rem', right: '1rem' }}>
                {selectedAc
                  ? <><div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>{selectedAc}</div>
                      {selectedAcObj && <div style={{ fontSize: '0.72rem', color: 'rgba(var(--brand-accent-rgb),0.9)', marginTop: 2 }}>{selectedAcObj.routes?.length || 0} routes in network</div>}</>
                  : <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>{selectedHub ? 'Select an aircraft below' : 'Select a hub above'}</div>
                }
              </div>
            </div>

            {/* Aircraft list */}
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 280, overflowY: 'auto' }}>
              {!selectedHub ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '1rem 0', textAlign: 'center' }}>Pick a hub to see available aircraft</div>
              ) : loadingAc ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '1rem 0', textAlign: 'center' }}>Loading…</div>
              ) : hubAircraft.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '1rem 0', textAlign: 'center' }}>No aircraft from {selectedHub}</div>
              ) : hubAircraft.map(ac => {
                const sel = selectedAc === ac.name;
                return (
                  <button key={ac.id} onClick={() => setAc(ac.name)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    padding: '0.5rem 0.625rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                    border: `1.5px solid ${sel ? 'var(--avg-green)' : 'var(--border-color)'}`,
                    background: sel ? 'rgba(var(--brand-primary-rgb),0.05)' : 'var(--bg-primary)',
                    transition: 'all 0.12s',
                  }}>
                    {ac.image_url
                      ? <img src={ac.image_url} alt={ac.name} style={{ width: 44, height: 28, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                      : <div style={{ width: 44, height: 28, borderRadius: '4px', background: 'var(--bg-hover)', flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: sel ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ac.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 1 }}>{ac.routes?.length || 0} routes</div>
                    </div>
                    {sel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                );
              })}
            </div>

            {/* Confirm strip */}
            <div style={{ padding: '0.875rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
                <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>Hub</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{selectedHub || '—'}</div>
                </div>
                <div style={{ flex: 2, background: 'var(--bg-card)', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>Aircraft</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAc || '—'}</div>
                </div>
              </div>
              <button onClick={handleEnroll} disabled={!canEnroll || loading} className="btn btn-primary"
                style={{ width: '100%', opacity: canEnroll ? 1 : 0.35 }}>
                {loading ? 'Enrolling…' : 'Start Career Mode'}
              </button>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.4 }}>
                Hub and aircraft locked for 3 months. Staff can override.
              </p>
            </div>
          </div>
        </div>

      ) : (
        /* DESKTOP: side by side */
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem', marginBottom: '1.25rem' }}>

            {/* Globe */}
            <div style={{ background: '#0a0f1a', borderRadius: '14px', overflow: 'hidden', minHeight: 420, position: 'relative' }}>
              <div ref={mountRef} style={{ width: '100%', height: '100%', minHeight: 420 }} />
              {!globeReady && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
                  Loading globe…
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
                {HUBS.map(hub => {
                  const sel = selectedHub === hub;
                  return (
                    <button key={hub} onClick={() => handleHubSelect(hub)} style={{
                      padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'var(--brand-accent)' : 'rgba(255,255,255,0.2)'}`,
                      background: sel ? 'rgba(var(--brand-accent-rgb),0.15)' : 'rgba(0,0,0,0.5)',
                      color: sel ? 'var(--brand-accent)' : 'rgba(255,255,255,0.7)',
                      fontSize: '0.78rem', fontWeight: sel ? 700 : 500,
                      transition: 'all 0.15s',
                    }}>
                      {hub} <span style={{ opacity: 0.7 }}>— {HUB_NAMES[hub]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', flex: 1 }}>
                <div style={{ height: 150, background: '#0f172a', position: 'relative', flexShrink: 0 }}>
                  {selectedAcObj?.image_url && (
                    <img src={selectedAcObj.image_url} alt={selectedAcObj.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }} />
                  <div style={{ position: 'absolute', bottom: '0.875rem', left: '1rem', right: '1rem' }}>
                    {selectedAc
                      ? <><div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>{selectedAc}</div>
                          {selectedAcObj && <div style={{ fontSize: '0.7rem', color: 'rgba(var(--brand-accent-rgb),0.9)', marginTop: 2 }}>{selectedAcObj.routes?.length || 0} routes in network</div>}</>
                      : <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>{selectedHub ? 'Select an aircraft' : 'Select a hub first'}</div>
                    }
                  </div>
                </div>
                <div style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
                  {!selectedHub ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0.5rem 0', textAlign: 'center' }}>Pick a hub to see available aircraft</div>
                  ) : loadingAc ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0.5rem 0', textAlign: 'center' }}>Loading…</div>
                  ) : hubAircraft.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0.5rem 0', textAlign: 'center' }}>No aircraft from {selectedHub}</div>
                  ) : hubAircraft.map(ac => {
                    const sel = selectedAc === ac.name;
                    return (
                      <button key={ac.id} onClick={() => setAc(ac.name)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.625rem',
                        padding: '0.5rem 0.625rem', borderRadius: '7px', cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${sel ? 'var(--avg-green)' : 'var(--border-color)'}`,
                        background: sel ? 'rgba(var(--brand-primary-rgb),0.05)' : 'var(--bg-primary)',
                        transition: 'all 0.12s', flexShrink: 0,
                      }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--avg-green)'; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                      >
                        {ac.image_url
                          ? <img src={ac.image_url} alt={ac.name} style={{ width: 40, height: 26, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                          : <div style={{ width: 40, height: 26, borderRadius: '4px', background: 'var(--bg-hover)', flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: sel ? 700 : 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ac.name}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '1px' }}>{ac.routes?.length || 0} route{ac.routes?.length !== 1 ? 's' : ''}</div>
                        </div>
                        {sel && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', marginBottom: '0.875rem' }}>
                  {[
                    { label: 'Hub',      value: selectedHub ? `${selectedHub} · ${HUB_NAMES[selectedHub]}` : '—', mono: !!selectedHub },
                    { label: 'Aircraft', value: selectedAc || '—' },
                    { label: 'Routes',   value: selectedAcObj ? `${selectedAcObj.routes?.length || 0} routes` : '—', green: !!selectedAcObj },
                  ].map(({ label, value, mono, green }) => (
                    <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: '7px', padding: '0.625rem 0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{label}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: green ? 'var(--avg-green)' : 'var(--text-primary)', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Hub and aircraft are locked for 3 months. Staff can override if needed.
                </p>
                <button onClick={handleEnroll} disabled={!canEnroll || loading} className="btn btn-primary"
                  style={{ width: '100%', opacity: canEnroll ? 1 : 0.35 }}>
                  {loading ? 'Enrolling…' : 'Start Career Mode'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Career dashboard
function CareerDashboard({ status, onRefresh, fleetList, user }) {
  const navigate   = useNavigate();
  const [routes,   setRoutes]   = useState([]);
  const [routeLoading, setRL]   = useState(true);
  const [changing, setChanging] = useState(false);
  const [changeAc, setChangeAc] = useState('');
  const [changeHub, setChangeHub] = useState('');
  const [saving, setSaving]     = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [mobile, setMobile]     = useState(window.innerWidth <= 768);
  const [tablet, setTablet]     = useState(window.innerWidth <= 1024);
  const [liveFlight, setLiveFlight] = useState(null);
  const [showFerry, setShowFerry]         = useState(false);
  const [ferryStatus, setFerryStatus]     = useState(null);
  const [ferryDests, setFerryDests]       = useState([]);
  const [ferryDest, setFerryDest]         = useState('');
  const [ferryLoading, setFerryLoading]   = useState(false);

  useEffect(() => {
    const handler = () => {
      setMobile(window.innerWidth <= 768);
      setTablet(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Poll live map every 30s to check if pilot is currently flying (probably a bit OTT)
  useEffect(() => {
    if (!user?.if_user_id) return;
    const poll = async () => {
      try {
        const data = await liveMapApi.pilotFlight(user.if_user_id);
        setLiveFlight(data.flying ? data : null);
      } catch { setLiveFlight(null); }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [user?.if_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRoutes = useCallback(async () => {
    try {
      setRL(true);
      const data = await careerApi.routes();
      setRoutes(data.routes || []);
    } catch {
      setRoutes([]);
    } finally {
      setRL(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
    careerApi.ferryStatus().then(d => setFerryStatus(d)).catch(() => {});
  }, [loadRoutes]);

  const handleChange = async () => {
    if (!changeAc && !changeHub) return;
    try {
      setSaving(true);
      await careerApi.change({ aircraft: changeAc || undefined, hub: changeHub || undefined });
      showToast('Career settings updated!', 'success');
      setChanging(false);
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openFerry = async () => {
    setShowFerry(true);
    setFerryDest('');
    setFerryLoading(true);
    try {
      const data = await careerApi.ferryDestinations();
      setFerryDests(data.destinations || []);
    } catch { setFerryDests([]); }
    finally { setFerryLoading(false); }
  };

  const handleFerry = () => {
    if (!ferryDest) return;
    navigate('/log-flight', { state: { prefill: {
      flight_number:  'AVGFERRY',
      departure_icao: status.current_icao,
      arrival_icao:   ferryDest,
      aircraft:       status.aircraft,
      is_career:      true,
      is_ferry:       true,
    }}});
  };

  const doLeave = async () => {
    try {
      setSaving(true);
      await careerApi.leave();
      showToast('You have left Career Mode', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const daysUntilChange = status.next_change_date
    ? Math.ceil((new Date(status.next_change_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const acImage = fleetList.find(f => f.name === status.aircraft)?.image_url || null;
  const recentFlights = [...(status.flights || [])].reverse().slice(0, 8);
  const totalHoursDisplay = `${Math.floor(status.total_hours)}h ${Math.round((status.total_hours % 1) * 60)}m`;

  const parseAircraft = r => {
    try { const a = typeof r.aircraft === 'string' ? JSON.parse(r.aircraft) : r.aircraft; return Array.isArray(a) ? a[0] : a; }
    catch { return r.aircraft; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Hero */}
      <div style={{
        position: 'relative', borderRadius: '16px', overflow: 'hidden',
        background: 'var(--brand-deep)', marginBottom: '1.25rem', minHeight: mobile ? 200 : 260,
      }}>
        {acImage && (
          <img src={acImage} alt={status.aircraft}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 100%)' }} />
        <div style={{ position: 'relative', padding: mobile ? '1.25rem' : '1.75rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '1rem', minHeight: mobile ? 200 : 260 }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5a9e7a', marginBottom: '0.4rem' }}>Career Mode</div>
            <div style={{ fontSize: mobile ? '1.15rem' : '1.6rem', fontWeight: 900, color: 'white', lineHeight: 1.2, marginBottom: '0.35rem', wordBreak: 'break-word' }}>{status.aircraft}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{status.hub}</span>
              <span>·</span><span>{HUB_NAMES[status.hub]} hub</span>
              <span>·</span><span>Since {status.started_at ? new Date(status.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-accent)', marginBottom: '0.15rem' }}>
                Position
                {liveFlight && <span style={{ marginLeft: '0.5rem', color: '#4ade80' }}> Live</span>}
              </div>
              <div style={{ fontSize: mobile ? '2rem' : '3rem', fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand-accent)', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span>{status.current_icao || '—'}</span>
                {liveFlight?.destination && (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND.accent} strokeWidth="2.5" style={{ opacity: 0.6, flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <span>{liveFlight.destination.to}</span>
                  </>
                )}
              </div>
              {liveFlight && (
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'rgba(var(--brand-accent-rgb),0.5)', marginTop: '0.3rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span>{liveFlight.altitude.toLocaleString()}ft</span>
                  <span>·</span>
                  <span>{liveFlight.speed}kts</span>
                  {liveFlight.aircraft && (
                    <>
                      <span>·</span>
                      <span style={{ color: liveFlight.aircraft === status.aircraft ? 'rgba(74,222,128,0.75)' : 'rgba(255,200,100,0.65)' }}>
                        {liveFlight.aircraft === status.aircraft ? '✓ Correct aircraft' : '⚠ Wrong aircraft'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: liveFlight ? '1.4rem' : '0.25rem', flexWrap: 'wrap' }}>
              {[{ label: 'Flights', value: status.total_flights }, { label: 'Hours', value: totalHoursDisplay }].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '0.4rem 0.7rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '0.1rem' }}>{label}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white', fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile || tablet ? '1fr' : '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Left: departures + globe */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

          <div style={{ borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  Departures from <span style={{ fontFamily: 'monospace', color: 'var(--avg-green)' }}>{status.current_icao}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                  {routeLoading ? 'Loading…' : `${routes.length} route${routes.length !== 1 ? 's' : ''} available · ${status.aircraft}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {ferryStatus?.can_ferry && (
                  <button onClick={openFerry} style={{ background: 'none', border: '1px solid var(--avg-gold, var(--brand-accent))', borderRadius: '7px', padding: '0.3rem 0.7rem', cursor: 'pointer', color: 'var(--avg-gold, var(--brand-accent))', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}>
                    Ferry ✈
                  </button>
                )}
                <button onClick={loadRoutes} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '7px', padding: '0.3rem 0.6rem', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
                </button>
              </div>
            </div>
            {routeLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading…</div>
            ) : routes.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No routes from {status.current_icao} for {status.aircraft}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0,55px) minmax(0,1fr) auto' : 'minmax(0,70px) minmax(0,1fr) minmax(0,90px) auto', gap: '0.5rem', padding: '0.45rem 1.25rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', minWidth: 0 }}>
                  {['Flight', 'Route', ...(!mobile ? ['Duration'] : []), ''].map(h => (
                    <div key={h} style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{h}</div>
                  ))}
                </div>
                {routes.map((r, i) => {
                  const ac = parseAircraft(r);
                  return (
                    <div key={r.id}
                      onClick={() => navigate('/log-flight', { state: { prefill: { flight_number: r.flight_number, departure_icao: r.departure_icao, arrival_icao: r.arrival_icao, aircraft: typeof ac === 'string' ? ac : ac?.name || '', is_career: true }}})}
                      style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0,55px) minmax(0,1fr) auto' : 'minmax(0,70px) minmax(0,1fr) minmax(0,90px) auto', gap: '0.5rem', padding: '0.75rem 1.25rem', cursor: 'pointer', borderBottom: i < routes.length - 1 ? '1px solid var(--border-color)' : 'none', transition: 'background 0.12s', alignItems: 'center', minWidth: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.875rem', color: 'var(--avg-green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.flight_number}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.departure_icao}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ margin: '0 0.25rem', verticalAlign: 'middle' }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        {r.arrival_icao}
                      </span>
                      {!mobile && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.duration ? `${Math.floor(r.duration / 60)}h ${r.duration % 60}m` : '—'}</span>}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '5px', background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--avg-green)', whiteSpace: 'nowrap' }}>Fly →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Route map</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{status.flights?.length || 0} flights logged</span>
            </div>
            <CareerGlobe flights={status.flights || []} currentIcao={status.current_icao} />
          </div>

        </div>

        {/* Right: setup + recent + leave */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>

          <div style={{ borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem 0' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.875rem' }}>Your details</div>
              {[
                { label: 'Aircraft', value: status.aircraft },
                { label: 'Home hub', value: `${status.hub} — ${HUB_NAMES[status.hub] || ''}`, mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.55rem 0', borderBottom: '1px solid var(--border-color)', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: mono ? 'monospace' : undefined, color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word', minWidth: 0 }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0 1rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Change available</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: status.can_change_aircraft ? 'var(--avg-green)' : 'var(--text-secondary)' }}>
                  {status.can_change_aircraft ? 'Now' : `In ${daysUntilChange}d`}
                </span>
              </div>
            </div>
            {status.can_change_aircraft && (
              <div style={{ padding: '0 1.25rem 1rem' }}>
                {!changing ? (
                  <button onClick={() => { setChanging(true); setChangeAc(''); setChangeHub(''); }}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Change aircraft / hub
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <select value={changeAc} onChange={e => setChangeAc(e.target.value)} style={{ padding: '0.5rem', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'inherit' }}>
                      <option value="">Keep current aircraft</option>
                      {fleetList.map(ac => <option key={ac.id} value={ac.name}>{ac.name}</option>)}
                    </select>
                    <select value={changeHub} onChange={e => setChangeHub(e.target.value)} style={{ padding: '0.5rem', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'inherit' }}>
                      <option value="">Keep current hub</option>
                      {HUBS.map(h => <option key={h} value={h}>{h} — {HUB_NAMES[h]}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => setChanging(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={handleChange} disabled={saving || (!changeAc && !changeHub)} className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem', opacity: (!changeAc && !changeHub) ? 0.4 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Recent flights</div>
            </div>
            {recentFlights.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No flights yet — time to fly!</div>
            ) : recentFlights.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1.25rem', borderBottom: i < recentFlights.length - 1 ? '1px solid var(--border-color)' : 'none', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: 'var(--avg-green)', flexShrink: 0, minWidth: 42 }}>{f.flight_number || '—'}</span>
                <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.departure_icao} → {f.arrival_icao}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{f.flight_time ? `${Math.floor(f.flight_time)}h ${Math.round((f.flight_time % 1) * 60)}m` : ''}</span>
              </div>
            ))}
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid rgba(198,40,40,0.2)', background: 'var(--bg-card)', padding: '1rem 1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Leave Career Mode</div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>Resets all career stats. Cannot be undone.</p>
            <button onClick={() => setConfirmLeave(true)} disabled={saving} style={{ background: 'none', border: '1px solid #c62828', borderRadius: '7px', padding: '0.45rem 1rem', cursor: 'pointer', fontSize: '0.8rem', color: '#c62828', fontFamily: 'inherit', fontWeight: 600 }}>
              Leave Career Mode
            </button>
          </div>

        </div>
      </div>

      {showFerry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.25rem' }}>Ferry Flight</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              Reposition to any airport with {status.aircraft} routes. Counts toward hours. Once per week.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>From</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--avg-green)' }}>{status.current_icao}</div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Destination</div>
              {ferryLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading destinations…</div>
              ) : ferryDests.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No valid destinations found.</div>
              ) : (
                <Dropdown
                  value={ferryDest}
                  onChange={v => setFerryDest(v)}
                  placeholder="Select destination…"
                  options={[{ value: '', label: 'Select destination…' }, ...ferryDests.map(d => ({ value: d, label: d }))]}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowFerry(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleFerry} disabled={!ferryDest} className="btn btn-primary" style={{ flex: 1, opacity: ferryDest ? 1 : 0.4 }}>
                File Ferry PIREP →
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <ConfirmModal
          title="Leave Career Mode?"
          message="Your career stats will be reset and cannot be recovered. This cannot be undone."
          confirmLabel="Leave Career Mode"
          danger
          onConfirm={doLeave}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

// Main
export default function Career({ user }) {
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [fleet,   setFleet]   = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [statusData, fleetData] = await Promise.all([
        careerApi.status(),
        fleetApi.list().catch(() => ({ fleet: [] })),
      ]);
      setStatus(statusData);
      const flatFleet = (fleetData.fleet || []).flatMap(group => group.liveries || []);
      setFleet(flatFleet);
    } catch (err) {
      showToast('Failed to load career data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✈️</div>
      Loading career data…
    </div>
  );

  return (
    <div style={{ overflowX: 'hidden', minWidth: 0 }}>
      {!status?.enrolled ? (
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: 800 }}>Career Mode</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Fly a single aircraft type from your chosen hub, tracking your position with every landing.
            </p>
          </div>
          <EnrollFlow onEnrolled={load} />
        </>
      ) : (
        <CareerDashboard status={status} onRefresh={load} fleetList={fleet} user={user} />
      )}
    </div>
  );
}
