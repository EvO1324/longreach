/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useEffect, useState } from 'react';
import { ranks as ranksApi } from '../api/client';

// Flight-number prefixes that count as "our" flights. Everything else is a
// codeshare.
export const HOME_AIRLINES = ['QF', 'JQ'];

const MANUFACTURERS = /^(airbus|boeing|embraer|bombardier|de havilland canada|de havilland|mitsubishi|cessna|daher)\s+/;
export function normaliseType(name) {
  if (!name) return '';
  let s = String(name).split(' - ')[0].trim().toLowerCase();
  s = s.replace(MANUFACTURERS, '');
  s = s.replace(/[\s-]+/g, '');
  s = s.replace(/^dash8q?400$/, 'dash8q400');
  return s;
}

export function isCodeshare(flightNumber) {
  const fn = String(flightNumber || '').trim().toUpperCase();
  if (!fn) return false;
  return !HOME_AIRLINES.some(p => fn.startsWith(p));
}

export function parseRouteAircraft(raw) {
  if (!raw) return [];
  let items;
  if (Array.isArray(raw)) items = raw;
  else {
    const s = String(raw).trim();
    if (s.startsWith('[')) { try { items = JSON.parse(s); } catch { items = [s]; } }
    else items = [s];
  }
  return items.flatMap(x => String(x).split('|')).map(v => v.trim()).filter(Boolean);
}

// Name of the rank needed for this aircraft, or null if the pilot can fly it.
export function aircraftLock(access, aircraftName) {
  const rule = access.aircraft_rules[normaliseType(aircraftName)];
  if (!rule || rule.rank_index <= access.rank_index) return null;
  return rule.rank_name;
}

export function routeLock(access, route) {
  if (isCodeshare(route.flight_number) && !access.codeshares_unlocked) {
    return `Codeshares unlock at ${access.codeshare_unlock_rank || 'a higher rank'}`;
  }
  const aircraft = parseRouteAircraft(route.aircraft);
  if (!aircraft.length) return null;
  const locks = aircraft.map(ac => aircraftLock(access, ac));
  if (locks.every(Boolean)) return locks[0];
  return null;
}

// Pilot's rank access from the server. null while loading (or on error).
export function useRankAccess() {
  const [access, setAccess] = useState(null);
  useEffect(() => {
    let cancelled = false;
    ranksApi.me().then(a => { if (!cancelled) setAccess(a); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return access;
}
