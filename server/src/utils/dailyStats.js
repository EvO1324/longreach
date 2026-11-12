/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { escFilterValue } = require('./pbFilter');
const { getAdminClient } = require('../config/pocketbase');

const dayLocks = new Map(); // date -> Promise chain

function withDayLock(date, fn) {
  const prev = dayLocks.get(date) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (dayLocks.get(date) === next) dayLocks.delete(date);
  });
  dayLocks.set(date, next);
  return next;
}

function dayOf(dateInput) {
  const s = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  return s.slice(0, 10);
}

async function getOrInitRow(pb, date) {
  try {
    return await pb.collection('daily_stats').getFirstListItem(`date = "${escFilterValue(date)}"`, { requestKey: null });
  } catch {
    try {
      return await pb.collection('daily_stats').create({
        date, flights_count: 0, hours: 0, auto_approved_count: 0,
        multiplied_count: 0, multiplied_hours: 0, rejected_count: 0,
        route_counts: {}, aircraft_counts: {}, pilot_counts: {},
      });
    } catch (err) {
      return pb.collection('daily_stats').getFirstListItem(`date = "${escFilterValue(date)}"`, { requestKey: null });
    }
  }
}

async function recordFlight(pb, { date, flightTime, autoApproved, multiplied, departureIcao, arrivalIcao, aircraft, userId }) {
  const day = dayOf(date);
  return withDayLock(day, async () => {
    const rec = await getOrInitRow(pb, day);

    const routeKey = departureIcao && arrivalIcao ? `${departureIcao}-${arrivalIcao}` : null;
    const acType = aircraft
      ? (aircraft.includes(' - ') ? aircraft.split(' - ')[0].trim() : aircraft.trim())
      : null;

    const routeCounts    = { ...(rec.route_counts    || {}) };
    const aircraftCounts = { ...(rec.aircraft_counts || {}) };
    const pilotCounts    = { ...(rec.pilot_counts    || {}) };

    if (routeKey) {
      const r = routeCounts[routeKey] || { count: 0, hours: 0 };
      r.count += 1;
      r.hours = parseFloat((r.hours + (flightTime || 0)).toFixed(4));
      routeCounts[routeKey] = r;
    }
    if (acType) {
      const a = aircraftCounts[acType] || { count: 0, hours: 0 };
      a.count += 1;
      a.hours = parseFloat((a.hours + (flightTime || 0)).toFixed(4));
      aircraftCounts[acType] = a;
    }
    if (userId) {
      const p = pilotCounts[userId] || { flights: 0, hours: 0 };
      p.flights += 1;
      p.hours = parseFloat((p.hours + (flightTime || 0)).toFixed(4));
      pilotCounts[userId] = p;
    }

    await pb.collection('daily_stats').update(rec.id, {
      flights_count:       (rec.flights_count || 0) + 1,
      hours:                parseFloat(((rec.hours || 0) + (flightTime || 0)).toFixed(4)),
      auto_approved_count: (rec.auto_approved_count || 0) + (autoApproved ? 1 : 0),
      multiplied_count:    (rec.multiplied_count || 0) + (multiplied ? 1 : 0),
      multiplied_hours: parseFloat(((rec.multiplied_hours || 0) + (multiplied ? (flightTime || 0) : 0)).toFixed(4)),
      route_counts:    routeCounts,
      aircraft_counts: aircraftCounts,
      pilot_counts:    pilotCounts,
    });
  });
}

async function recordRejection(pb, date) {
  const day = dayOf(date);
  return withDayLock(day, async () => {
    const rec = await getOrInitRow(pb, day);
    await pb.collection('daily_stats').update(rec.id, {
      rejected_count: (rec.rejected_count || 0) + 1,
    });
  });
}

async function getRangeStats(pb, fromDate, toDate) {
  const from = dayOf(fromDate);
  const to   = dayOf(toDate);
  const rows = await pb.collection('daily_stats').getFullList({
    filter: `date >= "${escFilterValue(from)}" && date <= "${escFilterValue(to)}"`,
    requestKey: null,
    sort: 'date',
  });

  const totals = {
    flights: 0, hours: 0, autoApproved: 0, multiplied: 0, multipliedHours: 0, rejected: 0,
    routeCounts: {}, aircraftCounts: {}, pilotCounts: {},
  };

  for (const row of rows) {
    totals.flights        += row.flights_count       || 0;
    totals.hours          += row.hours               || 0;
    totals.autoApproved   += row.auto_approved_count  || 0;
    totals.multiplied     += row.multiplied_count     || 0;
    totals.multipliedHours += row.multiplied_hours    || 0;
    totals.rejected        += row.rejected_count      || 0;
    for (const [k, v] of Object.entries(row.route_counts || {})) {
      const cur = totals.routeCounts[k] || { count: 0, hours: 0 };
      cur.count += v.count || 0;
      cur.hours += v.hours || 0;
      totals.routeCounts[k] = cur;
    }
    for (const [k, v] of Object.entries(row.aircraft_counts || {})) {
      const cur = totals.aircraftCounts[k] || { count: 0, hours: 0 };
      cur.count += v.count || 0;
      cur.hours += v.hours || 0;
      totals.aircraftCounts[k] = cur;
    }
    for (const [pid, p] of Object.entries(row.pilot_counts || {})) {
      const cur = totals.pilotCounts[pid] || { flights: 0, hours: 0 };
      cur.flights += p.flights || 0;
      cur.hours   += p.hours   || 0;
      totals.pilotCounts[pid] = cur;
    }
  }
  totals.hours = parseFloat(totals.hours.toFixed(4));
  totals.multipliedHours = parseFloat(totals.multipliedHours.toFixed(4));

  return { rows, totals };
}

async function getActivePilotIds(pb, days = 30) {
  const to = new Date();
  const from = new Date(to); from.setDate(from.getDate() - days);
  const { rows } = await getRangeStats(pb, from, to);
  const ids = new Set();
  for (const row of rows) {
    for (const pid of Object.keys(row.pilot_counts || {})) ids.add(pid);
  }
  return ids;
}

module.exports = { recordFlight, recordRejection, getRangeStats, getActivePilotIds, dayOf, withDayLock };
