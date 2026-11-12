/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { distanceBetween } = require('../utils/airports');
const { requireAdmin, requireAuthOrApiKey, requireAuth, requirePermission } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');

const { notifyRouteRequest } = require('./discord');
const dailyStats = require('../utils/dailyStats');
const { runStatsAudit } = require('../services/statsAudit');
const { tagDevelopers } = require('../utils/developers');

const { renderHealthCard } = require('../services/healthCard');
const { lookupLivery } = require('../utils/ifLiveryLookup');
const rankAccess = require('../services/rankAccess');
const router = express.Router();

// Simple in-memory cache (5 min TTL)
const { createCache } = require('../utils/cache');
const { getCached, setCached, invalidateCache, invalidatePrefix } = createCache('va');

// calcDistanceNm wraps the sync distanceBetween for use in async contexts
const calcDistanceNm = (dep, arr) => Promise.resolve(distanceBetween(dep, arr));

// Fleet

// GET /api/fleet
router.get('/fleet', requireAuthOrApiKey, async (req, res) => {
  try {
    const cached = getCached('fleet');
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const fleet = await pb.collection('fleet').getFullList({ requestKey: null, sort: 'name' });
    const sortedRanks = rankAccess.sortRanks(await rankAccess.loadRanks(pb));
    const rules = rankAccess.buildAircraftRules(sortedRanks);
    const requiredRankFor = (type) => {
      const rule = rules[rankAccess.normaliseType(type)];
      if (!rule) return null;
      const r = sortedRanks[rule.rank_index];
      return { id: r.id, name: r.name, order_position: r.order_position, rank_index: rule.rank_index };
    };

    // Group by aircraft type
    const grouped = {};
    fleet.forEach(item => {
      const type = item.name.split(' - ')[0];
      if (!grouped[type]) {
        grouped[type] = {
          type,
          required_rank: requiredRankFor(type),
          liveries: [],
        };
      }
      grouped[type].liveries.push({
        id: item.id,
        name: item.name,
        livery_name: item.livery_name,
        aircraft_id: item.aircraft_id,
        livery_id: item.livery_id,
        image_url: item.image_url || '',
        icao_code: item.icao_code || '',
      });
    });

    const result = { fleet: Object.values(grouped) };
    setCached('fleet', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

router.post('/fleet', requireAdmin, async (req, res) => {
  try {
    const { name, aircraft_id, livery_id, livery_name, image_url } = req.body;
    if (!name || !aircraft_id || !livery_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const pb = await getAdminClient();
    // the ICAO code belongs to the aircraft type: a new livery takes the type's code
    const sameType = await pb.collection('fleet').getFullList({ filter: `aircraft_id = "${escFilterValue(aircraft_id)}"`, fields: 'id,icao_code', requestKey: null });
    const typeCode = sameType.find(f => f.icao_code)?.icao_code || '';
    const icao_code = typeCode || String(req.body.icao_code || '').trim().toUpperCase().slice(0, 6);
    const item = await pb.collection('fleet').create({ name, aircraft_id, livery_id, livery_name, image_url: String(image_url || '').trim(), icao_code });
    if (icao_code && !typeCode) {
      await Promise.all(sameType.map(f => pb.collection('fleet').update(f.id, { icao_code })));
    }
    invalidateCache('fleet');
    logAction(req.user, 'fleet.added', { id: item.id, name: item.name }, { livery: livery_name });
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add aircraft' });
  }
});

router.patch('/fleet/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('fleet').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const item = await pb.collection('fleet').update(req.params.id, req.body);
    invalidateCache('fleet');
    logAction(req.user, 'fleet.updated', { id: item.id, name: item.name }, { changes: diffFields(before, req.body) });
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update fleet item' });
  }
});
router.delete('/fleet/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const fleetItem = await pb.collection('fleet').getOne(req.params.id, { requestKey: null });
    await pb.collection('fleet').delete(req.params.id);
    invalidateCache('fleet');
    logAction(req.user, 'fleet.removed', { id: req.params.id, name: fleetItem.name }, {});
    res.json({ message: 'Aircraft removed' });
  } catch (err) {
    console.error('Fleet delete error:', err);
    res.status(500).json({ error: 'Failed to remove aircraft', detail: err?.message || String(err) });
  }
});

// Ranks

router.get('/ranks', async (req, res) => {
  try {
    const cached = getCached('ranks');
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const ranks = await pb.collection('ranks').getFullList({ requestKey: null, sort: 'hours_required' });
    setCached('ranks', { ranks });
    res.json({ ranks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ranks' });
  }
});

router.get('/ranks/me', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null, fields: 'id,total_hours' });
    res.json(await rankAccess.getAccess(pb, user));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load rank access' });
  }
});

router.post('/ranks', requireAdmin, async (req, res) => {
  try {
    const { name, hours_required, order_position, pirep_multiplier, unlocks_codeshares } = req.body;
    if (!name || hours_required === undefined || !order_position) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const pb = await getAdminClient();
    const payload = { name, hours_required, order_position };
    if (pirep_multiplier != null) payload.pirep_multiplier = parseFloat(pirep_multiplier);
    if (unlocks_codeshares != null) payload.unlocks_codeshares = !!unlocks_codeshares;
    const rank = await pb.collection('ranks').create(payload);
    invalidateCache('ranks'); rankAccess.invalidateRanks();
    logAction(req.user, 'rank.created', { id: rank.id, name: rank.name }, { hours: hours_required });
    res.status(201).json({ rank });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create rank' });
  }
});

router.patch('/ranks/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    // Coerce pirep_multiplier to float if present
    const body = { ...req.body };
    if (body.pirep_multiplier != null) body.pirep_multiplier = parseFloat(body.pirep_multiplier);
    const before = await pb.collection('ranks').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const rank = await pb.collection('ranks').update(req.params.id, body);
    invalidateCache('ranks'); rankAccess.invalidateRanks();
    logAction(req.user, 'rank.updated', { id: rank.id, name: rank.name }, { changes: diffFields(before, body) });
    res.json({ rank });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rank' });
  }
});

router.delete('/ranks/:id', requireAdmin, async (req, res) => {
  try {
    invalidateCache('ranks'); rankAccess.invalidateRanks();
    const pb = await getAdminClient();
    const rank = await pb.collection('ranks').getOne(req.params.id, { requestKey: null });
    await pb.collection('ranks').delete(req.params.id);
    logAction(req.user, 'rank.deleted', { id: req.params.id, name: rank.name }, {});
    res.json({ message: 'Rank deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rank' });
  }
});

// Routes

router.get('/routes/search', requireAuthOrApiKey, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ routes: [] });
    const pb = await getAdminClient();
    const search = q.trim().toUpperCase().replace(/"/g, '');

    let access = null;
    if (req.user?.id) {
      const user = await pb.collection('users').getOne(req.user.id, { requestKey: null, fields: 'id,total_hours' }).catch(() => null);
      if (user) access = await rankAccess.getAccess(pb, user);
    }

    const filter = `active = true && (flight_number ~ "${search}" || departure_icao ~ "${search}" || arrival_icao ~ "${search}")`;

    const matched = [];
    let page = 1;
    const batchSize = 50;

    while (matched.length < 15) {
      const batch = await pb.collection('routes').getList(page, batchSize, {
        requestKey: null,
        filter,
        sort: 'flight_number',
        fields: 'id,flight_number,departure_icao,arrival_icao,aircraft,distance_nm,duration_min',
      });

      for (const r of batch.items) {
        if (access && rankAccess.routeLock(access, r)) continue;

        matched.push(r);
        if (matched.length >= 15) break;
      }

      // No more pages
      if (page * batchSize >= batch.totalItems) break;
      page++;
    }

    res.json({ routes: matched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search routes' });
  }
});

// GET /api/routes
router.get('/routes', requireAuthOrApiKey, async (req, res) => {
  try {
    const { active, ids, fields } = req.query;

    if (ids) {
      const idList = ids.split(',').map(id => id.trim()).filter(Boolean);
      if (!idList.length) return res.json({ routes: [] });
      const pb = await getAdminClient();
      const filter = idList.map(id => `id = "${id}"`).join(' || ');
      const opts = { requestKey: null, filter };
      if (fields) opts.fields = fields;
      const routes = await pb.collection('routes').getFullList(opts);
      return res.json({ routes });
    }

    const filter = active === 'false' ? '' : 'active = true';
    const cacheKey = `routes-${filter}-${fields || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const opts = { requestKey: null, filter, sort: 'flight_number' };
    if (fields) opts.fields = fields;
    const routes = await pb.collection('routes').getFullList(opts);
    const result = { routes };
    setCached(cacheKey, result, 10 * 60 * 1000); // 10 min TTL
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

router.post('/routes', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const route = await pb.collection('routes').create(req.body);
    invalidatePrefix('routes-');
    logAction(req.user, 'route.created', { id: route.id, name: route.flight_number }, { dep: route.departure_icao, arr: route.arrival_icao });
    res.status(201).json({ route });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create route' });
  }
});

router.patch('/routes/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('routes').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const route = await pb.collection('routes').update(req.params.id, req.body);
    invalidatePrefix('routes-');
    logAction(req.user, 'route.updated', { id: route.id, name: route.flight_number }, { changes: diffFields(before, req.body) });
    res.json({ route });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update route' });
  }
});

router.delete('/routes/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const route = await pb.collection('routes').getOne(req.params.id, { requestKey: null });
    await pb.collection('routes').delete(req.params.id);
    invalidatePrefix('routes-');
    logAction(req.user, 'route.deleted', { id: req.params.id, name: route.flight_number }, {});
    res.json({ message: 'Route deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

// Infinite Flight API Proxy (keeps API key server-side)

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

// GET /api/if/aircraft
router.get('/if/aircraft', requireAuthOrApiKey, async (req, res) => {
  try {
    const cached = getCached('if_aircraft');
    if (cached) return res.json(cached);
    const response = await fetch(`${IF_BASE}/aircraft?apikey=${process.env.IF_API_KEY}`);
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    const result = { result: data.result };
    setCached('if_aircraft', result, 60 * 60 * 1000); // 60min TTL per IF API docs
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch aircraft from Infinite Flight' });
  }
});

// GET /api/if/aircraft/:id/liveries
router.get('/if/aircraft/:id/liveries', requireAuthOrApiKey, async (req, res) => {
  try {
    const cacheKey = `if_liveries_${req.params.id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const response = await fetch(`${IF_BASE}/aircraft/${req.params.id}/liveries?apikey=${process.env.IF_API_KEY}`);
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    const result = { result: data.result };
    setCached(cacheKey, result, 60 * 60 * 1000); // 60min TTL per IF API docs
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch liveries from Infinite Flight' });
  }
});

router.get('/if/aircraft-livery-map', requireAuthOrApiKey, async (req, res) => {
  try {
    const cached = getCached('if_aircraft_livery_map');
    if (cached) return res.json(cached);

    let aircraftCatalog = getCached('if_aircraft');
    if (!aircraftCatalog) {
      const response = await fetch(`${IF_BASE}/aircraft?apikey=${process.env.IF_API_KEY}`);
      const data = await response.json();
      if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
      aircraftCatalog = { result: data.result };
      setCached('if_aircraft', aircraftCatalog, 60 * 60 * 1000);
    }

    const map = {};
    await Promise.all((aircraftCatalog.result || []).map(async (ac) => {
      map[ac.id] = ac.name;
      try {
        const liveryCacheKey = `if_liveries_${ac.id}`;
        let liveries = getCached(liveryCacheKey);
        if (!liveries) {
          const lr = await fetch(`${IF_BASE}/aircraft/${ac.id}/liveries?apikey=${process.env.IF_API_KEY}`);
          const ld = await lr.json();
          if (ld.errorCode === 0) {
            liveries = { result: ld.result };
            setCached(liveryCacheKey, liveries, 60 * 60 * 1000);
          }
        }
        (liveries?.result || []).forEach(l => {
          map[l.id] = l.liveryName ? `${ac.name} - ${l.liveryName}` : ac.name;
        });
      } catch { }
    }));

    const result = { map };
    setCached('if_aircraft_livery_map', result, 60 * 60 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build aircraft/livery name map' });
  }
});

router.get('/if/grade-check', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const response = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discourseNames: [username.trim()] }),
    });
    const data = await response.json();
    const user = data.result?.[0];
    if (!user) return res.json({ found: false, grade: null });
    res.json({ found: true, grade: user.grade ?? 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check grade' });
  }
});

router.post('/if/users', requireAuthOrApiKey, async (req, res) => {
  try {
    const { discourseNames } = req.body;
    if (!discourseNames || !Array.isArray(discourseNames)) {
      return res.status(400).json({ error: 'discourseNames array required' });
    }
    const response = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discourseNames }),
    });
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    res.json({ result: data.result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user from Infinite Flight' });
  }
});

router.get('/if/users/:userId/flights', requireAuthOrApiKey, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const response = await fetch(
      `${IF_BASE}/users/${req.params.userId}/flights?page=${page}&apikey=${process.env.IF_API_KEY}`
    );
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    res.json({ result: data.result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch IF flights' });
  }
});

router.get('/if/users/:userId/atc', requireAuthOrApiKey, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const response = await fetch(
      `${IF_BASE}/users/${req.params.userId}/atc?page=${page}&apikey=${process.env.IF_API_KEY}`
    );
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    res.json({ result: data.result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch IF ATC sessions' });
  }
});

router.get('/if/sessions', requireAuthOrApiKey, async (req, res) => {
  try {
    const response = await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    res.json({ result: data.result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch IF sessions' });
  }
});

router.get('/if/sessions/:sessionId/world', requireAuthOrApiKey, async (req, res) => {
  try {
    const response = await fetch(`${IF_BASE}/sessions/${req.params.sessionId}/world?apikey=${process.env.IF_API_KEY}`);
    const data = await response.json();
    if (data.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: data.errorCode });
    res.json({ result: data.result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch IF world data' });
  }
});

router.get('/if/aircraft-stats', requireAuthOrApiKey, async (req, res) => {
  try {
    const cached = getCached('if_aircraft_stats');
    if (cached) return res.json(cached);

    const sessResponse = await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
    const sessData = await sessResponse.json();
    if (sessData.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: sessData.errorCode });

    const sessions = sessData.result || [];
    const expert = sessions.find(s => s.name === 'Expert') || sessions[0];
    if (!expert) return res.json({ result: [], totalFlights: 0, sessionName: null });

    const flightsResponse = await fetch(`${IF_BASE}/sessions/${expert.id}/flights?apikey=${process.env.IF_API_KEY}`);
    const flightsData = await flightsResponse.json();
    if (flightsData.errorCode !== 0) return res.status(502).json({ error: 'IF API error', code: flightsData.errorCode });

    const flights = flightsData.result || [];
    const counts = new Map(); // liveryId (preferred) or aircraftId -> count
    const NULL_GUID = '00000000-0000-0000-0000-000000000000';
    const realId = (id) => (id && id !== NULL_GUID) ? id : null;
    for (const f of flights) {
      const key = realId(f.liveryId) || realId(f.aircraftId);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const result = [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);

    const payload = { result, totalFlights: flights.length, sessionName: expert.name };
    setCached('if_aircraft_stats', payload, 30 * 1000);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch aircraft stats from Infinite Flight' });
  }
});

// Stats (for Discord bot / website)

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const cached = getCached('stats');
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const [pilotsCount, flightsCount, routes, vaStatsRec] = await Promise.all([
      pb.collection('users').getList(1, 1, { requestKey: null, filter: 'status = "approved"', fields: 'id' }),
      pb.collection('flights').getList(1, 1, { requestKey: null, filter: 'status = "approved"', fields: 'id' }),
      pb.collection('routes').getList(1, 1, { requestKey: null, filter: 'active = true', fields: 'id' }),
      pb.collection('va_stats').getFirstListItem('', { requestKey: null }).catch(() => null),
    ]);

    const result = {
      total_pilots:      pilotsCount.totalItems,
      total_flights:     vaStatsRec?.total_flights     || flightsCount.totalItems,
      total_hours:       parseFloat((vaStatsRec?.total_hours || 0).toFixed(1)),
      total_distance_nm: Math.round(vaStatsRec?.total_distance_nm || 0),
      active_routes:     routes.totalItems,
    };
    setCached('stats', result, 60 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/stats/detailed', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();

    const { from } = req.query;
    const fromDate = (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) ? from : null;

    const cacheKey = `stats-detailed-${fromDate || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const rangeStartStr = fromDate || (() => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10);
    })();
    const rangeEndStr = new Date().toISOString().slice(0, 10);

    const [{ rows, totals }, allPilots, allRoutes, vaStatsRec] = await Promise.all([
      dailyStats.getRangeStats(pb, rangeStartStr, rangeEndStr),
      pb.collection('users').getFullList({
        requestKey: null,
        filter: 'status = "approved"',
        fields: 'id,first_name,last_name,callsign,total_hours,total_flights,created,rank,has_imported_history',
      }),
      pb.collection('routes').getFullList({
        requestKey: null,
        filter: 'active = true',
        fields: 'id',
      }),
      pb.collection('va_stats').getFirstListItem('', { requestKey: null }).catch(() => null),
    ]);

    await tagDevelopers(pb, allPilots);
    const pilotMap = Object.fromEntries(allPilots.map(p => [p.id, p]));

    // Day-of-week histogram + busiest day
    const dowCounts = Array(7).fill(0); // Mon..Sun
    for (const row of rows) {
      const idx = (new Date(`${row.date}T00:00:00Z`).getUTCDay() + 6) % 7;
      dowCounts[idx] += row.flights_count || 0;
    }
    const dowData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ label, value: dowCounts[i] }));
    const busiestDay = totals.flights > 0
      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dowCounts.indexOf(Math.max(...dowCounts))]
      : '—';

    // Popular routes / fleet usage — pre-aggregated, sorted server-side
    const popularRoutes = Object.entries(totals.routeCounts)
      .map(([key, v]) => { const [dep, arr] = key.split('-'); return { route: key, dep, arr, count: v.count, hours: parseFloat((v.hours || 0).toFixed(1)) }; })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const aircraftStats = Object.entries(totals.aircraftCounts)
      .map(([type, v]) => ({ type, count: v.count, hours: parseFloat((v.hours || 0).toFixed(1)) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);

    // Top pilots within the selected range (used when period !== 'all')
    const topPilotsInRange = Object.entries(totals.pilotCounts)
      .map(([userId, stats]) => {
        const p = pilotMap[userId];
        return {
          user_id: userId,
          pilot_name: p ? `${p.first_name} ${p.last_name}` : `Pilot ${userId.slice(0, 6)}`,
          pilot_callsign: p?.callsign || '',
          flights: stats.flights,
          hours: parseFloat((stats.hours || 0).toFixed(2)),
          is_developer: !!p?.is_developer,
        };
      })
      .sort((a, b) => b.hours - a.hours);

    const dailyBuckets = rows.map(r => ({ date: r.date, flights: r.flights_count || 0, hours: parseFloat((r.hours || 0).toFixed(2)) }));

    const result = {
      range: {
        flights: totals.flights,
        hours: parseFloat(totals.hours.toFixed(1)),
        uniqueRoutes: Object.keys(totals.routeCounts).length,
        busiestDay,
        autoApproved: totals.autoApproved,
        multipliedFlights: totals.multiplied,
        multipliedHours: totals.multipliedHours,
      },
      dailyBuckets,
      popularRoutes,
      aircraftStats,
      dowData,
      topPilotsInRange,
      pilots: allPilots,
      active_routes: allRoutes.length,
      va_stats: vaStatsRec ? {
        total_flights:            vaStatsRec.total_flights            || 0,
        total_hours:              vaStatsRec.total_hours              || 0,
        total_distance_nm:        vaStatsRec.total_distance_nm        || 0,
        total_approved_pireps:    vaStatsRec.total_approved_pireps    || 0,
        total_auto_approved:      vaStatsRec.total_auto_approved      || 0,
        total_multiplied_flights: vaStatsRec.total_multiplied_flights || 0,
        total_multiplied_hours:   vaStatsRec.total_multiplied_hours   || 0,
      } : null,
    };

    setCached(cacheKey, result, 2 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[stats/detailed]', err);
    res.status(500).json({ error: 'Failed to fetch detailed stats' });
  }
});

router.post('/daily_stats/backfill', requireAdmin, async (req, res) => {
  try {
    console.log('[daily_stats/backfill] starting...');
    const result = await runStatsAudit({ parts: ['daily'] });
    const created = result.daily.fixed.filter(d => d.created).length;
    const updated = result.daily.fixed.length - created;
    console.log(`[daily_stats/backfill] done — ${created} created, ${updated} updated, ${result.daily.checked} day(s) checked`);
    res.json({ success: true, days: result.daily.checked, created, updated, flights_processed: result.flights });
  } catch (err) {
    console.error('[daily_stats/backfill]', err);
    res.status(500).json({ error: 'Backfill failed', detail: err.message });
  }
});

router.get('/health', requireAdmin, async (req, res) => {
  try {
    res.json(await vaHealth(req.query));
  } catch (err) {
    console.error('[health]', err.message);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

router.get('/health/card', requireAdmin, async (req, res) => {
  try {
    const png = await renderHealthCard(await vaHealth(req.query));
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    console.error('[health/card]', err.message);
    res.status(500).json({ error: 'Failed to draw the report card' });
  }
});

let regoTypesMemo = null;
async function liveRegoTypes(pb) {
  if (regoTypesMemo && regoTypesMemo.expires > Date.now()) return regoTypesMemo.map;
  const bids = await pb.collection('if_live_bids').getFullList({ fields: 'aircraft_registration,aircraft_type_id', requestKey: null }).catch(() => []);
  const map = {};
  for (const b of bids) {
    const type = lookupLivery(b.aircraft_type_id)?.aircraftName;
    if (b.aircraft_registration && type) map[b.aircraft_registration] = type;
  }
  regoTypesMemo = { map, expires: Date.now() + 10 * 60 * 1000 };
  return map;
}

async function vaHealth(query = {}) {
    const pb  = await getAdminClient();
    const now = new Date();
    const fmt = d => d.toISOString().replace('T', ' ').slice(0, 19);

    // Date range setup
    const isValidDate = s => s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const rangeEnd   = isValidDate(query.to)   ? new Date(query.to + 'T23:59:59Z') : now;
    const rangeStart = isValidDate(query.from)
      ? new Date(query.from + 'T00:00:00Z')
      : (() => { const d = new Date(rangeEnd); d.setDate(d.getDate() - 7); return d; })();

    const rangeDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000));

    const prevEnd   = new Date(rangeStart.getTime() - 1);
    const prevStart = new Date(rangeStart); prevStart.setUTCDate(prevStart.getUTCDate() - rangeDays);

    const cacheKey = `health-${rangeStart.toISOString().slice(0, 10)}-${rangeEnd.toISOString().slice(0, 10)}`;
    const cachedResult = getCached(cacheKey);
    if (cachedResult) return cachedResult;

    const [
      { rows: rangeRows, totals: rangeTotals },
      { totals: prevTotals },
      activePilotIdSet,
      totalPilots,
      allExamUsers,
      pendingPireps,
      newInRangeCount,
      newInPrevCount,
    ] = await Promise.all([
      dailyStats.getRangeStats(pb, rangeStart, rangeEnd),
      dailyStats.getRangeStats(pb, prevStart, prevEnd),
      dailyStats.getActivePilotIds(pb, 30),
      pb.collection('users').getList(1, 1, { filter: 'status = "approved"', fields: 'id', requestKey: null }),
      pb.collection('users').getFullList({ filter: 'exam_attempts > 0', fields: 'id,exam_passed', requestKey: null }),
      pb.collection('flights').getList(1, 1, { filter: 'status = "pending"', fields: 'id', requestKey: null }),
      pb.collection('users').getList(1, 1, { filter: `status = "approved" && created >= "${escFilterValue(fmt(rangeStart))}" && created <= "${escFilterValue(fmt(rangeEnd))}"`, fields: 'id', requestKey: null }),
      pb.collection('users').getList(1, 1, { filter: `status = "approved" && created >= "${escFilterValue(fmt(prevStart))}" && created <= "${escFilterValue(fmt(prevEnd))}"`, fields: 'id', requestKey: null }),
    ]);

    // Active pilots (flew in last 30d, fixed window)
    const activePct = totalPilots.totalItems > 0
      ? Math.round((activePilotIdSet.size / totalPilots.totalItems) * 100) : 0;

    // Exam pass rate
    const examPassed   = allExamUsers.filter(u => u.exam_passed).length;
    const examPassRate = allExamUsers.length > 0
      ? Math.round((examPassed / allExamUsers.length) * 100) : null;

    // Period flight aggregations (already summed by getRangeStats)
    const uniquePilots   = Object.keys(rangeTotals.pilotCounts).length;
    const avgFlightTime  = rangeTotals.flights > 0
      ? parseFloat((rangeTotals.hours / rangeTotals.flights).toFixed(2)) : 0;
    const pirepsPerPilot = uniquePilots > 0
      ? parseFloat((rangeTotals.flights / uniquePilots).toFixed(1)) : 0;

    const topRoutes = Object.entries(rangeTotals.routeCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, v]) => {
        const [dep, arr] = key.split('-');
        return { departure_icao: dep, arrival_icao: arr, count: v.count };
      });

    const regoTypes = await liveRegoTypes(pb);
    const aircraftTotals = {};
    for (const [name, v] of Object.entries(rangeTotals.aircraftCounts)) {
      const type = regoTypes[name] || name;
      const t = (aircraftTotals[type] ||= { count: 0, hours: 0 });
      t.count += v.count || 0;
      t.hours += v.hours || 0;
    }
    // every type flown, busiest first (the page shows them all, the card the top few)
    const topAircraft = Object.entries(aircraftTotals)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, t]) => ({ name, count: t.count, hours: parseFloat(t.hours.toFixed(1)) }));

    const useWeekly = rangeDays > 60;
    const bucketDays = useWeekly ? 7 : 1;
    const numBuckets = Math.ceil(rangeDays / bucketDays);
    const rowsByDate = new Map(rangeRows.map(r => [r.date, r]));
    const dailyTrend = [];

    for (let i = 0; i < numBuckets; i++) {
      const bStart = new Date(rangeStart); bStart.setDate(bStart.getDate() + i * bucketDays);
      const bEnd   = new Date(bStart);     bEnd.setDate(bEnd.getDate() + bucketDays);
      let count = 0;
      for (let d = new Date(bStart); d < bEnd; d.setDate(d.getDate() + 1)) {
        count += rowsByDate.get(d.toISOString().slice(0, 10))?.flights_count || 0;
      }
      const label = bStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      dailyTrend.push({ label, count });
    }

    // Top pilots in period — only enrich names for the top 5, not the whole roster
    const topPilotEntries = Object.entries(rangeTotals.pilotCounts)
      .sort((a, b) => b[1].flights - a[1].flights)
      .slice(0, 5);
    let topPilots = [];
    if (topPilotEntries.length > 0) {
      const idFilter = topPilotEntries
        .map(([id]) => `id = "${id.replace(/"/g, '')}"`)
        .join(' || ');
      const pilotRecords = await pb.collection('users').getFullList({
        filter: idFilter, fields: 'id,ifc_username,callsign', requestKey: null,
      });
      const pilotMap = Object.fromEntries(pilotRecords.map(p => [p.id, p]));
      topPilots = topPilotEntries.map(([userId, stats]) => {
        const p = pilotMap[userId];
        return {
          id: userId,
          name: p?.ifc_username || '',
          callsign: p?.callsign || '',
          flights: stats.flights,
          hours: parseFloat((stats.hours || 0).toFixed(1)),
        };
      });
    }

    const result = {
      range: {
        from: rangeStart.toISOString().split('T')[0],
        to:   rangeEnd.toISOString().split('T')[0],
        days: rangeDays,
      },
      pireps: {
        inRange:     rangeTotals.flights,
        prevPeriod:  prevTotals.flights,
        prevHours:   parseFloat((prevTotals.hours || 0).toFixed(1)),
        prevUniquePilots: Object.keys(prevTotals.pilotCounts || {}).length,
        pending:     pendingPireps.totalItems,
        rejected:    rangeTotals.rejected,
        autoApproved: rangeTotals.autoApproved,
        multiplied:   rangeTotals.multiplied,
        totalHours:  parseFloat(rangeTotals.hours.toFixed(1)),
        avgFlightTime,
        pirepsPerPilot,
        uniquePilots,
      },
      signups: { inRange: newInRangeCount.totalItems, prevPeriod: newInPrevCount.totalItems },
      pilots: {
        total: totalPilots.totalItems,
        activePct,
        activeCount: activePilotIdSet.size,
      },
      exam: {
        passRate: examPassRate,
        total:    allExamUsers.length,
        passed:   examPassed,
      },
      topRoutes,
      topAircraft,
      dailyTrend,
      topPilots,
    };

    setCached(cacheKey, result, 30 * 1000);
    return result;
}

router.post('/va_stats/recalculate', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    console.log('[va_stats/recalc] starting full recalculation...');

    // 1. Fetch approved flights + active routes (for distance lookup)
    const [allFlights, allRoutes] = await Promise.all([
      pb.collection('flights').getFullList({
        requestKey: null,
        filter: 'status = "approved"',
        fields: 'id,user,flight_time,departure_icao,arrival_icao,distance_nm,multiplier_value,auto_approved',
        sort: 'date',
      }),
      pb.collection('routes').getFullList({
        requestKey: null,
        fields: 'departure_icao,arrival_icao,distance_nm',
      }),
    ]);

    // Build route distance map: "DEP-ARR" -> distance_nm
    const routeDistMap = {};
    allRoutes.forEach(r => {
      if (r.distance_nm) routeDistMap[`${r.departure_icao}-${r.arrival_icao}`] = r.distance_nm;
    });

    // 1b. Backfill distance_nm on flights missing it, using route map then haversine
    console.log('[va_stats/recalc] backfilling missing distances...');
    let distanceBackfilled = 0;
    for (const f of allFlights) {
      if (!f.distance_nm && f.departure_icao && f.arrival_icao) {
        const routeKey = `${f.departure_icao}-${f.arrival_icao}`;
        const dist = routeDistMap[routeKey] || (await calcDistanceNm(f.departure_icao, f.arrival_icao));
        if (dist) {
          await pb.collection('flights').update(f.id, { distance_nm: dist });
          f.distance_nm = dist;
          distanceBackfilled++;
        }
      }
    }
    console.log(`[va_stats/recalc] backfilled distance on ${distanceBackfilled} flights`);

    const result = await runStatsAudit({ parts: ['pilots', 'va'] });

    console.log(`[va_stats/recalc] done — ${result.flights} flights, ${result.pilots.fixed.length} pilot(s) corrected, ${distanceBackfilled} distances backfilled`);
    res.json({
      success: true,
      va_stats: result.va.values,
      pilots_updated: result.pilots.fixed.length,
      pilots_corrected: result.pilots.fixed,
      total_flights_processed: result.flights,
      distances_backfilled: distanceBackfilled,
    });
  } catch (err) {
    console.error('[va_stats/recalculate]', err);
    res.status(500).json({ error: 'Recalculation failed', detail: err.message });
  }
});

router.get('/va_stats', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rec = await pb.collection('va_stats').getFirstListItem('', { requestKey: null });
    res.json({ va_stats: rec });
  } catch {
    res.json({ va_stats: null });
  }
});

router.get('/routes/requests', requirePermission('pilots.edit'), async (req, res) => {
  try {
    const pb     = await getAdminClient();
    const status = req.query.status || 'pending';
    const list   = await pb.collection('route_requests').getFullList({
      filter: `status = "${escFilterValue(status)}"`,
      sort: '-created',
      expand: 'submitted_by',
      requestKey: null,
    });
    res.json({ requests: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch route requests' });
  }
});

router.patch('/routes/requests/:id', requirePermission('pilots.edit'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pb.collection('route_requests').update(req.params.id, { status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update route request' });
  }
});

router.post('/routes/request', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { flight_number, departure_icao, arrival_icao, aircraft, notes } = req.body;
    if (!flight_number || !departure_icao || !arrival_icao || !aircraft) {
      return res.status(400).json({ error: 'flight_number, departure_icao, arrival_icao and aircraft are required' });
    }
    await pb.collection('route_requests').create({
      flight_number:  flight_number.trim().toUpperCase(),
      departure_icao: departure_icao.trim().toUpperCase(),
      arrival_icao:   arrival_icao.trim().toUpperCase(),
      aircraft:       aircraft.trim(),
      notes:          notes?.trim() || '',
      submitted_by:   req.user.id,
      status:         'pending',
    });

    // Fire discord webhook (fire and forget)
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null }).catch(() => null);
    const pilot_name = user ? `${user.first_name} ${user.last_name} (${user.callsign || user.ifc_username})` : 'Unknown';
    notifyRouteRequest({ flight_number: flight_number.trim().toUpperCase(), departure_icao: departure_icao.trim().toUpperCase(), arrival_icao: arrival_icao.trim().toUpperCase(), aircraft: aircraft.trim(), notes: notes?.trim(), pilot_name }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('[routes/request]', err.message);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

module.exports = router;
