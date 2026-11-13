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
const updates    = require('../services/updates');

// Your own entries plus the crew centre's releases (the installed version and
// older). A release you've written your own entry for isn't shown twice.
router.get('/', async (req, res) => {
  try {
    const pb      = await getAdminClient();
    const [records, releases] = await Promise.all([
      pb.collection('changelog').getFullList({ sort: '-date,-created', requestKey: null }),
      updates.installedReleases().catch(() => []),
    ]);
    const mine = new Set(records.map(r => String(r.version || '').replace(/^v/i, '')));
    const changelog = [...records, ...releases.filter(r => !mine.has(r.version))]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ changelog });
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
