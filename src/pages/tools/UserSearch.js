/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { infiniteFlight as ifApi } from '../../api/client';
import RunwayDiagram from '../../components/RunwayDiagram';

const MS_TO_FPM    = 196.85;
const SERVER_COLOR = { Expert: 'var(--brand-primary)', Training: '#e65100', Casual: 'var(--text-secondary)', Staging: '#6b6b63', Private: '#8e44ad' };
const GRADE_COLOR  = { 1: '#909090', 2: '#1976d2', 3: 'var(--brand-primary)', 4: 'var(--brand-accent)', 5: '#c62828' };
const GRADE_BG     = { 1: 'rgba(144,144,144,0.08)', 2: 'rgba(25,118,210,0.08)', 3: 'rgba(var(--brand-primary-rgb),0.08)', 4: 'rgba(var(--brand-accent-rgb),0.08)', 5: 'rgba(198,40,40,0.08)' };

function FlightDetailPopover({ flight, liveryMap, onClose }) {
  if (!flight) return null;
  const landings = flight.landingStats || [];
  const aircraft = liveryMap[flight.liveryId] || null;

  function landingGrade(vsFpm, gForce) {
    let grade = vsFpm <= 100 ? 'A' : vsFpm <= 200 ? 'B' : vsFpm <= 300 ? 'C' : vsFpm <= 500 ? 'D' : 'F';
    if (gForce > 1.5 && grade !== 'F') grade = String.fromCharCode(grade.charCodeAt(0) + 1);
    return grade;
  }

  const diagramLandings = landings
    .filter(l => l.distanceFrom1kftMarker != null)
    .map(l => {
      const vsFpm = Math.abs(Math.round((l.verticalSpeed || 0) * MS_TO_FPM));
      const gForce = l.maxGForce || 0;
      return {
        vs_fpm: vsFpm, g_force: parseFloat(gForce.toFixed(2)), grade: landingGrade(vsFpm, gForce),
        dist_1k_ft: l.distanceFrom1kftMarker, centerline: l.centerlineDistance,
        dep: flight.originAirport, arr: flight.destinationAirport,
      };
    });

  function fmtSecs(s) {
    if (s == null) return null;
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', padding: '1.25rem', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              {flight.originAirport || '????'} → {flight.destinationAirport || '????'}
            </div>
            {aircraft && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{aircraft}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1, padding: 2 }}>✕</button>
        </div>

        {diagramLandings.length > 0 && (
          <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '0.75rem', marginBottom: '1.1rem' }}>
            <RunwayDiagram landings={diagramLandings} />
          </div>
        )}

        {/* Per-landing detail cards */}
        {landings.length > 0 && (
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
              Landing{landings.length > 1 ? 's' : ''}
            </div>
            {landings.map((l, i) => {
              const vsFpm    = Math.abs(Math.round((l.verticalSpeed || 0) * MS_TO_FPM));
              const gForce   = l.maxGForce != null ? parseFloat(l.maxGForce.toFixed(2)) : null;
              const dist1k   = l.distanceFrom1kftMarker != null ? Math.round(l.distanceFrom1kftMarker) : null;
              const center   = l.centerlineDistance != null ? parseFloat(l.centerlineDistance.toFixed(1)) : null;
              const gsKts    = l.groundSpeed != null ? Math.round(l.groundSpeed * 1.94384) : null; // m/s -> kts
              const iasKts   = l.indicatedAirspeed != null ? Math.round(l.indicatedAirspeed) : null;
              const rollM    = l.groundRollDistance != null ? Math.round(l.groundRollDistance) : null;
              const sinceLast = fmtSecs(l.timeSinceLastLanding);
              const { label, color } = vsGrade(vsFpm);
              return (
                <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '0.75rem', marginBottom: i < landings.length - 1 ? '0.5rem' : 0 }}>
                  {landings.length > 1 && (
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Landing {i + 1}{sinceLast ? ` · ${sinceLast} after previous` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color, background: `${color}18`, padding: '3px 10px', borderRadius: 6 }}>{label}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {vsFpm.toLocaleString()} <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-secondary)' }}>fpm</span>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '0.4rem' }}>
                    {gForce != null && <MiniStat label="G-force" value={`${gForce}g`} warn={gForce > 1.5} />}
                    {dist1k != null && <MiniStat label="1,000ft dist" value={`${dist1k.toLocaleString()} ft`} />}
                    {center != null && <MiniStat label="Centerline" value={`${center} m`} warn={Math.abs(center) > 20} />}
                    {gsKts != null && <MiniStat label="Ground speed" value={`${gsKts} kts`} />}
                    {iasKts != null && <MiniStat label="IAS" value={`${iasKts} kts`} />}
                    {rollM != null && <MiniStat label="Roll distance" value={`${rollM.toLocaleString()} m`} />}
                    {gForce == null && dist1k == null && center == null && gsKts == null && iasKts == null && rollM == null && (
                      <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No additional data available.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

function MiniStat({ label, value, warn }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 6, padding: '0.45rem 0.65rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: '0.62rem', lineHeight: 1.25, height: '2.5em', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, display: 'flex', alignItems: 'flex-end' }}>{label}</div>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: warn ? '#e65100' : 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

function fmtDecMins(m) {
  if (!m && m !== 0) return '—';
  const t = Math.round(m), h = Math.floor(t / 60), mn = t % 60;
  return h === 0 ? `${mn}m` : `${h}h ${mn}m`;
}
function fmtTotalMins(m) {
  if (!m) return '0h';
  const h = Math.floor(m / 60), mn = m % 60;
  return mn > 0 ? `${h}h ${mn}m` : `${h}h`;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
}
function vsGrade(fpm) {
  if (fpm <= 100) return { label: 'Butter', color: 'var(--brand-primary)' };
  if (fpm <= 250) return { label: 'Smooth', color: 'var(--brand-primary)' };
  if (fpm <= 500) return { label: 'Kirill cant land', color: 'var(--brand-accent)' };
  if (fpm <= 800) return { label: 'Hard',   color: '#e65100' };
  return                  { label: 'Average Kirill Landing',  color: '#c62828' };
}
function avatarUrl(username) {
  return `https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${username.toLowerCase()}/288/1487666_2.png`;
}

export default function UserSearch() {
  const [query,     setQuery]     = useState('');
  const [user,      setUser]      = useState(null);
  const [flights,   setFlights]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [fLoading,  setFLoading]  = useState(false);
  const [notFound,  setNotFound]  = useState(false);
  const [error,     setError]     = useState(null);
  const [imgErr,    setImgErr]    = useState(false);
  const [openFlight, setOpenFlight] = useState(null); // { idx, flight }
  const [liveryMap, setLiveryMap] = useState({});

  useEffect(() => {
    ifApi.aircraftLiveryMap().then(d => setLiveryMap(d.map || {})).catch(() => {});
  }, []);

  const search = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setFLoading(true); setUser(null); setFlights([]); setNotFound(false); setError(null); setImgErr(false);
    try {
      const data = await ifApi.userStats(q);
      const u = data.result?.[0];
      if (!u) { setNotFound(true); setFLoading(false); return; }
      setUser(u);
      setLoading(false);
      if (u.userId) {
        ifApi.userFlights(u.userId)
          .then(fd => {
            const raw = fd.result?.data || fd.result || [];
            setFlights(Array.isArray(raw) ? raw : []);
          })
          .catch(() => setFlights([]))
          .finally(() => setFLoading(false));
      } else {
        setFLoading(false);
      }
    } catch {
      setError('Failed to reach Infinite Flight API.');
      setLoading(false);
      setFLoading(false);
    }
  };

  const gc = user ? (GRADE_COLOR[user.grade] || 'var(--text-secondary)') : null;
  const gb = user ? (GRADE_BG[user.grade]    || 'var(--bg-secondary)')   : null;
  const ifc = user?.discourseUsername;

  return (
    <div>

      {/* Search */}
      <form onSubmit={search} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', maxWidth: 520 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="IFC username…"
            style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
            onFocus={e => e.target.style.borderColor = 'var(--avg-green)'}
            onBlur={e  => e.target.style.borderColor = 'var(--border-color)'} />
        </div>
        <button type="submit" disabled={loading || !query.trim()}
          style={{ padding: '0.7rem 1.4rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit', opacity: loading || !query.trim() ? 0.6 : 1, flexShrink: 0 }}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {notFound && (
        <div style={{ padding: '1.1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          No user found for "<strong style={{ color: 'var(--text-primary)' }}>{query}</strong>". Check the exact IFC username.
        </div>
      )}
      {error && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.2)', borderRadius: 10, color: '#c62828', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {user && (
        <>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Sidebar */}
            <div className="us-sidebar" style={{ width: 240, flexShrink: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.5rem', textAlign: 'center', boxShadow: '0 1px 3px var(--shadow)' }}>
              {ifc && !imgErr ? (
                <img src={avatarUrl(ifc)} alt={ifc} onError={() => setImgErr(true)}
                  style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${gc}`, display: 'block', margin: '0 auto 0.9rem' }} />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: '50%', background: gb, border: `3px solid ${gc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.9rem' }}>
                  <span style={{ fontWeight: 900, fontSize: '1.5rem', color: gc }}>{(ifc || query)[0]?.toUpperCase()}</span>
                </div>
              )}

              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {user.username || ifc || query}
              </div>
              {ifc && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2, marginBottom: user.roles?.length > 0 ? '0.6rem' : '0.9rem' }}>@{ifc}</div>
              )}
              {user.roles?.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '0.9rem' }}>
                  {user.roles.map(r => (
                    <span key={r} style={{ padding: '0.15rem 0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{r}</span>
                  ))}
                </div>
              )}

              <div style={{ display: 'inline-block', padding: '0.3rem 0.9rem', background: gb, border: `1.5px solid ${gc}`, borderRadius: 20, marginBottom: '1.1rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: gc }}>GRADE {user.grade}</span>
              </div>

              {[
                { label: 'Flight Time', value: fmtTotalMins(user.flightTime) },
                { label: 'Flights',     value: (user.onlineFlights ?? 0).toLocaleString() },
                { label: 'Landings',    value: (user.landingCount ?? 0).toLocaleString() },
                { label: 'XP',          value: (user.xp ?? 0).toLocaleString() },
                { label: 'Violations',  value: (user.violations ?? 0).toLocaleString(), color: (user.violations ?? 0) > 50 ? '#c62828' : undefined },
                { label: 'ATC Ops',     value: (user.atcOperations ?? 0).toLocaleString() },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderTop: i === 0 ? '1px solid var(--border-color)' : 'none', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Main content */}
            <div style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ margin: '0 0 0.9rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Recent Flights</h3>

          {openFlight && (
            <FlightDetailPopover flight={openFlight.flight} liveryMap={liveryMap} onClose={() => setOpenFlight(null)} />
          )}

          {fLoading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <div style={{ width: 22, height: 22, border: '2px solid var(--border-color)', borderTop: '2px solid var(--avg-green)', borderRadius: '50%', animation: 'us-spin 0.7s linear infinite', margin: '0 auto 0.6rem' }} />
              Loading flights…
            </div>
          ) : flights.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No recent flights found.</p>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px var(--shadow)' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    {[
                      ['Route',    'left'],
                      ['Aircraft', 'left'],
                      ['Duration', 'right'],
                      ['Landing',  'right'],
                      ['Fuel',     'right'],
                      ['Server',   'right'],
                      ['Date',     'right'],
                    ].map(([h, a]) => (
                      <th key={h} style={{ padding: '0.6rem 1rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: a, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flights.slice(0, 20).map((f, i) => {
                    const aircraft   = liveryMap[f.liveryId] || '—';
                    const landings   = f.landingStats || [];
                    const first      = landings[0];
                    const fpm        = first ? Math.abs(Math.round((first.verticalSpeed || 0) * MS_TO_FPM)) : null;
                    const gf         = first?.maxGForce != null ? first.maxGForce.toFixed(2) : null;
                    const grade      = fpm != null ? vsGrade(fpm) : null;
                    const fuel       = f.fuelUsedKg ?? null;
                    const sc         = SERVER_COLOR[f.server] || 'var(--text-secondary)';

                    return (
                      <tr key={f.id || i} style={{ borderBottom: i < 19 ? '1px solid var(--border-color)' : 'none', background: i % 2 === 1 ? 'var(--bg-secondary)' : 'transparent' }}>
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {f.originAirport || '????'} → {f.destinationAirport || '????'}
                          </span>
                          {landings.length > 1 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 6 }}>{landings.length} ldg</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {aircraft}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {fmtDecMins(f.totalTime)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {grade ? (
                            <button
                              onClick={() => setOpenFlight(openFlight?.idx === i ? null : { idx: i, flight: f })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right', fontFamily: 'inherit' }}
                              title="Click for landing details"
                            >
                              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: grade.color }}>{grade.label} ↗</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fpm.toLocaleString()} fpm{gf ? ` · ${gf}g` : ''}</div>
                            </button>
                          ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {fuel != null ? `${Math.round(fuel).toLocaleString()} kg` : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 600, color: sc, whiteSpace: 'nowrap' }}>
                          {f.server || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {f.created ? fmtDate(f.created) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes us-spin { to { transform: rotate(360deg); } }
        /* Sidebar is a fixed 240px so it sits neatly beside the flight log on
           desktop. On a phone it wraps below (flexWrap on the parent already
           does that), but 240px still leaves a chunk of dead space on the
           right of it since it never grows — this makes it take the full
           row once wrapped, instead of stranding it at a fixed width. */
        @media (max-width: 640px) {
          .us-sidebar { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
