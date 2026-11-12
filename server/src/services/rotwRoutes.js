/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const brand = require('../config/brand');

const ROTW_WINDOW_DAYS = 14;
const TTL_MS = 2 * 60 * 1000;

let cache = { at: 0, keys: null };

const key = (dep, arr) => `${String(dep || '').trim().toUpperCase()}-${String(arr || '').trim().toUpperCase()}`;

function sydneyDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: brand.timezone });
}

async function loadKeys(pb) {
  if (cache.keys && Date.now() - cache.at < TTL_MS) return cache.keys;
  const weeks = await pb.collection('rotw_weeks').getFullList({
    filter: `week_start >= "${sydneyDate(-ROTW_WINDOW_DAYS + 1)}" && week_start <= "${sydneyDate()} 23:59:59"`,
    requestKey: null,
  });
  const keys = new Set();
  if (weeks.length) {
    const slots = await pb.collection('rotw_slots').getFullList({
      filter: weeks.map(w => `week = "${w.id}"`).join(' || '),
      expand: 'route,return_route',
      requestKey: null,
    });
    for (const s of slots) {
      for (const r of [s.expand?.route, s.expand?.return_route]) {
        if (r) keys.add(key(r.departure_icao, r.arrival_icao));
      }
    }
  }
  cache = { at: Date.now(), keys };
  return keys;
}

async function isRotwRoute(pb, dep, arr) {
  try { return (await loadKeys(pb)).has(key(dep, arr)); } catch { return false; }
}

function invalidateRotwRoutes() { cache = { at: 0, keys: null }; }

module.exports = { isRotwRoute, invalidateRotwRoutes };
