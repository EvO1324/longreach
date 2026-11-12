/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express    = require('express');
const router     = express.Router();
const { getAdminClient } = require('../config/pocketbase');
const { requireAuth, requirePermission } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const pb      = await getAdminClient();
    const records = await pb.collection('changelog').getFullList({
      sort: '-date,-created',
      requestKey: null,
    });
    res.json({ changelog: records });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

router.post('/', requireAuth, requirePermission('settings.edit'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { version, title, date, entries } = req.body;
    if (!version || !title || !date || !entries?.length) {
      return res.status(400).json({ error: 'version, title, date and entries are required' });
    }
    const record = await pb.collection('changelog').create({
      version, title, date,
      entries: JSON.stringify(entries),
    });
    res.json({ record });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create changelog entry' });
  }
});

router.patch('/:id', requireAuth, requirePermission('settings.edit'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { version, title, date, entries } = req.body;
    const updates = {};
    if (version !== undefined) updates.version = version;
    if (title   !== undefined) updates.title   = title;
    if (date    !== undefined) updates.date     = date;
    if (entries !== undefined) updates.entries  = JSON.stringify(entries);
    const record = await pb.collection('changelog').update(req.params.id, updates);
    res.json({ record });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update changelog entry' });
  }
});

router.delete('/:id', requireAuth, requirePermission('settings.edit'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    await pb.collection('changelog').delete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete changelog entry' });
  }
});

module.exports = router;
