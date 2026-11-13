/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient } = require('../config/pocketbase');
const { requireAuthOrApiKey } = require('../middleware/auth');
const { escFilterValue } = require('../utils/pbFilter');
const { lookupLivery } = require('../utils/ifLiveryLookup');

const router = express.Router();

const IF_BASE = 'https://api.infiniteflight.com/public/v2';
// Flights flying the VA's callsign (va.config.json callsign.format)
const AVG_REGEX = new RegExp(brand.callsign.regexSource || '^$', 'i');

const ifCache = new Map();
function getIfCached(key) {
  const entry = ifCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { ifCache.delete(key); return null; }
  return entry.data;
}
function setIfCached(key, data, ttlMs) {
  ifCache.set(key, { data, expires: Date.now() + ttlMs });
}

const IF_CACHE_SWEEP_INTERVAL_MS = 60 * 1000; // every minute
const IF_CACHE_MAX_ENTRIES = 2000; // hard backstop even if the sweep somehow falls behind
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ifCache) {
    if (now > entry.expires) ifCache.delete(key);
  }
  if (ifCache.size > IF_CACHE_MAX_ENTRIES) {
    const toDrop = ifCache.size - IF_CACHE_MAX_ENTRIES;
    let dropped = 0;
    for (const key of ifCache.keys()) {
      if (dropped >= toDrop) break;
      ifCache.delete(key);
      dropped++;
    }
  }
}, IF_CACHE_SWEEP_INTERVAL_MS).unref();

const STATIC_TTL_MS = 10 * 60 * 1000;
const staticLists = new Map(); // key -> { data, expires, pending }

function staticList(key, load) {
  const entry = staticLists.get(key);
  if (entry && Date.now() < entry.expires) return Promise.resolve(entry.data);
  if (entry?.pending) return entry.pending;
  const pending = load()
    .then(data => { staticLists.set(key, { data, expires: Date.now() + STATIC_TTL_MS }); return data; })
    .catch(err => {
      staticLists.set(key, { ...entry, pending: null });
      if (entry?.data) return entry.data;
      throw err;
    });
  staticLists.set(key, { ...entry, pending });
  return pending;
}

const fleetList = () => staticList('fleet', async () =>
  (await getAdminClient()).collection('fleet').getFullList({ requestKey: null, fields: 'name,aircraft_id,livery_id,image_url' }));
const rankList = () => staticList('ranks', async () =>
  (await getAdminClient()).collection('ranks').getFullList({ requestKey: null, fields: 'id,name' }));
const liveImageList = () => staticList('liveImages', async () =>
  (await getAdminClient()).collection('if_live_fleet_images').getFullList({ requestKey: null }).catch(() => []));

// A response shared by every caller for `ttlMs`, built at most once at a time
function sharedResponse(ttlMs, build) {
  let cache = null;
  let pending = null;
  return async () => {
    if (cache && Date.now() < cache.expires) return cache.data;
    pending = pending || build().finally(() => { pending = null; });
    const data = await pending;
    cache = { data, expires: Date.now() + ttlMs };
    return data;
  };
}

// `field = "a" || field = "b"` for a short list of values
const anyOf = (field, values) => values.map(v => `${field} = "${escFilterValue(v)}"`).join(' || ');

router.get('/livemap', async (req, res) => {
  try {
    res.json(await liveFlights());
  } catch (err) {
    console.error('[livemap] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch live map data', detail: err.message });
  }
});

async function expertFlights() {
  let sessData = getIfCached('sessions');
  if (!sessData) {
    const sessRes = await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
    sessData = await sessRes.json();
    if (sessData.errorCode !== 0) throw new Error(`IF sessions error ${sessData.errorCode}`);
    setIfCached('sessions', sessData, 10 * 60 * 1000);
  }
  const expert = sessData.result?.find(s => s.name === 'Expert Server' || s.name === 'Expert');
  if (!expert) return { expert: null, flights: [] };

  const flightCacheKey = `flights_${expert.id}`;
  let flightData = getIfCached(flightCacheKey);
  if (!flightData) {
    const flightRes = await fetch(`${IF_BASE}/sessions/${expert.id}/flights?apikey=${process.env.IF_API_KEY}`);
    flightData = await flightRes.json();
    if (flightData.errorCode !== 0) throw new Error(`IF flights error ${flightData.errorCode}`);
    setIfCached(flightCacheKey, flightData, 15 * 1000);
  }
  return { expert, flights: flightData.result || [] };
}

async function flightPlanEnds(sessionId, flightId) {
  const key = `fpends_${flightId}`;
  const hit = getIfCached(key);
  if (hit !== null) return hit.value;
  let value = null;
  try {
    const r = await fetch(`${IF_BASE}/sessions/${sessionId}/flights/${flightId}/flightplan?apikey=${process.env.IF_API_KEY}`);
    const d = await r.json();
    const items = d.errorCode === 0 ? (d.result?.flightPlanItems || []) : [];
    if (items.length >= 2) value = { from: String(items[0].name || '').toUpperCase(), to: String(items[items.length - 1].name || '').toUpperCase() };
  } catch { /* treated as no plan, and retried after the TTL */ }
  setIfCached(key, { value }, 5 * 60 * 1000);
  return value;
}

const liveFlights = sharedResponse(15 * 1000, async () => {
  // 1-2. The Expert Server and its flights
  const { expert, flights: allFlights } = await expertFlights();
  if (!expert) return { flights: [], serverOnline: false };
  const flightData = { result: allFlights };

  // 3. Filter to AVG callsigns
  const avgFlights = (flightData.result || []).filter(f => f.callsign && AVG_REGEX.test(f.callsign));
  if (!avgFlights.length) return { flights: [], serverOnline: true, sessionId: expert.id };

  // 4. Load fleet + ranks (cached) and only the pilots who are flying
  const pb = await getAdminClient();
  const flyingIds = [...new Set(avgFlights.map(f => f.userId).filter(Boolean))];
  const [fleetItems, allRanks, allPilots] = await Promise.all([
    fleetList(),
    rankList(),
    flyingIds.length
      ? pb.collection('users').getFullList({ requestKey: null, filter: anyOf('if_user_id', flyingIds), fields: 'id,if_user_id,total_flights,total_hours,rank,has_imported_history' })
      : [],
  ]);

  const rankMap = {};
  allRanks.forEach(r => { rankMap[r.id] = r.name; });

  const ifUserMap = {};
  allPilots.forEach(p => { if (p.if_user_id) ifUserMap[p.if_user_id] = p; });

  const pilotFlightMap = {};
  const pilotStatsMap  = {};
  const pilotIds = Object.values(ifUserMap).map(p => p.id);
  const latestPirep = {};
  if (pilotIds.length) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    try {
      const recent = await pb.collection('flights').getFullList({
        requestKey: null,
        filter: `(${anyOf('user', pilotIds)}) && (status = "pending" || status = "approved") && created >= "${since}"`,
        sort: '-created',
        fields: 'user,departure_icao,arrival_icao',
      });
      for (const r of recent) if (!latestPirep[r.user]) latestPirep[r.user] = r;
    } catch { /* the map still works without dep/arr */ }
  }
  for (const f of avgFlights) {
    const pilot = ifUserMap[f.userId];
    if (!pilot) continue;
    pilotStatsMap[f.flightId] = {
      total_flights: pilot.total_flights || 0,
      total_hours:   pilot.total_hours   || 0,
      rank:          rankMap[pilot.rank]  || null,
      is_legacy:     pilot.has_imported_history || false,
    };
    const recent = latestPirep[pilot.id];
    if (recent) pilotFlightMap[f.flightId] = { departure: recent.departure_icao, arrival: recent.arrival_icao };
  }

  // Fleet lookup maps
  const byLivery   = {};
  const byAircraft = {};
  fleetItems.forEach(f => {
    if (f.livery_id)   byLivery[f.livery_id]     = f;
    if (f.aircraft_id) byAircraft[f.aircraft_id] = f;
  });

  const enrichMap = {};
  avgFlights.forEach(f => {
    const pirepMatch = pilotFlightMap[f.flightId];
    enrichMap[f.flightId] = {
      departure:      pirepMatch?.departure || null,
      arrival:        pirepMatch?.arrival   || null,
      route:          [],
      planPoints:     [],
      departure_time: null,
    };
  });

  // 7. Build response
  const flights = avgFlights.map(f => {
    const fleetMatch  = byLivery[f.liveryId] || byAircraft[f.aircraftId] || null;
    const enrich      = enrichMap[f.flightId] || {};
    const pirepMatch  = pilotFlightMap[f.flightId];
    return {
      id:         f.flightId,
      callsign:   f.callsign,
      username:   f.username || null,
      lat:        f.latitude,
      lng:        f.longitude,
      altitude:   Math.round(f.altitude || 0),
      speed:      Math.round(f.speed || 0),
      heading:    Math.round(f.track || f.heading || 0),
      aircraft:   fleetMatch?.name || null,
      image_url:  fleetMatch?.image_url || null,
      departure:  enrich.departure      || pirepMatch?.departure || null,
      arrival:    enrich.arrival        || pirepMatch?.arrival   || null,
      departure_time: enrich.departure_time || null,
      route:      enrich.route          || [],
      planPoints: enrich.planPoints     || [],
      stats:      pilotStatsMap[f.flightId] || null,
    };
  });

  return { flights, serverOnline: true, sessionId: expert.id };
});

router.get('/livemap/flightplan/:sessionId/:flightId', requireAuthOrApiKey, async (req, res) => {
  try {
    const { sessionId, flightId } = req.params;
    const cacheKey = `flightplan_${flightId}`;
    const cached = getIfCached(cacheKey);
    if (cached) return res.json(cached);
    const r = await fetch(`${IF_BASE}/sessions/${sessionId}/flights/${flightId}/flightplan?apikey=${process.env.IF_API_KEY}`);
    const d = await r.json();
    if (d.errorCode !== 0) return res.json({ flightPlan: null });
    const result = { flightPlan: d.result };
    setIfCached(cacheKey, result, 15 * 1000);
    res.json(result);
  } catch { res.json({ flightPlan: null }); }
});

router.get('/livemap/route/:sessionId/:flightId', requireAuthOrApiKey, async (req, res) => {
  try {
    const { sessionId, flightId } = req.params;
    const cacheKey = `route_${flightId}`;
    const cached = getIfCached(cacheKey);
    if (cached) return res.json(cached);
    const r = await fetch(`${IF_BASE}/sessions/${sessionId}/flights/${flightId}/route?apikey=${process.env.IF_API_KEY}`);
    const d = await r.json();
    if (d.errorCode !== 0) return res.json({ route: [] });
    const result = { route: d.result || [] };
    setIfCached(cacheKey, result, 15 * 1000);
    res.json(result);
  } catch { res.json({ route: [] }); }
});

router.get('/livemap/pilot/:ifUserId', requireAuthOrApiKey, async (req, res) => {
  try {
    // Reuse cached sessions
    let sessData = getIfCached('sessions');
    if (!sessData) {
      const sessRes = await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
      sessData = await sessRes.json();
      if (sessData.errorCode !== 0) return res.json({ flying: false });
      setIfCached('sessions', sessData, 10 * 60 * 1000);
    }

    const expert = sessData.result?.find(s => s.name === 'Expert Server' || s.name === 'Expert');
    if (!expert) return res.json({ flying: false });

    // Reuse cached flights
    const flightCacheKey = `flights_${expert.id}`;
    let flightData = getIfCached(flightCacheKey);
    if (!flightData) {
      const flightRes = await fetch(`${IF_BASE}/sessions/${expert.id}/flights?apikey=${process.env.IF_API_KEY}`);
      flightData = await flightRes.json();
      if (flightData.errorCode !== 0) return res.json({ flying: false });
      setIfCached(flightCacheKey, flightData, 15 * 1000);
    }

    const flights  = flightData.result || [];
    const matches  = flights.filter(f => f.userId === req.params.ifUserId);
    if (!matches.length) return res.json({ flying: false });

    // Match aircraft from fleet
    const pb = await getAdminClient();
    const fleetItems = await fleetList();
    const byLivery = {}; const byAircraft = {};
    fleetItems.forEach(f => { if (f.livery_id) byLivery[f.livery_id] = f; if (f.aircraft_id) byAircraft[f.aircraft_id] = f; });

    // Enrich all matches with fleet name, then prefer the one matching career aircraft
    const enriched = matches.map(f => ({ ...f, fleetName: (byLivery[f.liveryId] || byAircraft[f.aircraftId])?.name || null }));

    // Fetch career aircraft for this user to determine correct match
    const user = await pb.collection('users').getFirstListItem(`if_user_id = "${escFilterValue(req.params.ifUserId)}"`, { fields: 'career_aircraft,career_active', requestKey: null }).catch(() => null);
    const careerAircraft = user?.career_active ? user.career_aircraft : null;

    // Prefer: 1) career aircraft match, 2) any fleet aircraft match, 3) first flight
    const flight = (careerAircraft && enriched.find(f => f.fleetName === careerAircraft))
      || enriched.find(f => f.fleetName !== null)
      || enriched[0];

    // Get destination from IF flight plan
    let destination = null;
    try {
      const fpRes = await fetch(`${IF_BASE}/sessions/${expert.id}/flights/${flight.flightId}/flightplan?apikey=${process.env.IF_API_KEY}`);
      const fpData = await fpRes.json();
      if (fpData.errorCode === 0 && fpData.result) {
        const items = fpData.result.flightPlanItems || [];
        const dest = items.length > 0 ? items[items.length - 1].name : null;
        const origin = items.length > 0 ? items[0].name : null;
        if (origin && dest) destination = { from: origin, to: dest };
      }
    } catch { /* no flight plan */ }

    res.json({
      flying:      true,
      callsign:    flight.callsign,
      aircraft:    flight.fleetName || null,
      lat:         flight.latitude,
      lng:         flight.longitude,
      altitude:    Math.round(flight.altitude || 0),
      speed:       Math.round(flight.speed || 0),
      heading:     Math.round(flight.track || flight.heading || 0),
      destination,
    });
  } catch (err) {
    console.error('[livemap/pilot]', err.message);
    res.json({ flying: false });
  }
});

const liveFleet = sharedResponse(30 * 1000, loadLiveFleet);

async function loadLiveFleet() {
  const { orgPositions, getServiceUserIdForOrg, ALLOWED_ORG_IDS } = require('./ifLive');
  const orgId = ALLOWED_ORG_IDS[0];
  if (!orgId) return [];
  const serviceUserId = await staticList('serviceUser', () => getServiceUserIdForOrg(orgId));
  if (!serviceUserId) return [];

  const [rows, fleetItems, liveImages] = await Promise.all([
    orgPositions(serviceUserId, orgId),
    fleetList(),
    liveImageList(),
  ]);
  const byLivery = {};
  const byAircraft = {};
  fleetItems.forEach(f => {
    if (f.livery_id)   byLivery[f.livery_id]     = f;
    if (f.aircraft_id) byAircraft[f.aircraft_id] = f;
  });
  const liveImage = {};
  liveImages.forEach(r => { liveImage[r.aircraft_type_id] = r.image_url; });

  return rows
    .filter(r => r.position?.stale === false && typeof r.position.latitude === 'number' && typeof r.position.longitude === 'number')
    .map(({ aircraft: ac, position: p }) => {
      // a Live aircraft's `aircraftId` is IF's livery id, not the base type's
      const fleetMatch = byLivery[ac.aircraftId] || byAircraft[ac.aircraftId] || null;
      const livery = lookupLivery(ac.aircraftId);
      return {
        id:           ac.id,
        registration: ac.registration || null,
        aircraft:     fleetMatch?.name || (livery ? `${livery.aircraftName} - ${livery.liveryName}` : null),
        image_url:    liveImage[ac.aircraftId] || fleetMatch?.image_url || null,
        lat:          p.latitude,
        lng:          p.longitude,
        altitude:     Math.round(p.altitude || 0),
        speed:        Math.round(p.speed || 0),
        heading:      Math.round(p.heading || 0),
        callsign:     p.callsign || null,
        username:     p.lastPilotUsername || null,
        session:      p.session || null,
        sessionId:    p.sessionId || null,
        flightId:     p.flightId || null,
      };
    });
}

router.get('/livemap/fleet', requireAuthOrApiKey, async (req, res) => {
  try {
    res.json({ aircraft: await liveFleet() });
  } catch (err) {
    console.error('[livemap/fleet] error:', err.message);
    res.json({ aircraft: [], error: 'Live fleet positions are unavailable right now' });
  }
});

module.exports = router;
module.exports.expertFlights = expertFlights;
module.exports.flightPlanEnds = flightPlanEnds;
module.exports.fleetList = fleetList;
module.exports.sharedResponse = sharedResponse;
module.exports.liveFlights = liveFlights;
