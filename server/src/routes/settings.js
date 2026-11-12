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
const { notifyAll } = require('./push');
const { requireAdmin, requireAuth, requireAuthOrApiKey } = require('../middleware/auth');
const { availableGifts } = require('../services/giftMultipliers');
const { logAction, diffFields } = require('../utils/audit');
const { createCache } = require('../utils/cache');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();
const { getCached, setCached, invalidateCache } = createCache('settings');

// Settings

const PRIVATE_SETTINGS_KEYS = new Set([
  'email_config', 'email_templates', 'bot_commands_registered_at',
  'leaderboard_post_time', 'leaderboard_post_day', 'leaderboard_last_fired',
  'recruitment_reminder_last_ping', 'auto_approve_window_days',
]);

router.get('/settings', async (req, res) => {
  try {
    const cached = getCached('public');
    if (cached) return res.json(cached);

    const pb      = await getAdminClient();
    const records = await pb.collection('settings').getFullList({ requestKey: null });
    const map     = {};
    records.forEach(r => {
      // config.* holds Admin › Connections (webhooks, tokens): never public
      if (!PRIVATE_SETTINGS_KEYS.has(r.key) && !r.key.startsWith('config.') && r.key !== 'config_version') map[r.key] = r.value;
    });

    const result = { settings: map };
    setCached('public', result, 60 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings/:key', requireAdmin, async (req, res) => {
  if (req.params.key.startsWith('config.') || req.params.key === 'config_version') {
    return res.status(400).json({ error: 'Change this in Admin › Connections' });
  }
  try {
    const { value } = req.body;
    const pb = await getAdminClient();

    // Try to find existing record
    let existing;
    try {
      existing = await pb.collection('settings').getFirstListItem(`key = "${escFilterValue(req.params.key)}"`, { requestKey: null });
    } catch {
      existing = null;
    }

    const summarize = (v) => {
      if (v === undefined || v === null) return null;
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return s.length > 140 ? `${s.slice(0, 140)}…` : s;
    };
    const prevValue = existing ? existing.value : null;

    if (existing) {
      await pb.collection('settings').update(existing.id, { value });
    } else {
      await pb.collection('settings').create({ key: req.params.key, value });
    }
    invalidateCache('public');

    // Notify all pilots when ROTW is updated
    if (req.params.key === 'weekly_schedule') {
      // Push notification
      notifyAll({
        title: '🗺️ Routes of the Week Updated',
        body: 'New routes have been posted for this week. Check them out!',
        url: '/rotw',
        icon: brand.appIcon,
      }).catch(err => console.error('[push] rotw notify failed:', err.message));
    }

    logAction(req.user, 'settings.updated', { id: req.params.key, name: req.params.key },
      { changes: { value: { from: summarize(prevValue), to: summarize(value) } } }
    );
    res.json({ message: 'Setting saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// Multipliers

// GET /api/multipliers
router.get('/multipliers', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const multipliers = await pb.collection('multipliers').getFullList({ requestKey: null,
      filter: 'active = true',
      sort: 'name',
    });
    res.json({ multipliers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch multipliers' });
  }
});

router.get('/multipliers/gifts', requireAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const pb = await getAdminClient();
    const gifts = await availableGifts(pb, req.user.id);
    res.json({ gifts: gifts.map(g => ({ ...g, kind: 'gift' })) });
  } catch (err) {
    console.error('[multipliers/gifts]', err.message);
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

router.get('/multipliers/:id/claims', requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const pb = await getAdminClient();
    const multiplier = await pb.collection('multipliers').getOne(req.params.id, { requestKey: null }).catch(() => null);
    if (!multiplier) return res.status(404).json({ error: 'Multiplier not found' });

    const [claims, pilots] = await Promise.all([
      pb.collection('promo_uses').getFullList({
        filter: `multiplier = "${escFilterValue(multiplier.id)}"`,
        expand: 'user,flight',
        sort: '-used_at',
        requestKey: null,
      }),
      pb.collection('users').getFullList({
        filter: 'status = "approved"',
        fields: 'id,first_name,last_name,callsign',
        sort: 'first_name',
        requestKey: null,
      }),
    ]);

    const pilotSummary = u => (u ? { id: u.id, name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), callsign: u.callsign || null } : null);
    const claimedIds = new Set(claims.map(c => c.user));
    res.json({
      claims: claims.map(c => {
        const f = c.expand?.flight;
        return {
          id: c.id,
          usedAt: c.used_at,
          pilot: pilotSummary(c.expand?.user),
          flight: f ? { id: f.id, flightNumber: f.flight_number, route: `${f.departure_icao}-${f.arrival_icao}`, status: f.status, date: f.date } : null,
        };
      }),
      unclaimed: pilots.filter(p => !claimedIds.has(p.id)).map(pilotSummary),
      eligible: pilots.length,
    });
  } catch (err) {
    console.error('[multipliers/claims]', err.message);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

router.get('/multipliers/all', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const multipliers = await pb.collection('multipliers').getFullList({ requestKey: null, sort: 'name' });
    res.json({ multipliers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch multipliers' });
  }
});

router.post('/multipliers', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const multiplier = await pb.collection('multipliers').create(req.body);
    logAction(req.user, 'multiplier.created', { id: multiplier.id, name: multiplier.name }, { value: multiplier.value });
    res.status(201).json({ multiplier });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create multiplier' });
  }
});

router.patch('/multipliers/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('multipliers').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const multiplier = await pb.collection('multipliers').update(req.params.id, req.body);
    logAction(req.user, 'multiplier.updated', { id: multiplier.id, name: multiplier.name }, { changes: diffFields(before, req.body) });
    res.json({ multiplier });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update multiplier' });
  }
});

router.delete('/multipliers/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const multiplier = await pb.collection('multipliers').getOne(req.params.id, { requestKey: null });
    await pb.collection('multipliers').delete(req.params.id);
    logAction(req.user, 'multiplier.deleted', { id: req.params.id, name: multiplier.name }, {});
    res.json({ message: 'Multiplier deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete multiplier' });
  }
});

// Promo codes

router.get('/multipliers/promo/:code', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const code = req.params.code.toUpperCase().trim();

    // Find active multiplier with this promo code, expanding linked route if any
    let multiplier;
    try {
      multiplier = await pb.collection('multipliers').getFirstListItem(
        `promo_code = "${code}" && active = true`,
        { requestKey: null, expand: 'promo_route' }
      );
    } catch {
      return res.status(404).json({ error: 'Invalid or inactive promo code' });
    }

    // Check if this pilot has already used it
    let alreadyUsed = false;
    try {
      await pb.collection('promo_uses').getFirstListItem(
        `user = "${req.user.id}" && multiplier = "${multiplier.id}"`,
        { requestKey: null }
      );
      alreadyUsed = true;
    } catch { /* not found = not used yet */ }

    if (alreadyUsed) {
      return res.status(409).json({ error: 'You have already used this promo code' });
    }

    // Build route prefill if a route is linked
    const route = multiplier.expand?.promo_route || null;
    const routePrefill = route ? {
      id:             route.id,
      flight_number:  route.flight_number,
      departure_icao: route.departure_icao,
      arrival_icao:   route.arrival_icao,
      aircraft:       route.aircraft || null,
    } : null;

    res.json({
      multiplier: {
        id:    multiplier.id,
        code:  multiplier.promo_code,
        value: multiplier.value,
        name:  multiplier.name,
      },
      route: routePrefill,
    });
  } catch (err) {
    console.error('[promo/validate]', err.message);
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
});

module.exports = router;
