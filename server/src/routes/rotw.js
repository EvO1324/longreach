/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient, withAdminRetry } = require('../config/pocketbase');
const { requireAdmin, requireAuthOrApiKey } = require('../middleware/auth');
const { notifyAll } = require('./push');
const { buildRotwMessage } = require('../bot/rotwFormatter');
const { logAction } = require('../utils/audit');
const { createCache } = require('../utils/cache');
const { escFilterValue } = require('../utils/pbFilter');
const { invalidateRotwRoutes } = require('../services/rotwRoutes');

const router = express.Router();
const { getCached, setCached, invalidateAll: invalidateRotwCache } = createCache('rotw');

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// Helpers

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function toMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().split('T')[0];
}

function fmtWeekLabel(weekStart) {
  // Normalise to Monday in case an off-day was stored
  const d   = new Date(weekStart + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const end = new Date(d); end.setDate(d.getDate() + 6);
  const fmt = dt => dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(d)} – ${fmt(end)}`;
}

// Build a routeMap and multMap from a list of slots (already expanded from PB)
function buildMapsFromSlots(slots) {
  const routeMap = {};
  const multMap  = {};
  for (const slot of slots) {
    if (slot.expand?.route)      routeMap[slot.route] = slot.expand.route;
    if (slot.expand?.multiplier) multMap[slot.multiplier] = slot.expand.multiplier;
  }
  return { routeMap, multMap };
}

function slotsToSchedule(slots) {
  const schedule = Object.fromEntries(DAYS.map(d => [d, []]));
  const sorted   = [...slots].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const slot of sorted) {
    if (slot.day && schedule[slot.day]) {
      schedule[slot.day].push({ routeId: slot.route, multiplierId: slot.multiplier || null });
    }
  }
  return schedule;
}

// Admin: weeks

// GET /api/rotw/weeks
router.get('/rotw/weeks', requireAdmin, async (req, res) => {
  try {
    const pb    = await getAdminClient();
    const weeks = await pb.collection('rotw_weeks').getFullList({
      sort: 'week_start', requestKey: null,
    });

    // Attach slot counts
    const counts = await Promise.all(weeks.map(async w => {
      const list = await pb.collection('rotw_slots').getList(1, 1, {
        filter: `week = "${escFilterValue(w.id)}"`, requestKey: null,
      });
      return { ...w, slot_count: list.totalItems };
    }));

    res.json({ weeks: counts });
  } catch (err) {
    console.error('[rotw] GET weeks:', err);
    res.status(500).json({ error: 'Failed to fetch weeks' });
  }
});

router.post('/rotw/weeks', requireAdmin, async (req, res) => {
  try {
    let { week_start } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    const d = new Date(week_start + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffToMonday);
    const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0');
    week_start = `${y}-${mo}-${dy}`;

    const week = await withAdminRetry(pb => pb.collection('rotw_weeks').create({ week_start, posted: false }));
    res.status(201).json({ week });
  } catch (err) {
    if (err?.response?.code === 400) return res.status(409).json({ error: 'Week already exists' });
    console.error('[rotw] POST weeks:', err);
    res.status(500).json({ error: 'Failed to create week' });
  }
});

// DELETE /api/rotw/weeks/:id
router.delete('/rotw/weeks/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    // Delete slots first (cascade should handle it but belt + suspenders)
    const slots = await pb.collection('rotw_slots').getFullList({
      filter: `week = "${escFilterValue(req.params.id)}"`, requestKey: null,
    });
    await Promise.all(slots.map(s => pb.collection('rotw_slots').delete(s.id)));
    await pb.collection('rotw_weeks').delete(req.params.id);
    invalidateRotwCache(); invalidateRotwRoutes();
    res.json({ message: 'Week deleted' });
  } catch (err) {
    console.error('[rotw] DELETE week:', err);
    res.status(500).json({ error: 'Failed to delete week' });
  }
});

// Admin: slots

// GET /api/rotw/weeks/:id/slots
router.get('/rotw/weeks/:id/slots', requireAdmin, async (req, res) => {
  try {
    const pb    = await getAdminClient();
    const slots = await pb.collection('rotw_slots').getFullList({
      filter:  `week = "${escFilterValue(req.params.id)}"`,
      sort:    'day,sort_order',
      expand:  'route,multiplier,return_route,return_multiplier',
      requestKey: null,
    });
    res.json({ slots });
  } catch (err) {
    console.error('[rotw] GET slots:', err);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

router.put('/rotw/weeks/:id/slots', requireAdmin, async (req, res) => {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be an array' });

    const pb     = await getAdminClient();
    const weekId = req.params.id;

    // Verify week exists
    await pb.collection('rotw_weeks').getOne(weekId, { requestKey: null });

    // Delete existing slots
    const existing = await pb.collection('rotw_slots').getFullList({
      filter: `week = "${escFilterValue(weekId)}"`, requestKey: null,
    });
    await Promise.all(existing.map(s => pb.collection('rotw_slots').delete(s.id)));

    // Create new slots sequentially to avoid PocketBase auto-cancellation
    const created = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const record = await pb.collection('rotw_slots').create({
        week:               weekId,
        day:                s.day,
        route:              s.routeId,
        multiplier:         s.multiplierId       || null,
        bidirectional:      s.bidirectional      || false,
        return_route:       s.returnRouteId      || null,
        return_multiplier:  s.returnMultiplierId || null,
        sort_order:         s.sort_order ?? i,
      }, { requestKey: `rotw-slot-${weekId}-${i}` });
      created.push(record);
    }

    invalidateRotwCache(); invalidateRotwRoutes();
    res.json({ slots: created });
  } catch (err) {
    console.error('[rotw] PUT slots:', err);
    res.status(500).json({ error: 'Failed to save slots' });
  }
});

// Admin: publish

// POST /api/rotw/weeks/:id/publish
router.post('/rotw/weeks/:id/publish', requireAdmin, async (req, res) => {
  try {
    const pb     = await getAdminClient();
    const weekId = req.params.id;

    const week = await pb.collection('rotw_weeks').getOne(weekId, { requestKey: null });
    const weekLabel = fmtWeekLabel(week.week_start);

    // Mark as posted
    await pb.collection('rotw_weeks').update(weekId, {
      posted:    true,
      posted_at: new Date().toISOString(),
    });

    // Also sync legacy settings keys so the Discord formatter still works
    await syncLegacySettings(pb, weekId, week.week_start);

    // Push notification
    notifyAll({
      title: '✈️ Routes of the Week',
      body:  `New routes are live for ${weekLabel}. Check them out!`,
      url:   '/rotw',
      icon:  brand.appIcon,
    }).catch(err => console.error('[rotw] push failed:', err.message));

    // Discord post
    postToDiscord(pb, weekId, weekLabel).catch(err => console.error('[rotw] discord failed:', err.message));

    logAction(req.user, 'rotw.published', { id: weekId, name: weekLabel }, {});
    invalidateRotwCache(); invalidateRotwRoutes();
    res.json({ message: 'Published' });
  } catch (err) {
    console.error('[rotw] publish:', err);
    res.status(500).json({ error: 'Failed to publish' });
  }
});

// Pilot: schedule

router.get('/rotw/schedule', requireAuthOrApiKey, async (req, res) => {
  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: brand.timezone });

    const cached = getCached(todayStr);
    if (cached) return res.json(cached);

    const pb = await getAdminClient();

    const weeks = await pb.collection('rotw_weeks').getFullList({
      filter:     `week_start >= "${escFilterValue(todayStr)}" || posted = true`,
      sort:       'week_start',
      requestKey: null,
    });

    if (!weeks.length) {
      const empty = { weeks: [] };
      setCached(todayStr, empty, 5 * 60 * 1000);
      return res.json(empty);
    }

    // Fetch slots for all weeks in one go
    const weekIds   = weeks.map(w => w.id);
    const filterStr = weekIds.map(id => `week = "${id}"`).join(' || ');
    const slots     = await pb.collection('rotw_slots').getFullList({
      filter:     filterStr,
      sort:       'day,sort_order',
      expand:     'route,multiplier,return_route,return_multiplier',
      requestKey: null,
    });

    // Group slots by week
    const slotsByWeek = {};
    for (const slot of slots) {
      if (!slotsByWeek[slot.week]) slotsByWeek[slot.week] = [];
      slotsByWeek[slot.week].push(slot);
    }

    const result = weeks.map(week => ({
      id:          week.id,
      week_start:  week.week_start,
      posted:      week.posted,
      posted_at:   week.posted_at,
      week_label:  fmtWeekLabel(week.week_start),
      slots:       (slotsByWeek[week.id] || []).map(s => ({
        id:               s.id,
        day:              s.day,
        sort_order:       s.sort_order,
        bidirectional:    s.bidirectional,
        route:            s.expand?.route             || null,
        multiplier:       s.expand?.multiplier        || null,
        return_route:     s.expand?.return_route      || null,
        return_multiplier: s.expand?.return_multiplier || null,
      })),
    }));

    const response = { weeks: result };
    setCached(todayStr, response, 5 * 60 * 1000);
    res.json(response);
  } catch (err) {
    console.error('[rotw] schedule:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Internal helpers

async function syncLegacySettings(pb, weekId, weekStart) {
  const slots    = await pb.collection('rotw_slots').getFullList({
    filter: `week = "${escFilterValue(weekId)}"`, sort: 'day,sort_order', requestKey: null,
  });
  const schedule = slotsToSchedule(slots);
  const label    = fmtWeekLabel(weekStart);

  const saveKey = async (key, value) => {
    let rec;
    try { rec = await pb.collection('settings').getFirstListItem(`key = "${escFilterValue(key)}"`, { requestKey: null }); } catch { rec = null; }
    if (rec) await pb.collection('settings').update(rec.id, { value });
    else     await pb.collection('settings').create({ key, value });
  };

  await Promise.all([
    saveKey('weekly_schedule', JSON.stringify(schedule)),
    saveKey('week_label', label),
  ]);
}

async function postToDiscord(pb, weekId, weekLabel) {
  const ROTW_CHANNEL_ID  = process.env.DISCORD_ROTW_CHANNEL_ID;
  const ROTW_ROLE_ID     = process.env.DISCORD_ROTW_ROLE_ID;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  if (!ROTW_CHANNEL_ID) {
    console.warn('[rotw] DISCORD_ROTW_CHANNEL_ID not set');
    return;
  }
  if (!DISCORD_BOT_TOKEN) {
    console.warn('[rotw] DISCORD_BOT_TOKEN not set');
    return;
  }

  // Fetch slots with expansions
  const slots = await pb.collection('rotw_slots').getFullList({
    filter: `week = "${escFilterValue(weekId)}"`, sort: 'day,sort_order',
    expand: 'route,multiplier', requestKey: null,
  });

  const schedule              = slotsToSchedule(slots);
  const { routeMap, multMap } = buildMapsFromSlots(slots);
  const payload               = buildRotwMessage(schedule, routeMap, multMap, weekLabel, ROTW_ROLE_ID);

  const res = await fetch(`https://discord.com/api/v10/channels/${ROTW_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Discord API error ${res.status}: ${JSON.stringify(err)}`);
  }

  console.log(`[rotw] Posted to Discord channel ${ROTW_CHANNEL_ID}`);
}

module.exports = router;
module.exports.syncLegacySettings = syncLegacySettings;
module.exports.slotsToSchedule    = slotsToSchedule;
module.exports.postToDiscord      = postToDiscord;
module.exports.fmtWeekLabel       = fmtWeekLabel;
