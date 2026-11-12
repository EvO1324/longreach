/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import Loader from '../components/Loader';
import { rotw as rotwApi, fleet as fleetApi, airlines as airlinesApi } from '../api/client';
import { getAirport } from '../services/airportService';
import { useNavigate } from 'react-router-dom';

const DAYS        = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

function toISODate(d) {
  if (typeof d === 'string') return d.split('T')[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISODate(d);
}
function addDays(date, n) {
  // Accept either a Date object or a YYYY-MM-DD string
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function parseLocalDate(dateStr) {
  // Parse YYYY-MM-DD as local time, not UTC
  return new Date(dateStr + 'T00:00:00');
}
function fmtMins(mins)     { return mins ? `${Math.floor(mins/60)}h ${mins%60}m` : '—'; }
function getAircraft(route) {
  if (!route?.aircraft) return [];
  if (Array.isArray(route.aircraft)) return route.aircraft;
  const t = String(route.aircraft).trim();
  if (t.startsWith('[')) { try { return JSON.parse(t); } catch (_) {} }
  return t ? [t] : [];
}

function RoutesOfTheWeek() {
  const [loading, setLoading]         = useState(true);
  // dateRouteMap: { "YYYY-MM-DD": { routes: [...enriched], weekStart, posted, weekLabel } }
  const [dateRouteMap, setDateRouteMap] = useState({});
  const [airlineMap, setAirlineMap]     = useState({});
  const [viewMonth, setViewMonth]     = useState(() => {
    const shifted = new Date(new Date().getTime() - 6 * 60 * 60 * 1000);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();

  const now = new Date();

  function getRotwDate(date) {
    const shifted = new Date(date.getTime() - 6 * 60 * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const todayISO = getRotwDate(now);

  function getNext0600UTC() {
    const now    = new Date();
    const target = new Date(now);
    target.setUTCHours(6, 0, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    return target;
  }

  function fmtCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const [countdown, setCountdown] = useState(() => fmtCountdown(getNext0600UTC().getTime() - Date.now()));

  useEffect(() => {
    function tick() {
      setCountdown(fmtCountdown(getNext0600UTC().getTime() - Date.now()));
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [scheduleData, fleetData, airlinesData] = await Promise.all([
          rotwApi.getSchedule().catch(() => ({ weeks: [] })),
          fleetApi.list().catch(() => ({ fleet: [] })),
          airlinesApi.list().catch(() => ({ airlines: [] })),
        ]);

        const am = {};
        (airlinesData.airlines || []).forEach(a => { am[a.code.toUpperCase()] = a; });
        setAirlineMap(am);

        // Build fleet livery map
        const fm = {};
        (fleetData.fleet || []).forEach(g => g.liveries?.forEach(l => {
          fm[l.name || `${g.type} - ${l.livery_name}`] = l.livery_name || null;
        }));

        const weeks = scheduleData.weeks || [];

        // Build dateRouteMap by enriching each slot with airport data
        const drm = {};

        await Promise.all(weeks.map(async week => {
          // Group slots by day
          const byDay = {};
          for (const slot of (week.slots || [])) {
            if (!byDay[slot.day]) byDay[slot.day] = [];
            byDay[slot.day].push(slot);
          }

          await Promise.all(DAYS.map(async (day, di) => {
            const daySlots = byDay[day] || [];
            if (!daySlots.length) return;

            const mondayStr = getMondayOf(week.week_start);
            const dateStr   = toISODate(addDays(mondayStr, di));
            const enriched = [];
            for (const slot of daySlots) {
              const r = slot.route;
              if (!r) continue;
              const [dep, arr] = await Promise.all([
                getAirport(r.departure_icao),
                getAirport(r.arrival_icao),
              ]);
              const ac = getAircraft(r);
              enriched.push({
                ...r,
                slotId:        slot.id,
                bidirectional: slot.bidirectional,
                depCity:       dep?.city || null,
                arrCity:       arr?.city || null,
                livery:        ac.length > 0 ? (fm[ac[0]] || ac[0]?.split(' - ')[1] || null) : null,
                multiplier:    slot.multiplier || null,
                isReturn:      false,
              });
              if (slot.bidirectional && slot.return_route) {
                const ret = slot.return_route;
                const [retDep, retArr] = await Promise.all([
                  getAirport(ret.departure_icao),
                  getAirport(ret.arrival_icao),
                ]);
                const retAc = getAircraft(ret);
                enriched.push({
                  ...ret,
                  slotId:        slot.id + '_return',
                  bidirectional: false,
                  depCity:       retDep?.city || null,
                  arrCity:       retArr?.city || null,
                  livery:        retAc.length > 0 ? (fm[retAc[0]] || retAc[0]?.split(' - ')[1] || null) : null,
                  multiplier:    slot.return_multiplier || null,
                  isReturn:      true,
                });
              }
            }

            drm[dateStr] = {
              routes:     enriched,
              weekStart:  week.week_start,
              posted:     week.posted,
              weekLabel:  week.week_label,
            };
          }));
        }));

        setDateRouteMap(drm);

        // Default selection: today if it has routes
        if (drm[todayISO]?.routes?.length > 0) {
          setSelectedDate(todayISO);
        }
      } catch (err) {
        console.error('ROTW error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilePirep = (route) => {
    const ac = getAircraft(route);
    navigate('/log-flight', {
      state: { prefill: {
        flight_number:        route.flight_number,
        departure_icao:       route.departure_icao,
        arrival_icao:         route.arrival_icao,
        aircraft:             ac[0] || '',
        allowedAircraft:      ac.length > 0 ? ac : null,
        bypassRankRestriction: true, // ROTW bypasses rank aircraft restrictions
        multiplier:           route.multiplier
          ? { id: route.multiplier.id, code: route.multiplier.code, name: route.multiplier.name, value: route.multiplier.value }
          : null,
      }},
    });
  };

  const goToday = useCallback(() => {
    const d = new Date(todayISO + 'T00:00:00');
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayDate        = new Date(todayISO + 'T00:00:00');
  const isCurrentMonth   = viewMonth.year === todayDate.getFullYear() && viewMonth.month === todayDate.getMonth();
  const selectedEntry    = selectedDate ? dateRouteMap[selectedDate] : null;
  const selectedRoutes   = selectedEntry?.routes || [];
  const selectedIsLive    = selectedEntry?.posted && selectedDate === todayISO;
  const selectedIsExpired = selectedDate && selectedDate < todayISO;
  const hasAnyRoutes     = Object.keys(dateRouteMap).length > 0;

  // Build the week containing the selected date (or today)
  const pivotDate = selectedDate || todayISO;
  const weekStart = getMondayOf(pivotDate);
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      <style>{`
        .rotw-strip-day {
          display: flex; flex-direction: column; align-items: center;
          padding: 0.75rem 0.25rem; cursor: default; flex: 1;
          border-right: 1px solid var(--border-color); transition: background 0.1s;
          position: relative;
        }
        .rotw-strip-day:last-child { border-right: none; }
        .rotw-strip-day.has-routes { cursor: pointer; }
        .rotw-strip-day.has-routes:hover { background: rgba(var(--brand-primary-rgb),0.04); }
        .rotw-strip-day.is-selected { background: rgba(var(--brand-primary-rgb),0.07); }
        .rotw-strip-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-secondary); margin-bottom: 0.35rem; }
        .rotw-strip-num { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; margin-bottom: 0.3rem; }
        .rotw-strip-dot { width: 5px; height: 5px; border-radius: 50%; }
        .rotw-mobile-card { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); }
        .rotw-mobile-card:last-child { border-bottom: none; }
        .rotw-route-row { transition: background 0.1s; }
        .rotw-route-row:hover { background: var(--bg-hover); }
        .rotw-route-row:last-child { border-bottom: none !important; }
        .rotw-legs { display: flex; align-items: center; flex: 1; gap: 1rem; min-width: 0; }
        .rotw-leg-divider { width: 1px; align-self: stretch; background: var(--border-color); flex-shrink: 0; opacity: 0.6; }
        @media (max-width: 600px) {
          .rotw-legs { flex-direction: column; align-items: stretch; gap: 0.75rem; }
          .rotw-leg-divider { width: 100%; height: 1px; align-self: auto; }
        }
        @media (max-width: 500px) {
          /* the 4 summary stats don't fit in a row on a phone: 2 x 2 grid instead */
          .rotw-stats { display: grid !important; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem !important; }
          .rotw-stats-divider { display: none; }
          .rotw-strip-day { padding: 0.6rem 0.1rem; }
          .rotw-strip-num { width: 26px; height: 26px; font-size: 0.82rem; }
        }
      `}</style>

      <div className="page-header">
        <h2>Routes of the Week</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Featured routes — updated every Monday
        </p>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader size={80} />
        </div>
      ) : (
        <>
          {(() => {
            const weekEntries   = weekDays.map(d => ({ date: d, entry: dateRouteMap[d] })).filter(x => x.entry);
            const weekRoutes    = weekEntries.flatMap(({ entry }) => entry.routes || []);
            const flyableRoutes = weekEntries.filter(({ date }) => date >= todayISO).flatMap(({ entry }) => entry.routes || []);
            const withMultiplier = flyableRoutes.filter(r => r.multiplier);
            const airports      = new Set();
            weekRoutes.forEach(r => { if (r.departure_icao) airports.add(r.departure_icao); if (r.arrival_icao) airports.add(r.arrival_icao); });
            const aircraftTypes = new Set();
            weekRoutes.forEach(r => getAircraft(r).forEach(a => aircraftTypes.add(String(a).split(' - ')[0])));
            const featured = withMultiplier.length > 0
              ? withMultiplier.reduce((best, r) => (r.multiplier.value > (best.multiplier?.value || 0) ? r : best), withMultiplier[0])
              : null;

            if (weekRoutes.length === 0) return null;

            return (
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div className="card rotw-stats" style={{ flex: '2 1 320px', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0.9rem 1.25rem', gap: '1.75rem' }}>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1 }}>{weekRoutes.length}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>routes this week</div>
                  </div>
                  <div className="rotw-stats-divider" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)' }} />
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1, color: withMultiplier.length > 0 ? 'var(--avg-gold)' : 'var(--text-primary)' }}>{withMultiplier.length}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>with a multiplier</div>
                  </div>
                  <div className="rotw-stats-divider" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)' }} />
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1 }}>{airports.size}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>airports featured</div>
                  </div>
                  <div className="rotw-stats-divider" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)' }} />
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1 }}>{aircraftTypes.size}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>aircraft types</div>
                  </div>
                </div>

                {featured && (
                  <div className="card" style={{
                    flex: '1 1 280px', padding: '0.9rem 1.1rem', borderLeft: '3px solid var(--avg-gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--avg-gold)' }}>Best multiplier this week</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{featured.flight_number}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {featured.departure_icao} → {featured.arrival_icao} · ×{featured.multiplier.value} {featured.multiplier.name || featured.multiplier.code}
                      </div>
                    </div>
                    <button onClick={() => handleFilePirep(featured)} className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.5rem 0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Fly this
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Week nav card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>

            {/* Month label + legend row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 1, height: 14, background: 'var(--border-color)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--avg-green)', display: 'inline-block' }} />
                  Live
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--avg-gold)', display: 'inline-block' }} />
                  Multiplier
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)', display: 'inline-block', opacity: 0.4 }} />
                  Upcoming
                </div>
                {!isCurrentMonth && (
                  <button onClick={goToday} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.25rem 0.625rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* Day strip with arrows either end */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {/* Prev arrow */}
              <button onClick={() => {
                const prev = addDays(weekStart, -7);
                const prevDate = parseLocalDate(prev);
                setViewMonth({ year: prevDate.getFullYear(), month: prevDate.getMonth() });
                const prevEntry = Array.from({ length: 7 }, (_, i) => addDays(prev, i)).find(d => dateRouteMap[d]);
                setSelectedDate(prevEntry || addDays(weekStart, -7));
              }} style={{ width: 36, flexShrink: 0, background: 'none', border: 'none', borderRight: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>

              {/* Days */}
              <div style={{ flex: 1, display: 'flex' }}>
                {weekDays.map((dateStr, i) => {
                  const d       = parseLocalDate(dateStr);
                  const entry   = dateRouteMap[dateStr];
                  const isToday = dateStr === todayISO;
                  const isSel   = dateStr === selectedDate;
                  const isLive  = entry?.posted && dateStr === todayISO;
                  const hasMult = entry?.routes?.some(r => r.multiplier);
                  const dotColor = entry
                    ? (isLive ? 'var(--avg-green)' : hasMult ? 'var(--avg-gold)' : 'var(--text-secondary)')
                    : 'transparent';
                  return (
                    <div key={dateStr}
                      className={`rotw-strip-day${entry ? ' has-routes' : ''}${isSel ? ' is-selected' : ''}`}
                      onClick={() => entry && setSelectedDate(dateStr)}>
                      <span className="rotw-strip-label">{DAY_LABELS[i]}</span>
                      <span className="rotw-strip-num" style={{
                        background: isToday ? 'var(--avg-green)' : isSel ? 'rgba(var(--brand-primary-rgb),0.1)' : 'transparent',
                        color: isToday ? 'white' : isSel ? 'var(--avg-green)' : 'var(--text-primary)',
                        fontWeight: isToday || isSel ? 700 : 400,
                      }}>{d.getDate()}</span>
                      <span className="rotw-strip-dot" style={{ background: dotColor }} />
                    </div>
                  );
                })}
              </div>

              {/* Next arrow */}
              <button onClick={() => {
                const next = addDays(weekStart, 7);
                const nextDate = parseLocalDate(next);
                setViewMonth({ year: nextDate.getFullYear(), month: nextDate.getMonth() });
                const nextEntry = Array.from({ length: 7 }, (_, i) => addDays(next, i)).find(d => dateRouteMap[d]);
                setSelectedDate(nextEntry || addDays(weekStart, 7));
              }} style={{ width: 36, flexShrink: 0, background: 'none', border: 'none', borderLeft: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDate && selectedRoutes.length > 0 ? (
            <div className="card" data-tour="rotw-routes" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 3, height: 20, borderRadius: 2, background: selectedIsLive ? 'var(--avg-green)' : 'var(--border-color)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {parseLocalDate(selectedDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  {selectedDate === todayISO && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.2rem 0.55rem', background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '5px' }}>Today</span>
                  )}
                  {selectedIsLive && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.2rem 0.55rem', background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '5px' }}>Live</span>
                  )}
                  {selectedIsExpired && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.2rem 0.55rem', background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderRadius: '5px' }}>Expired</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {selectedRoutes.length} route{selectedRoutes.length !== 1 ? 's' : ''}
                    {selectedEntry?.weekLabel && <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>· {selectedEntry.weekLabel}</span>}
                  </span>
                  {selectedIsLive && countdown && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>PIREP cutoff in</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{countdown}</span>
                      <span style={{ opacity: 0.5 }}>hrs</span>
                    </div>
                  )}
                  {!selectedIsLive && !selectedIsExpired && (() => {
                    // Days until selectedDate, then add that many days to next 06:00 UTC
                    const daysUntil = Math.round((parseLocalDate(selectedDate) - parseLocalDate(todayISO)) / 86400000);
                    const next0600  = getNext0600UTC();
                    const unlockMs  = next0600.getTime() + Math.max(0, daysUntil - 1) * 86400000 - Date.now();
                    const h = Math.floor(unlockMs / 3600000);
                    const m = Math.floor((unlockMs % 3600000) / 60000);
                    const s = Math.floor((unlockMs % 60000) / 1000);
                    const label = daysUntil === 1
                      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                      : daysUntil === 2 ? 'Tomorrow' : `In ${daysUntil} days`;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span>Unlocks in</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: daysUntil === 1 ? 'monospace' : 'inherit', letterSpacing: daysUntil === 1 ? '0.05em' : 0 }}>{label}</span>
                        {daysUntil === 1 && <span style={{ opacity: 0.5 }}>hrs</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                // Group outbound + return pairs
                const pairs = [];
                const seen = new Set();
                for (const route of selectedRoutes) {
                  if (seen.has(route.slotId)) continue;
                  seen.add(route.slotId);
                  if (route.bidirectional === false && route.isReturn) continue; // will be picked up with outbound
                  // Find matching return
                  const returnRoute = route.bidirectional
                    ? selectedRoutes.find(r => r.slotId === route.slotId + '_return')
                    : null;
                  if (returnRoute) seen.add(returnRoute.slotId);
                  pairs.push({ outbound: route, returnRoute: returnRoute || null });
                }

                return pairs.map(({ outbound, returnRoute }, pairIdx) => {
                  const isLast = pairIdx === pairs.length - 1;
                  const hasMultiplier = !!outbound.multiplier || !!returnRoute?.multiplier;
                  const borderColor = hasMultiplier ? 'var(--avg-gold)' : 'var(--border-color)';
                  const logoBg      = hasMultiplier ? 'var(--avg-gold-pale)' : 'var(--bg-secondary)';
                  const logoText    = hasMultiplier ? 'var(--avg-gold)' : 'var(--text-secondary)';
                  const logoBorder  = hasMultiplier ? 'var(--avg-gold)' : 'var(--border-color)';
                  const airlineCode = (() => {
                    const fn = outbound.flight_number || '';
                    const m = fn.match(/^([A-Z]{2,3})|^([A-Z0-9]{2})(?=\d)/);
                    return (m?.[1] || m?.[2]) || '—';
                  })();

                  const LegBlock = ({ route, isReturn, onFile }) => {
                    const ac = getAircraft(route);
                    const mult = route.multiplier;
                    return (
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: 4 }}>
                            {isReturn ? 'Return' : 'Outbound'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 3 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.03em' }}>{route.departure_icao}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.03em' }}>{route.arrival_icao}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{route.flight_number}</span>
                            <span>·</span>
                            <span>{fmtMins(route.duration)}</span>
                            {ac.length > 0 && <><span>·</span><span>{ac[0].split(' - ')[0]}</span></>}
                            {mult && (
                              <span style={{ background: 'var(--avg-gold-pale)', color: 'var(--avg-gold-dark)', borderRadius: 4, padding: '1px 6px', fontWeight: 700, fontSize: '0.68rem' }}>
                                ×{mult.value}{mult.name ? ` ${mult.name}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {onFile && (
                          selectedIsLive
                            ? <button onClick={onFile} className={isReturn ? undefined : 'btn btn-primary'} style={{ padding: '0.45rem 0.875rem', fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, ...(isReturn ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' } : {}) }}>
                                File {route.flight_number}
                              </button>
                            : <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', flexShrink: 0 }}>{selectedIsExpired ? 'Expired' : 'Not yet live'}</span>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div key={outbound.slotId}
                      className="rotw-route-row"
                      style={{
                        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                        borderLeft: `3px solid ${borderColor}`,
                        borderRadius: 10,
                        margin: `${pairIdx === 0 ? '1rem' : '0.5rem'} 1rem ${isLast ? '1rem' : '0.5rem'}`,
                        opacity: !selectedIsLive ? 0.7 : 1,
                      }}
                    >
                      {/* Airline logo column */}
                      <div style={{ width: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: logoBg, borderRight: `1px solid ${logoBorder}`, padding: '0.75rem 0.5rem' }}>
                        {(() => {
                          const airline = airlineMap[airlineCode];
                          return airline?.logo_url ? (
                            <img src={airline.logo_url} alt={airline.name}
                              style={{ width: 38, height: 38, objectFit: 'contain' }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          ) : (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color: logoText, letterSpacing: '0.05em' }}>{airlineCode}</span>
                          );
                        })()}
                      </div>

                      {/* Legs */}
                      <div className="rotw-legs" style={{ padding: '0.875rem 1rem' }}>
                        <LegBlock route={outbound} isReturn={false} onFile={() => handleFilePirep(outbound)} />

                        {returnRoute && (
                          <>
                            <div className="rotw-leg-divider" />
                            <LegBlock route={returnRoute} isReturn={true} onFile={() => handleFilePirep(returnRoute)} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : !hasAnyRoutes ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <p>No routes scheduled yet — check back soon.</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {selectedDate ? 'No routes on this day.' : 'Select a day above to see routes.'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RoutesOfTheWeek;
