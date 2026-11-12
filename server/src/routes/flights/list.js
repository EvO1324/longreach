/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../../config/pocketbase');
const { requireAuth, requireAuthOrApiKey, requirePermission } = require('../../middleware/auth');
const { escFilterValue } = require('../../utils/pbFilter');
const { getCached, setCached } = require('./_cache');

const router = express.Router();

// Per-user stats cache (5 min TTL) — only ever touched from this file
const myStatsCache = new Map();
function getMyStatsCached(userId) {
  const entry = myStatsCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expires) { myStatsCache.delete(userId); return null; }
  return entry.data;
}
function setMyStatsCached(userId, data) {
  myStatsCache.set(userId, { data, expires: Date.now() + 5 * 60 * 1000 });
}

router.get('/favourite-airport', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `fav-airport-${userId}`;
    const cached = getCached ? getCached(cacheKey) : null;
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const flights = await pb.collection('flights').getFullList({
      filter: `user = "${escFilterValue(userId)}" && status = "approved"`,
      fields: 'departure_icao,arrival_icao',
      requestKey: null,
    });
    const icaoCount = {};
    flights.forEach(f => {
      if (f.departure_icao) icaoCount[f.departure_icao] = (icaoCount[f.departure_icao] || 0) + 1;
      if (f.arrival_icao)   icaoCount[f.arrival_icao]   = (icaoCount[f.arrival_icao]   || 0) + 1;
    });
    const top = Object.entries(icaoCount).sort((a, b) => b[1] - a[1])[0];
    const result = top ? { icao: top[0], count: top[1] } : null;
    if (setCached) setCached(cacheKey, result, 10 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[flights/favourite-airport]', err);
    res.status(500).json({ error: 'Failed to fetch favourite airport' });
  }
});

router.get('/my-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const cached = getMyStatsCached(userId);
    if (cached) return res.json(cached);

    const pb = await getAdminClient();
    const flights = await pb.collection('flights').getFullList({
      filter: `user = "${escFilterValue(userId)}" && status = "approved"`,
      fields: 'id,departure_icao,arrival_icao,aircraft,flight_time,distance_nm,date,landing_stats,fuel_used_kg',
      sort: '-date',
      requestKey: null,
    });

    if (!flights.length) {
      const empty = { total_flights: 0, total_hours: 0, total_distance_nm: 0, avg_flight_time: 0, longest_flight: null, this_month: { flights: 0, hours: 0 }, last_month: { flights: 0, hours: 0 }, top_routes: [], top_airports: [], top_aircraft: [], by_month: [], busiest_dow: null };
      return res.json(empty);
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    // Totals
    const totalHours    = flights.reduce((s, f) => s + (f.flight_time || 0), 0);
    const totalDistance = flights.reduce((s, f) => s + (f.distance_nm || 0), 0);
    const longest       = flights.reduce((best, f) => (!best || (f.flight_time || 0) > best.flight_time) ? f : best, null);

    // This month / last month
    const thisMonth = flights.filter(f => f.date >= thisMonthStart);
    const lastMonth = flights.filter(f => f.date >= lastMonthStart && f.date <= lastMonthEnd);

    // Top routes (dep → arr pairs)
    const routeMap = {};
    flights.forEach(f => {
      if (!f.departure_icao || !f.arrival_icao) return;
      const key = `${f.departure_icao}-${f.arrival_icao}`;
      if (!routeMap[key]) routeMap[key] = { dep: f.departure_icao, arr: f.arrival_icao, count: 0, hours: 0 };
      routeMap[key].count++;
      routeMap[key].hours += f.flight_time || 0;
    });
    const topRoutes = Object.values(routeMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(r => ({ ...r, hours: parseFloat(r.hours.toFixed(2)) }));

    // Top airports (by total appearances as dep or arr)
    const airportMap = {};
    flights.forEach(f => {
      [f.departure_icao, f.arrival_icao].forEach(icao => {
        if (!icao) return;
        if (!airportMap[icao]) airportMap[icao] = { icao, departures: 0, arrivals: 0, total: 0 };
        if (icao === f.departure_icao) airportMap[icao].departures++;
        if (icao === f.arrival_icao)   airportMap[icao].arrivals++;
        airportMap[icao].total++;
      });
    });
    const topAirports = Object.values(airportMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Top aircraft
    const aircraftMap = {};
    flights.forEach(f => {
      if (!f.aircraft) return;
      const type = f.aircraft.split(' - ')[0].trim();
      if (!aircraftMap[type]) aircraftMap[type] = { type, count: 0, hours: 0 };
      aircraftMap[type].count++;
      aircraftMap[type].hours += f.flight_time || 0;
    });
    const topAircraft = Object.values(aircraftMap)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
      .map(a => ({ ...a, hours: parseFloat(a.hours.toFixed(2)) }));

    // By month (last 12 months for chart)
    const monthMap = {};
    flights.forEach(f => {
      const d   = new Date(f.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) {
        const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
        monthMap[key] = { label: `${mo} '${String(d.getFullYear()).slice(2)}`, shortLabel: mo, flights: 0, hours: 0 };
      }
      monthMap[key].flights++;
      monthMap[key].hours += f.flight_time || 0;
    });
    const byMonth = Object.keys(monthMap).sort().slice(-12)
      .map(k => ({ ...monthMap[k], hours: parseFloat(monthMap[k].hours.toFixed(1)) }));

    // Busiest day of week
    const dowCounts = Array(7).fill(0);
    flights.forEach(f => { dowCounts[(new Date(f.date).getDay() + 6) % 7]++; });
    const dowNames   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const busiestDow = dowNames[dowCounts.indexOf(Math.max(...dowCounts))];

    // Activity streak
    const flightDates = [...new Set(flights.map(f => f.date?.slice(0, 10)).filter(Boolean))].sort().reverse();
    let streak = 0;
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (flightDates.length && (flightDates[0] === today || flightDates[0] === yesterday)) {
      let check = flightDates[0];
      for (const d of flightDates) {
        if (d === check) {
          streak++;
          const prev = new Date(check + 'T12:00:00Z');
          prev.setUTCDate(prev.getUTCDate() - 1);
          check = prev.toISOString().slice(0, 10);
        } else break;
      }
    }

    // Landing stats
    const MS_TO_FPM = 196.85;
    const allLandings = [];
    let totalFuelKg = 0, fuelFlightCount = 0;
    for (const f of flights) {
      if (f.fuel_used_kg != null) { totalFuelKg += f.fuel_used_kg; fuelFlightCount++; }
      const ls = f.landing_stats ? (typeof f.landing_stats === 'string' ? JSON.parse(f.landing_stats) : f.landing_stats) : [];
      for (const l of ls) {
        const vsFpm = Math.abs(Math.round((l.verticalSpeed || 0) * MS_TO_FPM));
        const gForce = l.maxGForce || 0;
        let grade = vsFpm <= 100 ? 'A' : vsFpm <= 200 ? 'B' : vsFpm <= 300 ? 'C' : vsFpm <= 500 ? 'D' : 'F';
        if (gForce > 1.5 && grade !== 'F') grade = String.fromCharCode(grade.charCodeAt(0) + 1);
        allLandings.push({
          vs_fpm:      vsFpm,
          g_force:     parseFloat(gForce.toFixed(2)),
          grade,
          flight_id:   f.id,
          date:        f.date,
          dep:         f.departure_icao,
          arr:         f.arrival_icao,
          dist_1k_ft:  l.distanceFrom1kftMarker ?? null,
          centerline:  l.centerlineDistance       ?? null,
        });
      }
    }
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    allLandings.forEach(l => { gradeCounts[l.grade] = (gradeCounts[l.grade] || 0) + 1; });
    const avgVs     = allLandings.length ? Math.round(allLandings.reduce((s, l) => s + l.vs_fpm, 0) / allLandings.length) : null;
    const avgG      = allLandings.length ? parseFloat((allLandings.reduce((s, l) => s + l.g_force, 0) / allLandings.length).toFixed(2)) : null;
    const bestLand  = allLandings.length ? allLandings.reduce((b, l) => l.vs_fpm < b.vs_fpm ? l : b) : null;
    const worstLand = allLandings.length ? allLandings.reduce((w, l) => l.vs_fpm > w.vs_fpm ? l : w) : null;
    const avgFuelKgPerHr = (fuelFlightCount > 0 && totalHours > 0)
      ? parseFloat((totalFuelKg / (totalHours * (flights.length / fuelFlightCount))).toFixed(1))
      : null;

    const result = {
      total_flights:    flights.length,
      total_hours:      parseFloat(totalHours.toFixed(2)),
      total_distance_nm: Math.round(totalDistance),
      avg_flight_time:  parseFloat((totalHours / flights.length).toFixed(2)),
      longest_flight:   longest ? {
        dep: longest.departure_icao, arr: longest.arrival_icao,
        hours: parseFloat((longest.flight_time || 0).toFixed(2)),
        date: longest.date,
      } : null,
      this_month: {
        flights: thisMonth.length,
        hours: parseFloat(thisMonth.reduce((s, f) => s + (f.flight_time || 0), 0).toFixed(2)),
      },
      last_month: {
        flights: lastMonth.length,
        hours: parseFloat(lastMonth.reduce((s, f) => s + (f.flight_time || 0), 0).toFixed(2)),
      },
      top_routes:    topRoutes,
      top_airports:  topAirports,
      top_aircraft:  topAircraft,
      by_month:      byMonth,
      busiest_dow:   busiestDow,
      dow_counts:    dowCounts,
      streak,
      landing_stats: {
        total_landings:   allLandings.length,
        avg_vs_fpm:       avgVs,
        avg_g_force:      avgG,
        grade_counts:     gradeCounts,
        best_landing:     bestLand,
        worst_landing:    worstLand,
        avg_fuel_kg_per_hr: avgFuelKgPerHr,
        total_fuel_kg:    fuelFlightCount > 0 ? parseFloat(totalFuelKg.toFixed(1)) : null,
        all_landings:     allLandings.slice(0, 50), // most recent 50 for the runway diagram
      },
    };

    setMyStatsCached(userId, result);
    res.json(result);
  } catch (err) {
    console.error('[flights/my-stats]', err);
    res.status(500).json({ error: 'Failed to fetch personal stats' });
  }
});

// GET /api/flights
router.get('/', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { user, status, sort = '-date', limit, page, fields, rejection_note_read, search, departure_icao, arrival_icao, from_date } = req.query;

    const filters = [];
    if (user)           filters.push(`user = "${escFilterValue(user)}"`);
    if (status)         filters.push(`status = "${escFilterValue(status)}"`);
    if (departure_icao) filters.push(`departure_icao = "${escFilterValue(departure_icao.toUpperCase())}"`);
    if (arrival_icao)   filters.push(`arrival_icao = "${escFilterValue(arrival_icao.toUpperCase())}"`);
    if (from_date)      filters.push(`date >= "${escFilterValue(from_date)} 00:00:00"`);
    if (rejection_note_read === 'false') filters.push(`rejection_note_read = false`);
    if (rejection_note_read === 'true')  filters.push(`rejection_note_read = true`);
    if (search) {
      const q = escFilterValue(search);
      filters.push(`(flight_number ~ "${q}" || departure_icao ~ "${q}" || arrival_icao ~ "${q}" || aircraft ~ "${q}" || registration ~ "${q}")`);
    }

    const filter = filters.join(' && ') || '';

    const limitNum = limit ? parseInt(limit) : 500;
    const pageNum  = parseInt(page) || 1;
    const opts = { filter, sort, requestKey: null };
    if (!fields) opts.expand = 'user';
    if (fields)  opts.fields = fields;
    const result = await pb.collection('flights').getList(pageNum, limitNum, opts);

    res.json({ flights: result.items, total: result.totalItems });
  } catch (err) {
    console.error('[flights/list]', err);
    res.status(500).json({ error: 'Failed to fetch flights' });
  }
});

router.get('/stats/aircraft', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    // Use va_stats aircraft breakdown if available, else aggregate (cached 10min)
    const cacheKey = 'aircraft-stats';
    const cached = getCached ? getCached(cacheKey) : null;
    if (cached) return res.json(cached);
    const flights = await pb.collection('flights').getFullList({
      filter: 'status = "approved"',
      fields: 'aircraft,flight_time,distance_nm',
      requestKey: null,
    });
    const stats = {};
    for (const f of flights) {
      const ac = f.aircraft || 'Unknown';
      if (!stats[ac]) stats[ac] = { flights: 0, hours: 0, distance_nm: 0 };
      stats[ac].flights += 1;
      stats[ac].hours += f.flight_time || 0;
      stats[ac].distance_nm += f.distance_nm || 0;
    }
    const result = { stats };
    if (setCached) setCached(cacheKey, result, 10 * 60 * 1000); // 10min cache
    res.json(result);
  } catch (err) {
    console.error('[flights/stats/aircraft]', err);
    res.status(500).json({ error: 'Failed to fetch aircraft stats' });
  }
});

router.get('/pending', requirePermission('pireps.view'), async (req, res) => {
  try {
    const cached = getCached('flights-pending');
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const flights = await pb.collection('flights').getFullList({
      filter: 'status = "pending"',
      sort: '-created',
      expand: 'user',
      requestKey: null,
    });
    const result = { flights };
    setCached('flights-pending', result, 45 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending flights' });
  }
});

module.exports = router;
