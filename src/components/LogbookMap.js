/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import { loadAirportDb } from '../services/airportService';
import { colors as BRAND } from '../brand';

const GlobeView = memo(function GlobeView({ arcs, points }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const arcsRef = useRef(arcs);
  const pointsRef = useRef(points);
  const [ready, setReady] = useState(!!window.Globe);

  useEffect(() => {
    if (window.Globe) { setReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/globe.gl@2.27.2/dist/globe.gl.min.js';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !mountRef.current || globeRef.current) return;

    const globe = window.Globe()
      .globeImageUrl('/earth-dark.jpg')
      .backgroundImageUrl('/night-sky.png')
      .arcsData(arcsRef.current)
      .arcColor(() => [`rgba(${BRAND.accentRgb}, 0.2)`, `rgba(${BRAND.accentRgb}, 0.95)`])
      .arcAltitudeAutoScale(0.35)
      .arcStroke(0.4)
      .arcDashLength(1)
      .arcDashGap(0)
      .arcDashAnimateTime(0)
      .pointsData(pointsRef.current)
      .pointLat('lat').pointLng('lng')
      .pointColor(() => '#ffffff')
      .pointAltitude(0.005).pointRadius(0.25)
      .pointLabel(d => `<div style="background:rgba(0,0,0,0.75);padding:4px 8px;border-radius:6px;font-size:11px;color:white;white-space:nowrap"><strong>${d.icao}</strong>${d.city ? `<br/>${d.city}` : ''}</div>`)
      .width(mountRef.current.clientWidth)
      .height(420)(mountRef.current);

    globeRef.current = globe;
    globe.pointOfView({ lat: -25, lng: 133, altitude: 2 }, 0);

    const handleResize = () => { if (mountRef.current) globe.width(mountRef.current.clientWidth); };
    window.addEventListener('resize', handleResize);

    const mountEl = mountRef.current;
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountEl) mountEl.innerHTML = '';
      globeRef.current = null;
    };
  }, [ready]);

  return <div ref={mountRef} style={{ height: 420, width: '100%', background: '#000' }} />;
});

function LogbookMap({ flights }) {
  const [visible, setVisible] = useState(true);
  const [airportDb, setAirportDb] = useState(null);

  useEffect(() => {
    loadAirportDb()
      .then(setAirportDb)
      .catch(() => setAirportDb({}));
  }, []);

  const { arcs, points, routeCount } = useMemo(() => {
    if (!airportDb) return { arcs: [], points: [], routeCount: 0 };
    const approved = flights.filter(f => f.status === 'approved' && f.departure_icao && f.arrival_icao);
    const arcList = [];
    const pointMap = {};
    for (const flight of approved) {
      const dep = airportDb[flight.departure_icao?.toUpperCase()];
      const arr = airportDb[flight.arrival_icao?.toUpperCase()];
      if (!dep || !arr) continue;
      arcList.push({ startLat: dep.lat, startLng: dep.lng, endLat: arr.lat, endLng: arr.lng });
      if (!pointMap[flight.departure_icao]) pointMap[flight.departure_icao] = { lat: dep.lat, lng: dep.lng, icao: flight.departure_icao, city: dep.city };
      if (!pointMap[flight.arrival_icao])   pointMap[flight.arrival_icao]   = { lat: arr.lat, lng: arr.lng, icao: flight.arrival_icao,   city: arr.city };
    }
    return { arcs: arcList, points: Object.values(pointMap), routeCount: approved.length };
  }, [flights, airportDb]);

  if (routeCount === 0 || !airportDb) return null;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: visible ? '1px solid var(--border-color)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Flight Map</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '0.15rem 0.6rem', borderRadius: '10px' }}>
            {routeCount} route{routeCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={() => setVisible(v => !v)} style={{
          background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
          padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600,
        }}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {visible && <GlobeView arcs={arcs} points={points} />}
    </div>
  );
}

export default LogbookMap;
