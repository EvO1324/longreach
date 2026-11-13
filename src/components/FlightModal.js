/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { getAirport } from '../services/airportService';
import { RegTag } from './AircraftLabel';
import PirepThread from './PirepThread';

function FlightModal({ flight, fleetData, onClose, userId }) {
  const [airports, setAirports] = useState({ dep: null, arr: null });

  const aircraftRecord = fleetData?.find(ac => ac.name === flight.aircraft);
  const aircraftImage  = aircraftRecord?.image_url || null;

  useEffect(() => {
    Promise.all([
      getAirport(flight.departure_icao),
      getAirport(flight.arrival_icao),
    ]).then(([dep, arr]) => setAirports({ dep, arr }));
  }, [flight]);

  const fmtDuration = h => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
  const fmtDate     = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const MS_TO_FPM = 196.85;
  const GRADE_COLOR = { A: '#2e7d32', B: '#558b2f', C: '#f57f17', D: '#e65100', F: '#c62828' };
  const GRADE_BG    = { A: 'rgba(46,125,50,0.12)', B: 'rgba(85,139,47,0.12)', C: 'rgba(245,127,23,0.12)', D: 'rgba(230,81,0,0.12)', F: 'rgba(198,40,40,0.12)' };

  const landingStats = flight.landing_stats
    ? (typeof flight.landing_stats === 'string' ? JSON.parse(flight.landing_stats) : flight.landing_stats)
    : [];

  const getGrade = (vs, g) => {
    let gr = vs <= 100 ? 'A' : vs <= 200 ? 'B' : vs <= 300 ? 'C' : vs <= 500 ? 'D' : 'F';
    if (g > 1.5 && gr !== 'F') gr = String.fromCharCode(gr.charCodeAt(0) + 1);
    return gr;
  };

  const stats = [
    { label: 'Date',     value: fmtDate(flight.date) },
    { label: 'Duration', value: fmtDuration(flight.flight_time) },
    ...(flight.distance_nm ? [{ label: 'Distance', value: `${Math.round(flight.distance_nm).toLocaleString()} nm` }] : []),
    ...(flight.fuel_used_kg != null ? [{ label: 'Fuel Used', value: `${Math.round(flight.fuel_used_kg).toLocaleString()} kg` }] : []),
    ...(flight.multiplier_value ? [{ label: 'Multiplier', value: `×${flight.multiplier_value}${flight.multiplier_name ? ` ${flight.multiplier_name}` : ''}`, gold: true }] : []),
    ...(flight.notes ? [{ label: 'Notes', value: flight.notes, wide: true }] : []),
  ];

  const nonWideCount = stats.filter(s => !s.wide).length;

  const statusStyle = {
    approved: { bg: 'var(--avg-green-pale)', color: 'var(--avg-green)',  border: 'rgba(var(--brand-primary-rgb),0.25)' },
    pending:  { bg: '#fff8e1',              color: '#e65100',            border: 'rgba(230,81,0,0.25)'  },
    rejected: { bg: '#ffebee',              color: '#c62828',            border: 'rgba(198,40,40,0.25)' },
  };
  const ss = statusStyle[flight.status] || statusStyle.pending;

  return (
    <>
      <style>{`
        @keyframes fmSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fm-panel { animation: fmSlideDown 0.18s ease-out; }
        .fm-icao  { font-size: 36px; }
        .fm-cols  { grid-template-columns: repeat(${Math.min(nonWideCount, 4)}, 1fr); }
        @media (max-width: 600px) {
          .fm-icao { font-size: 24px !important; }
          .fm-cols { grid-template-columns: 1fr 1fr !important; }
          .fm-hero { height: 200px !important; }
        }
      `}</style>

      <div
        className="fm-panel"
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 20px var(--shadow-hover)',
          background: 'var(--bg-card)',
          margin: '0 0 0.5rem',
        }}
      >
        {/* Hero */}
        <div
          className="fm-hero"
          style={{ position: 'relative', height: 260, background: '#0f172a', overflow: 'hidden' }}
        >
          {aircraftImage && (
            <img
              src={aircraftImage}
              alt={flight.aircraft}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.88) 100%)' }} />

          {/* Top row */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>{flight.flight_number}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{flight.aircraft}</span>
              <RegTag registration={flight.registration} onDark />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                {flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}
              </span>
              {onClose && (
                <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: '1rem', lineHeight: 1 }}>×</button>
              )}
            </div>
          </div>

          {/* Route */}
          <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18, zIndex: 2, display: 'grid', gridTemplateColumns: '1fr 44px 1fr', alignItems: 'center', gap: 8 }}>
            <div>
              <div className="fm-icao" style={{ fontWeight: 800, fontFamily: 'monospace', color: 'white', lineHeight: 1, letterSpacing: '-1px' }}>
                {flight.departure_icao}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>
                {airports.dep?.city || airports.dep?.name || ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.2)' }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fm-icao" style={{ fontWeight: 800, fontFamily: 'monospace', color: 'white', lineHeight: 1, letterSpacing: '-1px' }}>
                {flight.arrival_icao}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>
                {airports.arr?.city || airports.arr?.name || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '16px 20px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
          <div className="fm-cols" style={{ display: 'grid', gap: '14px 12px' }}>
            {stats.map((s, i) => (
              <div key={i} style={s.wide ? { gridColumn: '1 / -1' } : {}}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 4 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.gold ? 'var(--avg-gold-dark)' : 'var(--text-primary)', lineHeight: 1.4 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Landing stats */}
          {landingStats.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 10 }}>
                {landingStats.length === 1 ? 'Landing' : 'Landings'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {landingStats.map((l, i) => {
                  const vsFpm = Math.abs(Math.round((l.verticalSpeed || 0) * MS_TO_FPM));
                  const g     = parseFloat((l.maxGForce || 0).toFixed(2));
                  const grade = getGrade(vsFpm, g);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: GRADE_BG[grade], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontWeight: 900, fontSize: 14, color: GRADE_COLOR[grade] }}>{grade}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {vsFpm} fpm · {g}g
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          VS {vsFpm <= 100 ? 'Smooth' : vsFpm <= 200 ? 'Good' : vsFpm <= 300 ? 'Firm' : vsFpm <= 500 ? 'Hard' : 'Very Hard'}
                        </div>
                      </div>
                      {landingStats.length > 1 && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>#{i + 1}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {userId && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
              <PirepThread flightId={flight.id} userId={userId} emptyText="Question about this PIREP? Ask staff here." />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default FlightModal;
