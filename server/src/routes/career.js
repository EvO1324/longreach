/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();

const CAREER_HUBS = brand.hubs.map(h => h.icao.toUpperCase()); // va.config.json hubs
const CAREER_LOCK_MONTHS = 3;

// Helpers

function canChangeAircraft(careerStartedAt) {
  if (!careerStartedAt) return true;
  const started  = new Date(careerStartedAt);
  const unlockAt = new Date(started);
  unlockAt.setMonth(unlockAt.getMonth() + CAREER_LOCK_MONTHS);
  return new Date() >= unlockAt;
}

function nextChangeDate(careerStartedAt) {
  if (!careerStartedAt) return null;
  const started  = new Date(careerStartedAt);
  const unlockAt = new Date(started);
  unlockAt.setMonth(unlockAt.getMonth() + CAREER_LOCK_MONTHS);
  return unlockAt.toISOString();
}

// GET /api/career/status — get current user's career status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    // Fetch career flights for history/map
    const careerFlights = user.career_active
      ? await pb.collection('flights').getFullList({
          filter:     `user = "${escFilterValue(req.user.id)}" && is_career = true && status = "approved"`,
          sort:       'date',
          requestKey: null,
        })
      : [];

    res.json({
      enrolled:             user.career_active     || false,
      aircraft:             user.career_aircraft   || null,
      hub:                  user.career_hub        || null,
      current_icao:         user.career_current_icao || null,
      started_at:           user.career_started_at || null,
      total_flights:        user.career_total_flights || 0,
      total_hours:          user.career_total_hours   || 0,
      can_change_aircraft:  canChangeAircraft(user.career_started_at),
      next_change_date:     nextChangeDate(user.career_started_at),
      flights:              careerFlights,
      hubs:                 CAREER_HUBS,
    });
  } catch (err) {
    console.error('[career/status]', err.message);
    res.status(500).json({ error: 'Failed to fetch career status' });
  }
});

// POST /api/career/enroll — enroll in career mode
router.post('/enroll', requireAuth, async (req, res) => {
  try {
    const { aircraft, hub } = req.body;

    if (!aircraft) return res.status(400).json({ error: 'aircraft required' });
    if (!hub)      return res.status(400).json({ error: 'hub required' });
    if (!CAREER_HUBS.includes(hub.toUpperCase())) {
      return res.status(400).json({ error: `hub must be one of: ${CAREER_HUBS.join(', ')}` });
    }

    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    if (user.career_active) {
      return res.status(409).json({ error: 'Already enrolled in career mode' });
    }

    // Verify aircraft exists in fleet
    let fleetItem;
    try {
      fleetItem = await pb.collection('fleet').getFirstListItem(
        `name = "${aircraft}"`,
        { requestKey: null }
      );
    } catch {
      return res.status(400).json({ error: 'Aircraft not found in fleet' });
    }

    await adminPatch(req.user.id, {
      career_active:       true,
      career_aircraft:     fleetItem.name,
      career_hub:          hub.toUpperCase(),
      career_current_icao: hub.toUpperCase(),
      career_started_at:   new Date().toISOString(),
      career_total_flights: 0,
      career_total_hours:   0,
    });

    logAction(req.user, 'career.enrolled',
      { id: req.user.id, name: req.user.callsign },
      { aircraft: fleetItem.name, hub: hub.toUpperCase() }
    );

    console.log(`[career] ${req.user.callsign} enrolled — ${fleetItem.name} @ ${hub.toUpperCase()}`);
    res.json({ message: 'Enrolled in career mode', aircraft: fleetItem.name, hub: hub.toUpperCase() });
  } catch (err) {
    console.error('[career/enroll]', err.message);
    res.status(500).json({ error: 'Failed to enroll in career mode' });
  }
});

// POST /api/career/change... change aircraft/hub is locked for 3mon
router.post('/change', requireAuth, async (req, res) => {
  try {
    const { aircraft, hub } = req.body;
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    if (!user.career_active) {
      return res.status(400).json({ error: 'Not enrolled in career mode' });
    }

    if (!canChangeAircraft(user.career_started_at)) {
      return res.status(403).json({
        error:           'Aircraft/hub locked for 3 months',
        next_change_date: nextChangeDate(user.career_started_at),
      });
    }

    if (hub && !CAREER_HUBS.includes(hub.toUpperCase())) {
      return res.status(400).json({ error: `hub must be one of: ${CAREER_HUBS.join(', ')}` });
    }

    const patch = { career_started_at: new Date().toISOString() };

    if (aircraft) {
      let fleetItem;
      try {
        fleetItem = await pb.collection('fleet').getFirstListItem(
          `name = "${aircraft}"`, { requestKey: null }
        );
      } catch {
        return res.status(400).json({ error: 'Aircraft not found in fleet' });
      }
      patch.career_aircraft = fleetItem.name;
    }

    if (hub) {
      patch.career_hub          = hub.toUpperCase();
      patch.career_current_icao = hub.toUpperCase();
    }

    await adminPatch(req.user.id, patch);

    logAction(req.user, 'career.changed',
      { id: req.user.id, name: req.user.callsign },
      { aircraft, hub }
    );

    res.json({ message: 'Career aircraft/hub updated' });
  } catch (err) {
    console.error('[career/change]', err.message);
    res.status(500).json({ error: 'Failed to update career settings' });
  }
});

// GET /api/career/hub/:icao/aircraft — aircraft with routes from this hub
router.get('/hub/:icao/aircraft', requireAuth, async (req, res) => {
  try {
    const hub = req.params.icao.toUpperCase();
    const pb  = await getAdminClient();

    // Fetch all active routes from this hub (outbound) and to this hub (inbound)
    const [outbound, inbound] = await Promise.all([
      pb.collection('routes').getFullList({
        filter:     `active = true && departure_icao = "${escFilterValue(hub)}"`,
        fields:     'aircraft,departure_icao,arrival_icao',
        requestKey: null,
      }),
      pb.collection('routes').getFullList({
        filter:     `active = true && arrival_icao = "${escFilterValue(hub)}"`,
        fields:     'aircraft,departure_icao,arrival_icao',
        requestKey: null,
      }),
    ]);

    const allRoutes = [...outbound, ...inbound];

    // Fetch ALL active routes for route drawing (not just from this hub)
    const allActiveRoutes = await pb.collection('routes').getFullList({
      filter:     `active = true`,
      fields:     'aircraft,departure_icao,arrival_icao',
      requestKey: null,
    });

    // Map: aircraftName -> all routes globally
    const aircraftRoutes = {};
    const parseAircraft = (r) => {
      try {
        const arr = typeof r.aircraft === 'string' ? JSON.parse(r.aircraft) : r.aircraft;
        return Array.isArray(arr) ? arr : [arr];
      } catch { return [r.aircraft]; }
    };

    for (const r of allActiveRoutes) {
      if (!r.aircraft) continue;
      const names = parseAircraft(r).map(a => typeof a === 'string' ? a : a?.name).filter(Boolean);
      for (const name of names) {
        if (!aircraftRoutes[name]) aircraftRoutes[name] = [];
        aircraftRoutes[name].push({ dep: r.departure_icao, arr: r.arrival_icao });
      }
    }

    // Fetch fleet entries for aircraft that have routes from/to this hub
    const outboundNames = new Set();
    for (const r of outbound) {
      if (!r.aircraft) continue;
      parseAircraft(r).forEach(a => { const n = typeof a === 'string' ? a : a?.name; if (n) outboundNames.add(n); });
    }

    const fleet = await pb.collection('fleet').getFullList({ requestKey: null });
    const matching = fleet.filter(f => outboundNames.has(f.name));

    res.json({
      aircraft: matching.map(f => ({
        id:        f.id,
        name:      f.name,
        image_url: f.image_url || null,
        routes:    aircraftRoutes[f.name] || [],
      })),
    });
  } catch (err) {
    console.error('[career/hub/aircraft]', err.message);
    res.status(500).json({ error: 'Failed to fetch aircraft for hub' });
  }
});

// GET /api/career/ferry/status — can this pilot ferry this week?
router.get('/ferry/status', requireAuth, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    if (!user.career_active) return res.status(400).json({ error: 'Not enrolled in career mode' });

    const lastFerry = user.career_last_ferry_at ? new Date(user.career_last_ferry_at) : null;
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const canFerry = !lastFerry || lastFerry < oneWeekAgo;
    const nextFerryAt = lastFerry ? new Date(lastFerry.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;

    res.json({ can_ferry: canFerry, last_ferry_at: user.career_last_ferry_at || null, next_ferry_at: nextFerryAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ferry status' });
  }
});

// GET /api/career/ferry/destinations — airports with routes for their aircraft
router.get('/ferry/destinations', requireAuth, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    if (!user.career_active) return res.status(400).json({ error: 'Not enrolled in career mode' });

    const aircraft = user.career_aircraft;
    const currentIcao = user.career_current_icao?.toUpperCase();

    const allRoutes = await pb.collection('routes').getFullList({
      filter: `active = true`,
      fields: 'departure_icao,aircraft',
      requestKey: null,
    });

    const validDepartures = new Set();
    for (const r of allRoutes) {
      if (!r.aircraft || r.departure_icao === currentIcao) continue;
      try {
        const arr = typeof r.aircraft === 'string' ? JSON.parse(r.aircraft) : r.aircraft;
        const list = Array.isArray(arr) ? arr : [arr];
        if (list.some(a => (typeof a === 'string' ? a : a?.name) === aircraft)) {
          validDepartures.add(r.departure_icao.toUpperCase());
        }
      } catch { /* ignore */ }
    }

    res.json({ destinations: [...validDepartures].sort(), current_icao: currentIcao, aircraft });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ferry destinations' });
  }
});

// GET /api/career/routes — routes available from current position
router.get('/routes', requireAuth, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    if (!user.career_active) {
      return res.status(400).json({ error: 'Not enrolled in career mode' });
    }

    const currentIcao = user.career_current_icao?.toUpperCase();
    const aircraft    = user.career_aircraft;

    // Find routes departing from current position with matching aircraft
    const allRoutes = await pb.collection('routes').getFullList({
      filter:     `active = true && departure_icao = "${escFilterValue(currentIcao)}"`,
      requestKey: null,
    });

    // Filter to matching aircraft
    const matching = allRoutes.filter(r => {
      if (!r.aircraft) return false;
      try {
        const arr = typeof r.aircraft === 'string' ? JSON.parse(r.aircraft) : r.aircraft;
        if (Array.isArray(arr)) return arr.some(a => a === aircraft || a?.name === aircraft);
        return arr === aircraft;
      } catch {
        return r.aircraft === aircraft;
      }
    });

    res.json({ routes: matching, current_icao: currentIcao, aircraft });
  } catch (err) {
    console.error('[career/routes]', err.message);
    res.status(500).json({ error: 'Failed to fetch career routes' });
  }
});

// POST /api/career/leave — leave career mode
router.post('/leave', requireAuth, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    if (!user.career_active) {
      return res.status(400).json({ error: 'Not enrolled in career mode' });
    }

    await adminPatch(req.user.id, {
      career_active:        false,
      career_aircraft:      '',
      career_hub:           '',
      career_current_icao:  '',
      career_started_at:    '',
      career_total_flights: 0,
      career_total_hours:   0,
    });

    logAction(req.user, 'career.left', { id: req.user.id, name: req.user.callsign }, {});
    console.log(`[career] ${req.user.callsign} left career mode`);
    res.json({ message: 'Left career mode' });
  } catch (err) {
    console.error('[career/leave]', err.message);
    res.status(500).json({ error: 'Failed to leave career mode' });
  }
});

router.patch('/admin/:userId', requireAdmin, async (req, res) => {
  try {
    const { aircraft, hub, current_icao, reset } = req.body;
    const pb = await getAdminClient();

    // Verify user exists
    await pb.collection('users').getOne(req.params.userId, { requestKey: null });

    if (reset) {
      await adminPatch(req.params.userId, {
        career_active:        false,
        career_aircraft:      '',
        career_hub:           '',
        career_current_icao:  '',
        career_started_at:    '',
        career_total_flights: 0,
        career_total_hours:   0,
      });
      logAction(req.user, 'career.admin_reset', { id: req.params.userId, name: req.params.userId }, {});
      return res.json({ message: 'Career mode reset' });
    }

    const patch = { career_started_at: new Date().toISOString() };

    if (aircraft) {
      let fleetItem;
      try {
        fleetItem = await pb.collection('fleet').getFirstListItem(
          `name = "${aircraft}"`, { requestKey: null }
        );
      } catch {
        return res.status(400).json({ error: 'Aircraft not found in fleet' });
      }
      patch.career_aircraft = fleetItem.name;
    }

    if (hub) {
      if (!CAREER_HUBS.includes(hub.toUpperCase())) {
        return res.status(400).json({ error: `hub must be one of: ${CAREER_HUBS.join(', ')}` });
      }
      patch.career_hub = hub.toUpperCase();
    }

    if (current_icao) patch.career_current_icao = current_icao.toUpperCase();

    await adminPatch(req.params.userId, patch);

    logAction(req.user, 'career.admin_override',
      { id: req.params.userId, name: req.params.userId },
      { aircraft, hub, current_icao }
    );

    res.json({ message: 'Career settings updated by admin' });
  } catch (err) {
    console.error('[career/admin]', err.message);
    res.status(500).json({ error: 'Failed to update career settings' });
  }
});

module.exports = router;
