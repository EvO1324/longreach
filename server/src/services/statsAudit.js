/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { escFilterValue } = require('../utils/pbFilter');
const { recalculateRank } = require('./pirepStats');
const { sortRanks } = require('./rankAccess');
const { withDayLock } = require('../utils/dailyStats');
const { distanceBetween } = require('../utils/airports');

const HOURS_EPSILON = 0.01;
const round4 = n => parseFloat((n || 0).toFixed(4));
const differs = (a, b) => Math.abs((a || 0) - (b || 0)) > HOURS_EPSILON;

const FLIGHT_FIELDS = 'id,user,flight_time,status,date,departure_icao,arrival_icao,aircraft,auto_approved,multiplier_value,distance_nm';

// Pilots

async function challengeBonuses(pb, { userId = null } = {}) {
  const userFilter = userId ? `user = "${escFilterValue(userId)}"` : '';
  const entries = await pb.collection('challenge_entries')
    .getFullList({ filter: userFilter, fields: 'id,user,placement_bonus_hours', requestKey: null }).catch(() => []);
  const entryUser = Object.fromEntries(entries.map(e => [e.id, e.user]));
  const comps = !entries.length ? [] : await pb.collection('challenge_leg_completions')
    .getFullList({ filter: userId ? entries.map(e => `entry = "${escFilterValue(e.id)}"`).join(' || ') : '', fields: 'entry,flight,flight_time,hours_credited', requestKey: null })
    .catch(() => []);
  return { entries, entryUser, comps };
}

// { userId: { flights, hours } } from approved flights plus challenge bonuses
function expectedPilotTotals(flights, { entries, entryUser, comps }) {
  const byUser = {};
  const add = (u, f, h) => { if (!u) return; byUser[u] = byUser[u] || { flights: 0, hours: 0 }; byUser[u].flights += f; byUser[u].hours += h; };
  const approved = new Set();
  for (const f of flights) {
    if (f.status !== 'approved') continue;
    approved.add(f.id);
    add(f.user, 1, f.flight_time || 0);
  }
  for (const c of comps) {
    if (!approved.has(c.flight)) continue;
    add(entryUser[c.entry], 0, Math.max(0, (c.hours_credited || 0) - (c.flight_time || 0)));
  }
  for (const e of entries) if (e.placement_bonus_hours > 0) add(e.user, 0, e.placement_bonus_hours);
  for (const v of Object.values(byUser)) v.hours = round4(v.hours);
  return byUser;
}

async function expectedForPilot(pb, userId) {
  const [flights, bonuses] = await Promise.all([
    pb.collection('flights').getFullList({ filter: `user = "${escFilterValue(userId)}"`, fields: 'id,user,flight_time,status', requestKey: null }),
    challengeBonuses(pb, { userId }),
  ]);
  return expectedPilotTotals(flights, bonuses)[userId] || { flights: 0, hours: 0 };
}

// The rank a pilot's hours earn, or null below the first one (as recalculateRank)
function rankFor(sortedRanks, hours) {
  return sortedRanks.filter(r => hours >= r.hours_required).pop() || null;
}

async function auditPilots(pb, flights, { dryRun }) {
  const [users, bonuses, ranks] = await Promise.all([
    pb.collection('users').getFullList({ fields: 'id,first_name,last_name,callsign,total_flights,total_hours,rank', requestKey: null }),
    challengeBonuses(pb),
    pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null }),
  ]);
  const sortedRanks = sortRanks(ranks);
  const rankName = id => ranks.find(r => r.id === id)?.name || 'none';
  const expected = expectedPilotTotals(flights, bonuses);
  const fixed = [];
  const ranksFixed = [];
  for (const u of users) {
    let want = expected[u.id] || { flights: 0, hours: 0 };
    if (want.flights === (u.total_flights || 0) && !differs(want.hours, u.total_hours)) {
      const rank = rankFor(sortedRanks, u.total_hours || 0);
      if (rank && rank.id !== u.rank) {
        if (!dryRun) await recalculateRank(pb, u.id, u.total_hours || 0, { silent: true });
        ranksFixed.push({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.callsign || u.id, callsign: u.callsign || '', rank: [rankName(u.rank), rank.name] });
      }
      continue;
    }
    if (!dryRun) {
      want = await expectedForPilot(pb, u.id); // fresh, in case a PIREP landed meanwhile
      const now = await pb.collection('users').getOne(u.id, { fields: 'total_flights,total_hours', requestKey: null });
      if (want.flights === (now.total_flights || 0) && !differs(want.hours, now.total_hours)) continue;
      await adminPatch(u.id, { total_flights: want.flights, total_hours: want.hours });
      if (differs(want.hours, now.total_hours)) await recalculateRank(pb, u.id, want.hours, { silent: true });
    }
    fixed.push({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.callsign || u.id,
      callsign: u.callsign || '',
      flights: [u.total_flights || 0, want.flights],
      hours: [round4(u.total_hours), want.hours],
    });
  }
  return { checked: users.length, fixed, ranksFixed };
}

// va_stats

function expectedVaStats(flights) {
  const t = { total_flights: 0, total_hours: 0, total_distance_nm: 0, total_approved_pireps: 0, total_auto_approved: 0, total_multiplied_flights: 0, total_multiplied_hours: 0 };
  for (const f of flights) {
    if (f.status !== 'approved') continue;
    t.total_flights++;
    t.total_hours += f.flight_time || 0;
    t.total_distance_nm += f.distance_nm || distanceBetween(f.departure_icao, f.arrival_icao) || 0;
    if (f.auto_approved) t.total_auto_approved++;
    if (f.multiplier_value && f.multiplier_value > 1) { t.total_multiplied_flights++; t.total_multiplied_hours += f.flight_time || 0; }
  }
  t.total_approved_pireps = t.total_flights;
  t.total_hours = round4(t.total_hours);
  t.total_multiplied_hours = round4(t.total_multiplied_hours);
  t.total_distance_nm = Math.round(t.total_distance_nm);
  return t;
}

async function auditVaStats(pb, flights, { dryRun }) {
  const want = expectedVaStats(flights);
  const rec = await pb.collection('va_stats').getFirstListItem('', { requestKey: null }).catch(() => null);
  const changes = {};
  for (const [k, v] of Object.entries(want)) {
    const tol = k === 'total_distance_nm' ? 1 : HOURS_EPSILON;
    if (!rec || Math.abs((rec[k] || 0) - v) > tol) changes[k] = [rec ? rec[k] || 0 : 0, v];
  }
  if (!dryRun && Object.keys(changes).length) {
    if (rec) await pb.collection('va_stats').update(rec.id, want);
    else await pb.collection('va_stats').create(want);
  }
  return { changes, values: want };
}

// daily_stats

const emptyDay = () => ({
  flights_count: 0, hours: 0, auto_approved_count: 0, multiplied_count: 0, multiplied_hours: 0,
  rejected_count: 0, route_counts: {}, aircraft_counts: {}, pilot_counts: {},
});

// Same keys as utils/dailyStats.js recordFlight / recordRejection
function buildDays(flights) {
  const days = new Map();
  const row = d => { if (!days.has(d)) days.set(d, emptyDay()); return days.get(d); };
  for (const f of flights) {
    if (!f.date) continue;
    const d = String(f.date).slice(0, 10);
    if (f.status === 'rejected') { row(d).rejected_count++; continue; }
    if (f.status !== 'approved') continue;
    const r = row(d), h = f.flight_time || 0;
    r.flights_count++;
    r.hours += h;
    if (f.auto_approved) r.auto_approved_count++;
    if (f.multiplier_value && f.multiplier_value > 1) { r.multiplied_count++; r.multiplied_hours += h; }
    if (f.departure_icao && f.arrival_icao) {
      const k = `${f.departure_icao}-${f.arrival_icao}`;
      const v = r.route_counts[k] || (r.route_counts[k] = { count: 0, hours: 0 });
      v.count++; v.hours += h;
    }
    if (f.aircraft) {
      const k = f.aircraft.includes(' - ') ? f.aircraft.split(' - ')[0].trim() : f.aircraft.trim();
      const v = r.aircraft_counts[k] || (r.aircraft_counts[k] = { count: 0, hours: 0 });
      v.count++; v.hours += h;
    }
    if (f.user) {
      const v = r.pilot_counts[f.user] || (r.pilot_counts[f.user] = { flights: 0, hours: 0 });
      v.flights++; v.hours += h;
    }
  }
  for (const r of days.values()) {
    r.hours = round4(r.hours);
    r.multiplied_hours = round4(r.multiplied_hours);
    for (const m of [r.route_counts, r.aircraft_counts, r.pilot_counts]) for (const v of Object.values(m)) v.hours = round4(v.hours);
  }
  return days;
}

function mapDiffers(a = {}, b = {}, countKey) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = (a || {})[k] || {}, y = (b || {})[k] || {};
    if ((x[countKey] || 0) !== (y[countKey] || 0) || differs(x.hours, y.hours)) return true;
  }
  return false;
}

function dayDiffers(stored, want) {
  for (const k of ['flights_count', 'auto_approved_count', 'multiplied_count', 'rejected_count']) if ((stored[k] || 0) !== want[k]) return true;
  if (differs(stored.hours, want.hours) || differs(stored.multiplied_hours, want.multiplied_hours)) return true;
  return mapDiffers(stored.route_counts, want.route_counts, 'count')
    || mapDiffers(stored.aircraft_counts, want.aircraft_counts, 'count')
    || mapDiffers(stored.pilot_counts, want.pilot_counts, 'flights');
}

async function rebuildDay(pb, date) {
  const flights = await pb.collection('flights').getFullList({
    filter: `date ~ "${escFilterValue(date)}%"`,
    fields: FLIGHT_FIELDS, requestKey: null,
  });
  return buildDays(flights).get(date) || emptyDay();
}

async function auditDailyStats(pb, flights, { dryRun }) {
  const want = buildDays(flights);
  const stored = await pb.collection('daily_stats').getFullList({ requestKey: null });
  const storedByDate = new Map(stored.map(r => [String(r.date).slice(0, 10), r]));
  const dates = [...new Set([...want.keys(), ...storedByDate.keys()])].sort();
  const fixed = [];
  for (const date of dates) {
    const s = storedByDate.get(date);
    if (s && !dayDiffers(s, want.get(date) || emptyDay())) continue;
    if (!dryRun) {
      await withDayLock(date, async () => {
        const fresh = await rebuildDay(pb, date);
        const current = await pb.collection('daily_stats').getFirstListItem(`date = "${escFilterValue(date)}"`, { requestKey: null }).catch(() => null);
        if (current && !dayDiffers(current, fresh)) return;
        if (current) await pb.collection('daily_stats').update(current.id, fresh);
        else await pb.collection('daily_stats').create({ date, ...fresh });
      });
    }
    fixed.push({ date, created: !s });
  }
  return { checked: dates.length, fixed };
}

// Entry point

async function runStatsAudit({ dryRun = false, parts = ['pilots', 'va', 'daily'] } = {}) {
  const started = Date.now();
  const pb = await getAdminClient();
  const flights = await pb.collection('flights').getFullList({ fields: FLIGHT_FIELDS, requestKey: null });
  const result = { dryRun, flights: flights.length };
  if (parts.includes('pilots')) result.pilots = await auditPilots(pb, flights, { dryRun });
  if (parts.includes('va'))     result.va     = await auditVaStats(pb, flights, { dryRun });
  if (parts.includes('daily'))  result.daily  = await auditDailyStats(pb, flights, { dryRun });
  result.ms = Date.now() - started;
  return result;
}

module.exports = { runStatsAudit, expectedPilotTotals, buildDays, dayDiffers };
