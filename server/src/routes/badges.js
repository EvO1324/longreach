/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin, requireAuth, requireAuthOrApiKey } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');
const { backfillBadge, handleMissingCollections, syncAllRoleBadges } = require('../services/badges');

const router = express.Router();

function fail(res, err, message) {
  if (handleMissingCollections(err)) {
    return res.status(503).json({ error: 'Badges are not set up yet — run npm run setup and create the database collections' });
  }
  console.error(`[badges] ${message}:`, err.message);
  res.status(500).json({ error: message });
}

function badgeInput(body) {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name).trim();
  if (body.description !== undefined) out.description = String(body.description || '').trim();
  if (body.type !== undefined) out.type = ['if_role', 'event'].includes(body.type) ? body.type : 'hours';
  if (body.hours_required !== undefined) out.hours_required = parseFloat(body.hours_required);
  if (body.if_role_id !== undefined) out.if_role_id = parseInt(body.if_role_id, 10);
  if (body.image_url !== undefined) out.image_url = body.image_url || '';
  return out;
}

// Returns an error message, or null if the badge (as it will be saved) is valid.
function validate(badge) {
  if (!badge.name) return 'Name is required';
  if (badge.type === 'event') return null;
  if (badge.type === 'if_role') {
    if (!Number.isInteger(badge.if_role_id)) return 'Pick the IF role that earns this badge';
  } else if (!Number.isFinite(badge.hours_required) || badge.hours_required < 0) {
    return 'Hours required must be a number';
  }
  return null;
}

// Earned rows with the badge expanded, flattened to { ...badge, earned_at, seen }.
function flattenEarned(rows) {
  return rows
    .filter(r => r.expand?.badge)
    .map(r => ({ ...r.expand.badge, earned_at: r.earned_at, seen: !!r.seen }));
}

router.get('/', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const badges = await pb.collection('badges').getFullList({ sort: 'type,hours_required', requestKey: null });
    res.json({ badges });
  } catch (err) {
    fail(res, err, 'Failed to fetch badges');
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const input = { type: 'hours', ...badgeInput(req.body) };
  if (input.type === 'if_role') input.hours_required = 0;
  const error = validate(input);
  if (error) return res.status(400).json({ error });
  try {
    const pb = await getAdminClient();
    const badge = await pb.collection('badges').create(input);
    const awarded = await backfillBadge(pb, badge);
    logAction(req.user, 'badge.created', { id: badge.id, name: badge.name }, { type: badge.type, hours: badge.hours_required, if_role_id: badge.if_role_id, awarded });
    res.status(201).json({ badge, awarded });
  } catch (err) {
    fail(res, err, 'Failed to create badge');
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const input = badgeInput(req.body);
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('badges').getOne(req.params.id, { requestKey: null });
    const merged = { ...before, ...input };
    if (merged.type === 'if_role' || merged.type === 'event') input.hours_required = merged.hours_required = 0;
    // an event badge stays one; the badge form can't turn it into an hours or role badge
    if (before.type === 'event') input.type = merged.type = 'event';
    const error = validate(merged);
    if (error) return res.status(400).json({ error });
    const badge = await pb.collection('badges').update(req.params.id, input);
    const changed = badge.type !== before.type || badge.hours_required !== before.hours_required || badge.if_role_id !== before.if_role_id;
    const awarded = changed ? await backfillBadge(pb, badge) : 0;
    logAction(req.user, 'badge.updated', { id: badge.id, name: badge.name }, { changes: diffFields(before, input), awarded });
    res.json({ badge, awarded });
  } catch (err) {
    fail(res, err, 'Failed to update badge');
  }
});

router.post('/sync-roles', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    res.json(await syncAllRoleBadges(pb));
  } catch (err) {
    fail(res, err, 'Failed to sync IF role badges');
  }
});

router.get('/:id/holders', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rows = await pb.collection('pilot_badges').getFullList({
      filter: `badge = "${escFilterValue(req.params.id)}"`,
      expand: 'user',
      sort: '-earned_at',
      requestKey: null,
    });
    res.json({
      holders: rows.map(r => ({
        id: r.user,
        name: `${r.expand?.user?.first_name || ''} ${r.expand?.user?.last_name || ''}`.trim() || 'Former pilot',
        callsign: r.expand?.user?.callsign || null,
        earned_at: r.earned_at,
      })),
    });
  } catch (err) {
    fail(res, err, 'Failed to fetch badge holders');
  }
});

router.post('/:id/award', requireAdmin, async (req, res) => {
  const userId = String(req.body?.userId || '');
  if (!userId) return res.status(400).json({ error: 'Pick a pilot to award it to' });
  try {
    const pb = await getAdminClient();
    const [badge, pilot] = await Promise.all([
      pb.collection('badges').getOne(req.params.id, { requestKey: null }),
      pb.collection('users').getOne(userId, { fields: 'id,first_name,last_name,callsign', requestKey: null }),
    ]);
    const existing = await pb.collection('pilot_badges')
      .getFirstListItem(`user = "${escFilterValue(userId)}" && badge = "${escFilterValue(badge.id)}"`, { requestKey: null })
      .catch(() => null);
    if (existing) return res.status(409).json({ error: `${pilot.first_name} already has this badge` });
    await pb.collection('pilot_badges').create({ user: userId, badge: badge.id, earned_at: new Date().toISOString(), seen: false });
    logAction(req.user, 'badge.awarded', { id: badge.id, name: badge.name }, { pilot: pilot.callsign || pilot.id });
    res.status(201).json({ awarded: true });
  } catch (err) {
    if (err?.status === 404) return res.status(404).json({ error: 'Badge or pilot not found' });
    fail(res, err, 'Failed to award badge');
  }
});

router.delete('/:id/award/:userId', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const row = await pb.collection('pilot_badges')
      .getFirstListItem(`user = "${escFilterValue(req.params.userId)}" && badge = "${escFilterValue(req.params.id)}"`, { expand: 'badge,user', requestKey: null })
      .catch(() => null);
    if (!row) return res.status(404).json({ error: "That pilot doesn't have this badge" });
    await pb.collection('pilot_badges').delete(row.id);
    logAction(req.user, 'badge.removed', { id: req.params.id, name: row.expand?.badge?.name || req.params.id }, { pilot: row.expand?.user?.callsign || req.params.userId });
    res.json({ removed: true });
  } catch (err) {
    fail(res, err, 'Failed to remove badge');
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const badge = await pb.collection('badges').getOne(req.params.id, { requestKey: null });
    await pb.collection('badges').delete(req.params.id);
    logAction(req.user, 'badge.deleted', { id: badge.id, name: badge.name }, {});
    res.json({ message: 'Badge deleted' });
  } catch (err) {
    fail(res, err, 'Failed to delete badge');
  }
});

router.get('/pilot/:userId', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rows = await pb.collection('pilot_badges').getFullList({
      filter: `user = "${escFilterValue(req.params.userId)}"`,
      expand: 'badge',
      sort: '-earned_at',
      requestKey: null,
    });
    res.json({ badges: flattenEarned(rows).map(({ seen, ...b }) => b) });
  } catch (err) {
    fail(res, err, 'Failed to fetch pilot badges');
  }
});

router.get('/unseen', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rows = await pb.collection('pilot_badges').getFullList({
      filter: `user = "${escFilterValue(req.user.id)}" && seen = false`,
      expand: 'badge',
      sort: 'earned_at',
      requestKey: null,
    });
    res.json({ badges: flattenEarned(rows) });
  } catch (err) {
    if (handleMissingCollections(err)) return res.json({ badges: [] });
    fail(res, err, 'Failed to fetch new badges');
  }
});

router.post('/seen', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rows = await pb.collection('pilot_badges').getFullList({
      filter: `user = "${escFilterValue(req.user.id)}" && seen = false`,
      fields: 'id',
      requestKey: null,
    });
    await Promise.all(rows.map(r => pb.collection('pilot_badges').update(r.id, { seen: true }, { requestKey: null })));
    res.json({ updated: rows.length });
  } catch (err) {
    fail(res, err, 'Failed to update badges');
  }
});

module.exports = router;
