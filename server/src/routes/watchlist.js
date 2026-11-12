/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requirePermission } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');

const router = express.Router();

router.get('/check', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || !username.trim()) return res.json({ blocked: false });
    const target = username.trim().toLowerCase();
    const pb = await getAdminClient();
    const blacklist = await pb.collection('watchlist').getFullList({
      filter: 'status = "blacklist"',
      fields: 'ifc_username',
      requestKey: null,
    });
    const blocked = blacklist.some(e => e.ifc_username?.toLowerCase() === target);
    res.json({ blocked });
  } catch (err) {
    console.error('[watchlist/check]', err.message);
    res.json({ blocked: false });
  }
});

router.get('/', requirePermission('recruitment.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const records = await pb.collection('watchlist').getFullList({
      sort: '-created',
      requestKey: null,
    });
    res.json({ entries: records });
  } catch (err) {
    console.error('[watchlist/list]', err.message);
    res.status(500).json({ error: 'Failed to load watchlist' });
  }
});

router.post('/', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const { ifc_username, status, reason } = req.body;
    if (!ifc_username || !ifc_username.trim()) {
      return res.status(400).json({ error: 'IFC username is required' });
    }
    if (!['watchlist', 'blacklist'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "watchlist" or "blacklist"' });
    }

    const pb = await getAdminClient();
    const record = await pb.collection('watchlist').create({
      ifc_username: ifc_username.trim(),
      status,
      reason: (reason || '').trim(),
      added_by: req.user.callsign || req.user.email || 'system',
    });

    logAction(req.user, 'watchlist.added', { id: record.id, name: record.ifc_username }, { status, reason: record.reason }).catch(() => {});
    res.json({ success: true, entry: record });
  } catch (err) {
    console.error('[watchlist/create]', err.message);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

router.patch('/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { id } = req.params;
    const before = await pb.collection('watchlist').getOne(id, { requestKey: null });

    const updates = {};
    if (req.body.ifc_username !== undefined) updates.ifc_username = req.body.ifc_username.trim();
    if (req.body.status !== undefined) {
      if (!['watchlist', 'blacklist'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Status must be "watchlist" or "blacklist"' });
      }
      updates.status = req.body.status;
    }
    if (req.body.reason !== undefined) updates.reason = req.body.reason.trim();

    const after = await pb.collection('watchlist').update(id, updates);

    logAction(req.user, 'watchlist.updated', { id, name: after.ifc_username }, { changes: diffFields(before, updates) }).catch(() => {});
    res.json({ success: true, entry: after });
  } catch (err) {
    console.error('[watchlist/update]', err.message);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

router.delete('/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { id } = req.params;
    const record = await pb.collection('watchlist').getOne(id, { requestKey: null }).catch(() => null);
    await pb.collection('watchlist').delete(id);

    logAction(req.user, 'watchlist.removed', { id, name: record?.ifc_username || id }, {}).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[watchlist/delete]', err.message);
    res.status(500).json({ error: 'Failed to remove entry' });
  }
});

module.exports = router;
