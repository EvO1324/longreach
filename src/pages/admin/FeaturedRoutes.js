/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { routes as routesApi, multipliers as multipliersApi, rotw as rotwApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import RouteSearch from '../../components/RouteSearch';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_SLOTS = 5;

function getMondayOf(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function rotwToday() {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function toISODate(d) {
  if (typeof d === 'string') return d.split('T')[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(date, n) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function toMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISODate(d);
}

function fmtShort(date) { return new Date(typeof date === 'string' ? date + 'T12:00:00' : date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
function fmtFull(date)  { return new Date(typeof date === 'string' ? date + 'T12:00:00' : date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }); }

function emptySchedule() {
  return Object.fromEntries(DAYS.map(d => [d, []]));
}

// Calendar Picker

function CalendarPicker({ weekIds, activeWeekStart, onSelectWeek, onAddWeek }) {
  const today = rotwToday();
  const [viewMonth, setViewMonth] = useState(() => {
    const d = activeWeekStart ? new Date(activeWeekStart + 'T00:00:00') : getMondayOf(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay); gridStart.setDate(1 - startOffset);

  const weeks = [];
  let cur = new Date(gridStart);
  for (let r = 0; r < 6; r++) {
    const week = [];
    for (let c = 0; c < 7; c++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
    if (cur.getMonth() > month && r >= 3) break;
  }

  const scheduledSet = new Set(weekIds);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DLABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem 0.75rem' }}>
        <button onClick={() => setViewMonth(new Date(year, month-1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
          onMouseEnter={e=>e.currentTarget.style.color='var(--avg-green)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-secondary)'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{MONTHS[month]} {year}</span>
        <button onClick={() => setViewMonth(new Date(year, month+1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
          onMouseEnter={e=>e.currentTarget.style.color='var(--avg-green)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-secondary)'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 0.75rem 0.5rem', gap: '2px' }}>
        {DLABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.2rem 0' }}>{d}</div>)}
      </div>
      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {weeks.map((weekDays, wi) => {
          const monday    = weekDays[1];
          const mondayStr = toMonday(toISODate(monday));
          const isScheduled = scheduledSet.has(mondayStr);
          const isActive    = activeWeekStart === mondayStr;
          const isCurrent   = toISODate(getMondayOf(today)) === mondayStr;
          return (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', borderRadius: '8px', background: isActive ? 'rgba(var(--brand-primary-rgb),0.08)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
              onClick={() => isScheduled ? onSelectWeek(mondayStr) : onAddWeek(mondayStr)}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(var(--brand-primary-rgb),0.04)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
              {weekDays.map((day, di) => {
                const inMonth = day.getMonth() === month;
                const isToday = toISODate(day) === toISODate(today);
                const isMon   = di === 0;
                return (
                  <div key={di} style={{ position: 'relative', textAlign: 'center', padding: '0.35rem 0.1rem', borderRadius: '6px', fontSize: '0.82rem',
                    fontWeight: isToday ? 700 : 400,
                    color: !inMonth ? 'var(--text-secondary)' : isToday ? 'white' : isActive && isMon ? 'var(--avg-green)' : 'var(--text-primary)',
                    background: isToday ? 'var(--avg-green)' : 'transparent',
                    opacity: !inMonth ? 0.35 : 1 }}>
                    {day.getDate()}
                    {isMon && isScheduled && !isActive && <div style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--avg-green)' }} />}
                    {isMon && isCurrent && !isToday && <div style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--avg-gold)' }} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ padding: '0.6rem 1.25rem 0.875rem', display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--avg-green)' }} /> Scheduled
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--avg-gold)' }} /> This week
        </div>
      </div>
    </div>
  );
}

// Multiplier picker row

function MultiplierPicker({ multipliers, selectedId, onChange }) {
  if (!multipliers.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: 65 }}>Multiplier</span>
      <button onClick={() => onChange(null)} style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: !selectedId ? '#fff' : 'transparent', color: !selectedId ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: !selectedId ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>None</button>
      {multipliers.map(m => {
        const sel = selectedId === m.id;
        return <button key={m.id} onClick={() => onChange(m.id)} style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', cursor: 'pointer', border: 'none', background: sel ? 'var(--avg-green)' : 'transparent', color: sel ? '#fff' : 'var(--text-secondary)', boxShadow: sel ? '0 2px 6px rgba(var(--brand-primary-rgb),0.3)' : 'none' }}>{m.code} ×{m.value}</button>;
      })}
    </div>
  );
}

// Day Editor

function DayEditor({ day, date, slots, routeMap, multipliers, onAdd, onRemove, onSetMultiplier, onToggleBidirectional, onSetReturnRoute, onRemoveReturnRoute, onSetReturnMultiplier, onClear, onCopyTo, otherDays }) {
  const activeDayRouteIds = slots.map(s => s.routeId);
  const slotsRemaining    = MAX_SLOTS - slots.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{day}</div>
          {date && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{fmtFull(date)}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{slots.length}/{MAX_SLOTS} slots</span>
          {slots.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {otherDays.map(d => (
                  <button key={d} onClick={() => onCopyTo(d)} title={`Copy to ${d}`} className="rotw-btn-icon" style={{ padding: '0.3rem 0.55rem', background: 'var(--bg-hover)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--avg-green-pale)'; e.currentTarget.style.color='var(--avg-green)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-hover)'; e.currentTarget.style.color='var(--text-secondary)';}}>{d.slice(0,3)}</button>
                ))}
              </div>
              <button onClick={onClear} style={{ background: 'none', border: 'none', color: '#c62828', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>Clear day</button>
            </>
          )}
        </div>
      </div>

      {slots.length === 0 ? (
        <div style={{ padding: '2.5rem 1.5rem', borderRadius: '12px', textAlign: 'center', border: '2px dashed var(--border-color)', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem', opacity: 0.5 }}>✈</div>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.25rem' }}>No routes yet for {day}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Search for a route below to add the first one</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
          {slots.map(({ routeId, multiplierId, bidirectional, returnRouteId, returnMultiplierId }, idx) => {
            const r       = routeMap[routeId];
            const retR    = returnRouteId ? routeMap[returnRouteId] : null;
            if (!r) return null;

            return (
              <div key={routeId} className="rotw-slot-card" style={{ border: `1.5px solid ${bidirectional ? 'rgba(var(--brand-accent-rgb),0.4)' : 'var(--border-color)'}`, borderRadius: '11px', overflow: 'hidden', background: '#fff' }}>

                {/* Outbound row */}
                <div style={{ padding: '0.9rem 1rem', background: 'rgba(var(--brand-primary-rgb),0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: multipliers.length > 0 ? '0.6rem' : 0 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--avg-green)', color: '#fff', fontSize: '0.66rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx+1}</span>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--avg-green)', minWidth: 55 }}>{r.flight_number}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.departure_icao}</span>

                    {/* Direction toggle button */}
                    <button
                      onClick={() => onToggleBidirectional(routeId)}
                      title={bidirectional ? 'Click to make one-way' : 'Click to add return leg'}
                      style={{
                        padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
                        border: `1.5px solid ${bidirectional ? 'var(--avg-gold)' : 'var(--border-color)'}`,
                        background: bidirectional ? 'var(--avg-gold-pale)' : '#fff',
                        color: bidirectional ? 'var(--avg-gold-dark)' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}>
                      {bidirectional ? '⇄' : '→'}
                    </button>

                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.arrival_icao}</span>
                    {r.duration ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>· {Math.floor(r.duration/60)}h {r.duration%60}m</span> : null}
                    <button onClick={() => onRemove(routeId)} className="rotw-btn-icon" style={{ marginLeft: 'auto', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'flex' }}
                      onMouseEnter={e=>{e.currentTarget.style.color='#c62828'; e.currentTarget.style.borderColor='#c62828';}}
                      onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)'; e.currentTarget.style.borderColor='var(--border-color)';}}>✕</button>
                  </div>
                  {multipliers.length > 0 && (
                    <div style={{ paddingLeft: '1.75rem' }}>
                      <MultiplierPicker multipliers={multipliers} selectedId={multiplierId} onChange={id => onSetMultiplier(routeId, id)} />
                    </div>
                  )}
                </div>

                {/* Return leg */}
                {bidirectional && (
                  <div style={{ borderTop: `1px dashed rgba(var(--brand-accent-rgb),0.4)`, background: 'rgba(var(--brand-accent-rgb),0.05)', padding: '0.9rem 1rem' }}>
                    {retR ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: multipliers.length > 0 ? '0.6rem' : 0 }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--avg-gold-dark)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↩</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--avg-gold-dark)', minWidth: 55 }}>{retR.flight_number}</span>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{retR.departure_icao}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>→</span>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{retR.arrival_icao}</span>
                          {retR.duration ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>· {Math.floor(retR.duration/60)}h {retR.duration%60}m</span> : null}
                          <button onClick={() => onRemoveReturnRoute(routeId)} className="rotw-btn-icon" style={{ marginLeft: 'auto', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'flex' }}
                            onMouseEnter={e=>{e.currentTarget.style.color='#c62828'; e.currentTarget.style.borderColor='#c62828';}}
                            onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)'; e.currentTarget.style.borderColor='var(--border-color)';}}>✕</button>
                        </div>
                        {multipliers.length > 0 && (
                          <div style={{ paddingLeft: '1.75rem' }}>
                            <MultiplierPicker multipliers={multipliers} selectedId={returnMultiplierId} onChange={id => onSetReturnMultiplier(routeId, id)} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--avg-gold-dark)', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>↩</span> Return leg — search for the return flight
                        </div>
                        {(() => {
                          const suggested = Object.values(routeMap).find(rt =>
                            rt.id !== routeId && rt.departure_icao === r.arrival_icao && rt.arrival_icao === r.departure_icao
                          );
                          if (!suggested) return null;
                          return (
                            <button
                              onClick={() => onSetReturnRoute(routeId, suggested.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left',
                                padding: '0.55rem 0.75rem', marginBottom: '0.6rem', borderRadius: '8px', cursor: 'pointer',
                                border: '1.5px dashed var(--avg-gold)', background: '#fff', color: 'var(--avg-gold-dark)',
                              }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>Suggested</span>
                              <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.82rem' }}>{suggested.flight_number}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{suggested.departure_icao} → {suggested.arrival_icao}</span>
                              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700 }}>Use this →</span>
                            </button>
                          );
                        })()}
                        <RouteSearch
                          routes={Object.values(routeMap)}
                          excludeIds={[routeId]}
                          onSelect={route => onSetReturnRoute(routeId, route.id)}
                          placeholder={`Search return leg (e.g. ${r.arrival_icao}→${r.departure_icao})`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RouteSearch
        routes={Object.values(routeMap)}
        excludeIds={activeDayRouteIds}
        onSelect={route => onAdd(route.id)}
        disabled={slotsRemaining === 0}
      />
    </div>
  );
}

// Main

function FeaturedRoutes() {
  const [routes, setRoutes]             = useState([]);
  const [multipliersList, setMults]     = useState([]);
  const [weeks, setWeeks]               = useState([]);
  const [schedules, setSchedules]       = useState({});
  const [dirty, setDirty]               = useState(new Set());
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [publishing, setPublishing]     = useState(false);
  const [activeWeekId, setActiveWeekId] = useState(null);
  const [activeDay, setActiveDay]       = useState('Monday');
  const [confirmRemoveWeek, setConfirmRemoveWeek] = useState(null);
  const [confirmPublish, setConfirmPublish]       = useState(false);
  const [weeksExpanded, setWeeksExpanded]         = useState(false);

  const today = rotwToday();
  const currentMondayStr = toISODate(getMondayOf(today));

  // Load

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [routesData, multsData, weeksData] = await Promise.all([
          routesApi.list({ active: true }),
          multipliersApi.list().catch(() => ({ multipliers: [] })),
          rotwApi.getWeeks().catch(() => ({ weeks: [] })),
        ]);
        setRoutes(routesData.routes || []);
        setMults(multsData.multipliers || []);

        const loadedWeeks = weeksData.weeks || [];
        setWeeks(loadedWeeks);

        const cur = loadedWeeks.find(w => w.week_start === currentMondayStr);
        if (cur) {
          setActiveWeekId(cur.id);
        } else if (loadedWeeks.length > 0) {
          const sorted   = [...loadedWeeks].sort((a,b) => new Date(a.week_start + 'T00:00:00') - new Date(b.week_start + 'T00:00:00'));
          const upcoming = sorted.find(w => new Date(w.week_start + 'T00:00:00') >= today);
          setActiveWeekId((upcoming || sorted[sorted.length-1]).id);
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to load schedule data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSlots = useCallback(async (weekId) => {
    if (schedules[weekId]) return;
    try {
      const data = await rotwApi.getSlots(weekId);
      const slots = data.slots || [];
      const sched = emptySchedule();
      const sorted = [...slots].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
      for (const s of sorted) {
        if (sched[s.day]) {
          sched[s.day].push({
            routeId:            s.route,
            multiplierId:       s.multiplier          || null,
            bidirectional:      s.bidirectional        || false,
            returnRouteId:      s.return_route         || null,
            returnMultiplierId: s.return_multiplier    || null,
            _routeRecord:       s.expand?.route        || null,
            _retRouteRecord:    s.expand?.return_route || null,
            _multRecord:        s.expand?.multiplier   || null,
          });
        }
      }
      setSchedules(prev => ({ ...prev, [weekId]: sched }));
    } catch (err) {
      console.error('Failed to load slots for week', weekId, err);
      showToast('Failed to load week slots', 'error');
    }
  }, [schedules]);

  useEffect(() => {
    if (activeWeekId) loadSlots(activeWeekId);
  }, [activeWeekId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived

  const routeMap      = Object.fromEntries(routes.map(r => [r.id, r]));
  const activeWeek    = weeks.find(w => w.id === activeWeekId);
  const schedule      = (activeWeekId && schedules[activeWeekId]) || emptySchedule();
  const activeDaySlots = schedule[activeDay] || [];
  const totalRoutes   = Object.values(schedule).flat().length;
  const weekIds       = Object.fromEntries(weeks.map(w => [w.week_start, w.id]));

  const dayDates = activeWeek
    ? (() => {
        const d = new Date(activeWeek.week_start + 'T12:00:00');
        const dow = d.getDay();
        d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
        const monday = toISODate(d);
        return Object.fromEntries(DAYS.map((day, i) => [day, addDays(monday, i)]));
      })()
    : {};

  const isCurrentWeek = activeWeek?.week_start === currentMondayStr;
  const isFuture      = activeWeek && new Date(activeWeek.week_start + 'T00:00:00') > today;

  // Mutators

  const updateSchedule = useCallback((updater) => {
    setSchedules(prev => ({ ...prev, [activeWeekId]: updater(prev[activeWeekId] || emptySchedule()) }));
    setDirty(prev => new Set([...prev, activeWeekId]));
  }, [activeWeekId]);

  const addRoute = (day, routeId) => updateSchedule(s => {
    const slots = s[day] || [];
    if (slots.some(x => x.routeId === routeId)) return s;
    if (slots.length >= MAX_SLOTS) { showToast(`Max ${MAX_SLOTS} slots per day`, 'error'); return s; }
    return { ...s, [day]: [...slots, { routeId, multiplierId: null, bidirectional: false, returnRouteId: null, returnMultiplierId: null }] };
  });

  const removeRoute = (day, routeId) => updateSchedule(s => ({
    ...s, [day]: s[day].filter(x => x.routeId !== routeId),
  }));

  const setMultiplier = (day, routeId, multiplierId) => updateSchedule(s => ({
    ...s, [day]: s[day].map(x => x.routeId === routeId ? { ...x, multiplierId: multiplierId || null } : x),
  }));

  const toggleBidirectional = (day, routeId) => updateSchedule(s => ({
    ...s, [day]: s[day].map(x => x.routeId === routeId
      ? { ...x, bidirectional: !x.bidirectional, returnRouteId: !x.bidirectional ? x.returnRouteId : null, returnMultiplierId: !x.bidirectional ? x.returnMultiplierId : null }
      : x),
  }));

  const setReturnRoute = (day, routeId, returnRouteId) => updateSchedule(s => ({
    ...s, [day]: s[day].map(x => x.routeId === routeId ? { ...x, returnRouteId } : x),
  }));

  const removeReturnRoute = (day, routeId) => updateSchedule(s => ({
    ...s, [day]: s[day].map(x => x.routeId === routeId ? { ...x, returnRouteId: null, returnMultiplierId: null } : x),
  }));

  const setReturnMultiplier = (day, routeId, returnMultiplierId) => updateSchedule(s => ({
    ...s, [day]: s[day].map(x => x.routeId === routeId ? { ...x, returnMultiplierId: returnMultiplierId || null } : x),
  }));

  const clearDay = (day) => updateSchedule(s => ({ ...s, [day]: [] }));

  const copyDayTo = (fromDay, toDay) => updateSchedule(s => ({
    ...s, [toDay]: s[fromDay].map(x => ({ ...x })),
  }));

  // Week management

  const addWeek = async (mondayStr) => {
    if (weekIds[mondayStr]) { setActiveWeekId(weekIds[mondayStr]); return; }
    try {
      const data = await rotwApi.createWeek(mondayStr);
      const newWeek = { ...data.week, slot_count: 0 };
      setWeeks(prev => [...prev, newWeek]);
      setActiveWeekId(newWeek.id);
      showToast(`Week of ${fmtShort(mondayStr)} added`, 'success');
    } catch (err) {
      if (err?.message?.includes('409')) { showToast('Week already exists', 'error'); return; }
      showToast('Failed to create week', 'error');
    }
  };

  const removeWeek = (weekId) => {
    const week = weeks.find(w => w.id === weekId);
    setConfirmRemoveWeek({ weekId, week });
  };

  const doRemoveWeek = async (weekId) => {
    try {
      await rotwApi.deleteWeek(weekId);
      setWeeks(prev => prev.filter(w => w.id !== weekId));
      setSchedules(prev => { const n = { ...prev }; delete n[weekId]; return n; });
      setDirty(prev => { const n = new Set(prev); n.delete(weekId); return n; });
      if (activeWeekId === weekId) {
        const remaining = weeks.filter(w => w.id !== weekId);
        setActiveWeekId(remaining.length > 0 ? remaining[remaining.length-1].id : null);
      }
      showToast('Week removed', 'success');
    } catch {
      showToast('Failed to remove week', 'error');
    }
  };

  // Save & Publish

  const handleSave = async () => {
    if (!activeWeekId) return;
    try {
      setSaving(true);
      const sched = schedules[activeWeekId] || emptySchedule();
      const slots = [];
      let order = 0;
      for (const day of DAYS) {
        for (const s of (sched[day] || [])) {
          slots.push({
            day,
            routeId:            s.routeId,
            multiplierId:       s.multiplierId       || null,
            bidirectional:      s.bidirectional      || false,
            returnRouteId:      s.returnRouteId      || null,
            returnMultiplierId: s.returnMultiplierId || null,
            sort_order:         order++,
          });
        }
      }
      await rotwApi.saveSlots(activeWeekId, slots);
      setWeeks(prev => prev.map(w => w.id === activeWeekId ? { ...w, slot_count: slots.length } : w));
      setDirty(prev => { const n = new Set(prev); n.delete(activeWeekId); return n; });
      showToast('Schedule saved!', 'success');
    } catch {
      showToast('Failed to save schedule', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = () => {
    if (!activeWeekId) return;
    setConfirmPublish(true);
  };

  const doPublish = async () => {
    if (!activeWeekId) return;
    try {
      setPublishing(true);
      if (dirty.has(activeWeekId)) await handleSave();
      await rotwApi.publish(activeWeekId);
      setWeeks(prev => prev.map(w => w.id === activeWeekId ? { ...w, posted: true } : w));
      showToast('Published! Push notification and Discord post sent.', 'success');
    } catch {
      showToast('Failed to publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div>
      <style>{`
        .rotw-grid { display: grid; grid-template-columns: 280px 1fr; gap: 1.5rem; align-items: start; }
        .rotw-day-tabs { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .rotw-week-item { transition: background 0.15s, border-color 0.15s, transform 0.1s; }
        .rotw-week-item:hover { transform: translateX(2px); }
        .rotw-slot-card { transition: box-shadow 0.15s, border-color 0.15s; }
        .rotw-slot-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.06); }
        .rotw-btn-icon { transition: background 0.15s, color 0.15s; }
        @media (max-width: 860px) { .rotw-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Featured Routes</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Build the week pilots see on Routes of the Week — up to {MAX_SLOTS} routes a day, with optional return legs and XP multipliers.
        </p>
      </div>

      <div className="rotw-grid">

        {/* Left: Calendar + week list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CalendarPicker
            weekIds={Object.keys(weekIds)}
            activeWeekStart={activeWeek?.week_start || null}
            onSelectWeek={ws => setActiveWeekId(weekIds[ws])}
            onAddWeek={addWeek}
          />

          {weeks.length > 0 && (
            <div className="card" style={{ padding: '1.1rem', marginBottom: 0 }}>
              <button
                onClick={() => setWeeksExpanded(e => !e)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  marginBottom: weeksExpanded ? '0.75rem' : 0,
                }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
                  Scheduled Weeks <span style={{ opacity: 0.7 }}>({weeks.length})</span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-secondary)', transform: weeksExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {weeksExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[...weeks].sort((a,b) => new Date(b.week_start)-new Date(a.week_start)).map(w => {
                  const isActive = w.id === activeWeekId;
                  const isCur    = w.week_start === currentMondayStr;
                  const isDirty  = dirty.has(w.id);
                  return (
                    <div key={w.id} className="rotw-week-item" onClick={() => setActiveWeekId(w.id)} style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '9px', cursor: 'pointer',
                      background: isActive ? 'var(--avg-green-pale)' : 'transparent',
                      borderLeft: `3px solid ${isActive ? 'var(--avg-green)' : 'transparent'}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                          <span style={{ fontWeight: isActive ? 700 : 600, fontSize: '0.84rem', color: isActive ? 'var(--avg-green)' : 'var(--text-primary)' }}>
                            {fmtShort(toMonday(w.week_start))} – {fmtShort(addDays(toMonday(w.week_start), 6))}
                          </span>
                          {isCur && <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '0.05rem 0.4rem', borderRadius: '999px', background: 'var(--avg-gold-pale)', color: 'var(--avg-gold-dark)' }}>NOW</span>}
                          {isDirty && <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '0.05rem 0.4rem', borderRadius: '999px', background: 'rgba(230,81,0,0.1)', color: '#e65100' }}>UNSAVED</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                              <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: i < (w.slot_count || 0) ? (isActive ? 'var(--avg-green)' : 'var(--text-secondary)') : 'var(--border-color)' }} />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{w.slot_count || 0} slot{w.slot_count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {w.posted && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.62rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '999px', background: 'var(--avg-green-pale)', color: 'var(--avg-green)' }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                          POSTED
                        </span>
                      )}
                      <button className="rotw-btn-icon" onClick={e => { e.stopPropagation(); removeWeek(w.id); }} style={{ background: 'none', border: 'none', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', opacity: 0.55, display: 'flex' }}
                        onMouseEnter={e=>{e.currentTarget.style.color='#c62828'; e.currentTarget.style.background='rgba(198,40,40,0.08)'; e.currentTarget.style.opacity=1;}}
                        onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)'; e.currentTarget.style.background='none'; e.currentTarget.style.opacity=0.55;}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Week editor */}
        <div>
          {!activeWeekId ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📅</div>
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>No week selected</div>
              <div style={{ fontSize: '0.875rem' }}>Click a Monday on the calendar to create or edit a week</div>
            </div>
          ) : !schedules[activeWeekId] ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading slots…</div>
          ) : (
            <div className="card" style={{ marginBottom: 0, padding: '1.5rem' }}>
              {/* Week header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '0.9rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                      {fmtShort(toMonday(activeWeek.week_start))} – {fmtShort(addDays(toMonday(activeWeek.week_start), 6))}
                    </h3>
                    {isCurrentWeek && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.66rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'var(--avg-gold-pale)', color: 'var(--avg-gold-dark)' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--avg-gold-dark)' }} />CURRENT</span>}
                    {isFuture && <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'var(--avg-green-pale)', color: 'var(--avg-green)' }}>UPCOMING</span>}
                    {activeWeek.posted && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.66rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'var(--avg-green-pale)', color: 'var(--avg-green)' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                        POSTED
                      </span>
                    )}
                    {dirty.has(activeWeekId) && <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'rgba(230,81,0,0.1)', color: '#e65100' }}>UNSAVED</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{totalRoutes} of {MAX_SLOTS * 7} slots scheduled across the week</div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button onClick={handleSave} disabled={saving || !dirty.has(activeWeekId)} className="btn btn-secondary"
                    style={{ fontSize: '0.86rem', fontWeight: 700, padding: '0.6rem 1.2rem', borderRadius: '9px', opacity: (saving || !dirty.has(activeWeekId)) ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={handlePublish} disabled={publishing || saving} className="btn btn-primary"
                    style={{ fontSize: '0.86rem', fontWeight: 700, padding: '0.6rem 1.2rem', borderRadius: '9px', opacity: (publishing || saving) ? 0.6 : 1 }}>
                    {publishing ? 'Publishing…' : activeWeek.posted ? 'Re-publish' : 'Publish'}
                  </button>
                </div>
              </div>

              {/* Day tabs */}
              <div className="rotw-day-tabs">
                {DAYS.map(day => {
                  const slots    = schedule[day] || [];
                  const count    = slots.length;
                  // count bookable entries (slots + return legs)
                  const entries  = slots.reduce((n, s) => n + 1 + (s.bidirectional && s.returnRouteId ? 1 : 0), 0);
                  const isActive = activeDay === day;
                  const isEmpty  = count === 0;
                  return (
                    <button key={day} onClick={() => setActiveDay(day)} style={{
                      padding: '0.65rem 1rem', background: isActive ? 'var(--avg-green)' : '#fff',
                      color: isActive ? 'white' : 'var(--text-primary)',
                      border: `1.5px solid ${isActive ? 'var(--avg-green)' : isEmpty ? 'var(--border-color)' : 'var(--avg-green-pale)'}`,
                      borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem', whiteSpace: 'nowrap',
                      transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
                      boxShadow: isActive ? '0 3px 10px rgba(var(--brand-primary-rgb),0.25)' : 'none', minWidth: 62,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                        {day.slice(0,3)}
                        {dayDates[day] && <span style={{ fontSize: '0.72rem', opacity: 0.7, fontWeight: 600 }}>{new Date(dayDates[day] + 'T00:00:00').getDate()}</span>}
                      </span>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                          <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: i < count ? (isActive ? 'rgba(255,255,255,0.9)' : 'var(--avg-green)') : (isActive ? 'rgba(255,255,255,0.3)' : 'var(--border-color)') }} />
                        ))}
                      </div>
                      {entries > count && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.85 }}>+{entries - count} return</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <DayEditor
                day={activeDay}
                date={dayDates[activeDay]}
                slots={activeDaySlots}
                routeMap={routeMap}
                multipliers={multipliersList}
                onAdd={routeId => addRoute(activeDay, routeId)}
                onRemove={routeId => removeRoute(activeDay, routeId)}
                onSetMultiplier={(routeId, multId) => setMultiplier(activeDay, routeId, multId)}
                onToggleBidirectional={routeId => toggleBidirectional(activeDay, routeId)}
                onSetReturnRoute={(routeId, retId) => setReturnRoute(activeDay, routeId, retId)}
                onRemoveReturnRoute={routeId => removeReturnRoute(activeDay, routeId)}
                onSetReturnMultiplier={(routeId, multId) => setReturnMultiplier(activeDay, routeId, multId)}
                onClear={() => clearDay(activeDay)}
                onCopyTo={toDay => { copyDayTo(activeDay, toDay); showToast(`Copied to ${toDay}`, 'success'); }}
                otherDays={DAYS.filter(d => d !== activeDay)}
              />
            </div>
          )}
        </div>
      </div>

      {confirmRemoveWeek && (
        <ConfirmModal
          title={`Remove week of ${fmtShort(confirmRemoveWeek.week?.week_start)}?`}
          message="All slots for this week will be permanently deleted. This cannot be undone."
          confirmLabel="Remove Week"
          danger
          onConfirm={() => doRemoveWeek(confirmRemoveWeek.weekId)}
          onClose={() => setConfirmRemoveWeek(null)}
        />
      )}
      {confirmPublish && activeWeek && (
        <ConfirmModal
          title={`Publish week of ${fmtShort(toMonday(activeWeek.week_start))}?`}
          message="This will send a push notification to all pilots and post to Discord."
          confirmLabel="Publish"
          onConfirm={doPublish}
          onClose={() => setConfirmPublish(false)}
        />
      )}
    </div>
  );
}

export default FeaturedRoutes;
