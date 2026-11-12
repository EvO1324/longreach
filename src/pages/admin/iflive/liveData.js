/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ifLive, ifLiveBids } from '../../../api/client';

export const HOUR = 60 * 60 * 1000;
export const START_WINDOW = 4 * HOUR;
export const MAX_SECTORS = 6;
export const MAX_BOOKINGS = 2;
export const pad = n => String(n).padStart(2, '0');
export const zTime = d => `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
export const zDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const zDayKey = d => d.toISOString().slice(0, 10);
// "1530Z" today, "Fri 1530Z" any other day.
export const zWhen = t => {
  const d = new Date(t);
  return zDayKey(d) === zDayKey(new Date()) ? zTime(d) : `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${zTime(d)}`;
};
export const fmtMins = m => (m == null ? null : `${Math.floor(m / 60)}h ${pad(Math.round(m % 60))}m`);
export const fmtHours = h => fmtMins(Math.round((h || 0) * 60));
export const pbDate = v => new Date(String(v).replace(' ', 'T'));
export const shortName = p => (p ? `${p.first_name || 'Pilot'}${p.last_name ? ` ${p.last_name.charAt(0).toUpperCase()}.` : ''}` : 'Another pilot');
// "in 2h 10m" / "in 25m"
export const untilText = t => {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
};

export const IN_PROGRESS = new Set([4, 6, 7, 10]);

export function splitType(name) {
  const i = (name || '').lastIndexOf(' - ');
  return i > 0 ? { model: name.slice(0, i), livery: name.slice(i + 3) } : { model: name || 'Aircraft', livery: '' };
}

// route.aircraft: a JSON array of fleet livery names, or older pipe-delimited strings.
export function parseRouteAircraft(raw) {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
    const s = String(raw).trim();
    if (s.startsWith('[')) {
      const p = JSON.parse(s);
      return (Array.isArray(p) ? p : [p]).flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
    }
    return s.split('|').map(v => v.trim()).filter(Boolean);
  } catch { return []; }
}

export function routeMinutes(r) {
  if (r?.duration) return Number(r.duration);
  if (r?.distance_nm) return Math.round((Number(r.distance_nm) / 480 + 0.5) * 60);
  return null;
}

export function canFly(ac, route, fleetNameById) {
  const fleetName = fleetNameById?.[ac.aircraftId];
  if (!fleetName) return true;
  return parseRouteAircraft(route.aircraft).includes(fleetName);
}

// City names for every ICAO shown, loaded in chunks and cached for the session.
const nameCache = {};
export function useAirportNames(icaos) {
  const [names, setNames] = useState(() => ({ ...nameCache }));
  const key = [...new Set((icaos || []).filter(Boolean))].sort().join(',');
  useEffect(() => {
    const missing = key ? key.split(',').filter(i => !(i in nameCache)) : [];
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 300) {
        const chunk = missing.slice(i, i + 300);
        try {
          const d = await ifLive.airports(chunk);
          chunk.forEach(icao => { nameCache[icao] = d.airports?.[icao] || null; });
        } catch { chunk.forEach(icao => { nameCache[icao] = null; }); }
        if (!cancelled) setNames({ ...nameCache });
      }
    })();
    return () => { cancelled = true; };
  }, [key]);
  return names;
}
export const cityOf = (names, icao) => names[icao]?.city || names[icao]?.name || null;
export const placeText = (names, icao) => (icao ? (cityOf(names, icao) ? `${cityOf(names, icao)} (${icao})` : icao) : 'unknown');

export function useLiveFleet(orgId, refreshMs = 2 * 60 * 1000) {
  const [data, setData] = useState({ aircraft: null, bids: [], schedules: [] });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [a, b, s] = await Promise.all([
        ifLive.aircraftList(orgId),
        ifLiveBids.list(orgId, { recent: true }),
        ifLive.orgSchedules(orgId).catch(() => ({ schedules: [] })),
      ]);
      setData({ aircraft: a.aircraft || [], bids: b.bids || [], schedules: (s.schedules || []).filter(x => x.status !== 9) });
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.message || 'Could not load the fleet');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);

  return { ...data, error, loading, updatedAt, reload };
}

function legStarts(bid) {
  let cursor = pbDate(bid.created).getTime();
  return (bid.legs || []).map(l => {
    const start = l.holdStartUtc ? pbDate(l.holdStartUtc).getTime()
      : l.departureUtc ? new Date(l.departureUtc).getTime() : cursor;
    if (l.deadlineUtc) cursor = new Date(l.deadlineUtc).getTime();
    return start;
  });
}

export function fleetBoard(aircraft, bids, schedules) {
  const statusById = new Map((schedules || []).map(s => [s.id, s.status]));
  const byAc = new Map();
  for (const ac of aircraft || []) byAc.set(ac.id, { ac, queue: [], pending: null, freeFrom: null, freeAt: ac.currentIcao || null, flying: null });
  for (const bid of bids || []) {
    const row = byAc.get(bid.aircraftId);
    if (!row) continue;
    if (bid.status === 'pending') { row.pending = bid; continue; }
    if (bid.status !== 'active') continue;
    const starts = legStarts(bid);
    (bid.legs || []).forEach((leg, legIndex) => {
      if (leg.pirepId || leg.expired || !leg.deadlineUtc) return;
      row.queue.push({
        bid, leg, legIndex, isMine: !!bid.isMine, pilot: shortName(bid.pilot),
        start: starts[legIndex], end: new Date(leg.deadlineUtc).getTime(),
        flying: IN_PROGRESS.has(statusById.get(leg.ifScheduleId)),
        started: !!leg.startedAt,
        startBy: (leg.windowStartUtc ? new Date(leg.windowStartUtc).getTime() : starts[legIndex]) + START_WINDOW,
      });
    });
  }
  for (const row of byAc.values()) {
    row.queue.sort((a, b) => a.start - b.start || a.legIndex - b.legIndex);
    const last = row.queue[row.queue.length - 1];
    if (last) { row.freeFrom = last.end; row.freeAt = last.leg.destIcao || row.freeAt; }
    row.airborne = !!(row.ac.live && row.ac.live.speed > 40);
    if (row.airborne && row.queue.length && !row.queue.some(q => q.flying)) row.queue[0].flying = true;
    row.flying = row.queue.find(q => q.flying) || null;
  }
  return byAc;
}

export const NOW_QUEUE_LIMIT = 3 * HOUR;

export function availability(row, when) {
  const { ac } = row;
  // Blocked by an admin (Live Mode, Admin, Aircraft)
  if (ac.adminBlock) return { ok: false, reason: ac.adminBlock.reason ? `Unavailable: ${ac.adminBlock.reason}` : 'Unavailable', blocked: true };
  if (row.pending) return { ok: false, reason: 'Waiting on staff' };
  if (!row.freeFrom) return { ok: true, at: ac.currentIcao || null };
  const mineLast = row.queue[row.queue.length - 1]?.isMine;
  if (when == null) {
    if (!mineLast && row.freeFrom - Date.now() > NOW_QUEUE_LIMIT) return { ok: false, reason: `Booked until ${zWhen(row.freeFrom)}`, until: row.freeFrom };
    return { ok: true, at: row.freeAt, after: row.freeFrom, afterMine: mineLast };
  }
  if (when < row.freeFrom) return { ok: false, reason: `Booked until ${zWhen(row.freeFrom)}`, until: row.freeFrom };
  return { ok: true, at: row.freeAt };
}

export function useFleetBoard(aircraft, bids, schedules) {
  return useMemo(() => fleetBoard(aircraft, bids, schedules), [aircraft, bids, schedules]);
}

export const LIVE_CSS = `
.lv { font-size: 0.95rem; container-type: inline-size; --lv-ok: #1f6b4a; --lv-warn: #8a5a00; --lv-bad: #b3261e; --lv-info: #2c5f7c; }
body.dark-mode .lv { --lv-ok: #6fcf9c; --lv-warn: #e7b54d; --lv-bad: #ff8a80; --lv-info: #8cc3e0; }
.lv-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }
.lv-h { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-primary); }
.lv-sub { color: var(--text-secondary); font-size: 0.875rem; margin: 0; line-height: 1.5; }
.lv-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.lv-reg { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; white-space: nowrap; }
.lv-link { background: none; border: none; padding: 0; cursor: pointer; font: inherit; font-size: 0.875rem; font-weight: 600; color: var(--avg-green); text-decoration: underline; text-underline-offset: 2px; }
body.dark-mode .lv-link:not(.is-bad) { color: var(--lv-ok); }
.lv-link.is-bad { color: var(--lv-bad); }
.lv-ok { color: var(--lv-ok); }
.lv-warn { color: var(--lv-warn); }
.lv-bad { color: var(--lv-bad); }
.lv-info { color: var(--lv-info); }
.lv-muted { color: var(--text-secondary); }
.lv-chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; white-space: nowrap; border: 1.5px solid currentColor; }
.lv-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.lv-seg { display: inline-flex; gap: 0.2rem; padding: 0.2rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; }
.lv-seg button { padding: 0.4rem 0.95rem; border-radius: 7px; border: none; cursor: pointer; font: inherit; font-size: 0.875rem; font-weight: 600; background: transparent; color: var(--text-secondary); }
.lv-seg button.is-on { background: var(--avg-green); color: #fff; }
.lv-search { position: relative; flex: 1 1 240px; max-width: 360px; }
.lv-search input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.8rem 0.6rem 2.2rem; border: 1.5px solid var(--border-color); border-radius: 9px; font: inherit; font-size: 0.9rem; background: var(--bg-card); color: var(--text-primary); }
.lv-search input:focus { outline: none; border-color: var(--avg-green); }
.lv-search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); }
.lv-bar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-bottom: 1rem; }
.lv-thumb { flex-shrink: 0; border-radius: 7px; background: var(--bg-hover) center / cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
.lv-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border: 1.5px solid var(--border-color); border-radius: 8px; background: var(--bg-card); font: inherit; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); cursor: pointer; white-space: nowrap; }
.lv-btn:hover { border-color: var(--avg-green); }
.lv-btn:disabled { opacity: 0.5; cursor: default; }
.lv-note { padding: 0.8rem 1rem; border-radius: 10px; line-height: 1.5; font-size: 0.9rem; background: var(--bg-hover); color: var(--text-primary); }
.lv-note.is-ok { background: rgba(31,107,74,.09); }
.lv-note.is-bad { background: rgba(179,38,30,.08); color: var(--lv-bad); }
body.dark-mode .lv-note.is-ok { background: rgba(111,207,156,.12); }
body.dark-mode .lv-note.is-bad { background: rgba(255,138,128,.12); }
.lv-field label { display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 0.3rem; color: var(--text-primary); }
.lv-field textarea, .lv-field input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.8rem; border: 1.5px solid var(--border-color); border-radius: 9px; font: inherit; background: var(--bg-card); color: var(--text-primary); }
.lv-empty { padding: 2rem 1rem; text-align: center; color: var(--text-secondary); }
.lv-table { width: 100%; border-collapse: collapse; }
.lv-table th { padding: 0.55rem 0.75rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.lv-table td { padding: 0.7rem 0.75rem; border-bottom: 1px solid var(--border-color); font-size: 0.875rem; vertical-align: middle; }
.lv-table tr:last-child td { border-bottom: none; }
`;
