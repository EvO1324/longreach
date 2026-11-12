/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Flight-number prefixes that count as "our" flights. Everything else is a
// codeshare.
const HOME_AIRLINES = ['QF', 'JQ'];

// Pure helpers

const MANUFACTURERS = /^(airbus|boeing|embraer|bombardier|de havilland canada|de havilland|mitsubishi|cessna|daher)\s+/;
function normaliseType(name) {
  if (!name) return '';
  let s = String(name).split(' - ')[0].trim().toLowerCase();
  s = s.replace(MANUFACTURERS, '');
  s = s.replace(/[\s-]+/g, '');
  s = s.replace(/^dash8q?400$/, 'dash8q400');
  return s;
}

// Ranks ordered from lowest to highest: hours first, order_position breaks ties.
function sortRanks(ranks) {
  return [...(ranks || [])].sort((a, b) =>
    (a.hours_required || 0) - (b.hours_required || 0) ||
    (a.order_position || 0) - (b.order_position || 0));
}

function currentRankIndex(sorted, hours) {
  let idx = -1;
  sorted.forEach((r, i) => { if ((hours || 0) >= (r.hours_required || 0)) idx = i; });
  return idx;
}

function parseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function buildAircraftRules(sorted) {
  const rules = {};
  sorted.forEach((r, i) => {
    parseList(r.aircraft_restrictions).forEach(type => {
      const key = normaliseType(type);
      if (key && !rules[key]) rules[key] = { type, rank_id: r.id, rank_name: r.name, rank_index: i };
    });
  });
  return rules;
}

function codeshareUnlockIndex(sorted) {
  const flagged = sorted.findIndex(r => r.unlocks_codeshares === true);
  if (flagged !== -1) return flagged;
  return sorted.length > 1 ? 1 : 0;
}

function isCodeshare(flightNumber) {
  const fn = String(flightNumber || '').trim().toUpperCase();
  if (!fn) return false;
  return !HOME_AIRLINES.some(p => fn.startsWith(p));
}

function parseRouteAircraft(raw) {
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
function aircraftLock(access, aircraftName) {
  const rule = access.aircraft_rules[normaliseType(aircraftName)];
  if (!rule || rule.rank_index <= access.rank_index) return null;
  return rule.rank_name;
}

function routeLock(access, route) {
  if (isCodeshare(route.flight_number) && !access.codeshares_unlocked) {
    return `Codeshares unlock at ${access.codeshare_unlock_rank || 'a higher rank'}`;
  }
  const aircraft = parseRouteAircraft(route.aircraft);
  if (!aircraft.length) return null;
  const locks = aircraft.map(ac => aircraftLock(access, ac));
  if (locks.every(Boolean)) return locks[0];
  return null;
}

function computeAccess(ranks, hours) {
  const sorted = sortRanks(ranks);
  const idx = currentRankIndex(sorted, hours);
  const rank = idx >= 0 ? sorted[idx] : null;
  const csIdx = codeshareUnlockIndex(sorted);
  return {
    rank: rank ? { id: rank.id, name: rank.name, order_position: rank.order_position } : null,
    rank_index: idx,
    hours: hours || 0,
    codeshares_unlocked: idx >= csIdx,
    codeshare_unlock_rank: sorted[csIdx]?.name || null,
    manual_pirep: !!rank?.allows_manual_pirep,
    pirep_multiplier: rank?.pirep_multiplier > 1 ? rank.pirep_multiplier : null,
    aircraft_rules: buildAircraftRules(sorted),
    home_airlines: HOME_AIRLINES,
  };
}

// DB-backed helpers

let rankCache = { at: 0, ranks: null };
const RANK_TTL_MS = 60 * 1000;

async function loadRanks(pb) {
  if (rankCache.ranks && Date.now() - rankCache.at < RANK_TTL_MS) return rankCache.ranks;
  const ranks = await pb.collection('ranks').getFullList({ requestKey: null, sort: 'hours_required' });
  rankCache = { at: Date.now(), ranks };
  return ranks;
}

// Call after any rank create/update/delete so changes apply immediately.
function invalidateRanks() { rankCache = { at: 0, ranks: null }; }

async function getAccess(pb, user) {
  const ranks = await loadRanks(pb);
  return computeAccess(ranks, user?.total_hours || 0);
}

// The rank record a pilot with these hours holds (null if none).
async function rankForHours(pb, hours) {
  const sorted = sortRanks(await loadRanks(pb));
  const idx = currentRankIndex(sorted, hours);
  return idx >= 0 ? sorted[idx] : null;
}

module.exports = {
  HOME_AIRLINES,
  normaliseType, sortRanks, currentRankIndex, buildAircraftRules, codeshareUnlockIndex,
  isCodeshare, parseRouteAircraft, aircraftLock, routeLock, computeAccess,
  loadRanks, invalidateRanks, getAccess, rankForHours,
};
