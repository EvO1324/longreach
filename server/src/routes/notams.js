/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requirePermission, requireAuth } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');
const { createCache } = require('../utils/cache');

const router = express.Router();
const { getCached, setCached, invalidateCache } = createCache('notams');

router.get('/', async (req, res) => {
  try {
    const cached = getCached('active');
    if (cached) return res.json(cached);

    const pb = await getAdminClient();
    const all = await pb.collection('notams').getFullList({
      filter: 'active = true',
      sort: '-created',
      requestKey: null,
    });
    const now = new Date();
    const notams = all.filter(n => {
      if (!n.expires_at) return true;
      return new Date(n.expires_at) > now;
    });

    const result = { notams };
    setCached('active', result, 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[notams/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch NOTAMs', detail: err.message });
  }
});

router.get('/all', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const notams = await pb.collection('notams').getFullList({
      sort: '-created',
      requestKey: null,
    });
    res.json({ notams });
  } catch (err) {
    console.error('[notams/all]', err.message);
    res.status(500).json({ error: 'Failed to fetch NOTAMs', detail: err.message });
  }
});

// POST /api/notams
router.post('/', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { title, body, type, expires_at } = req.body;
    const notam = await pb.collection('notams').create({
      title,
      body,
      type: type || 'info',
      expires_at: expires_at || null,
      active: true,
    });
    logAction(req.user, 'notam.created', { id: notam.id, name: notam.title }, { type: notam.type });
    invalidateCache('active');
    res.status(201).json({ notam });
  } catch (err) {
    console.error('[notams/create]', err.message);
    res.status(500).json({ error: 'Failed to create NOTAM', detail: err.message });
  }
});

// PATCH /api/notams/:id
router.patch('/:id', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('notams').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const notam = await pb.collection('notams').update(req.params.id, req.body);
    logAction(req.user, 'notam.updated', { id: notam.id, name: notam.title }, { changes: diffFields(before, req.body) });
    invalidateCache('active');
    res.json({ notam });
  } catch (err) {
    console.error('[notams/update]', err.message);
    res.status(500).json({ error: 'Failed to update NOTAM', detail: err.message });
  }
});

// DELETE /api/notams/:id
router.delete('/:id', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const notam = await pb.collection('notams').getOne(req.params.id, { requestKey: null });
    await pb.collection('notams').delete(req.params.id);
    logAction(req.user, 'notam.deleted', { id: req.params.id, name: notam.title }, {});
    invalidateCache('active');
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[notams/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete NOTAM', detail: err.message });
  }
});

module.exports = router;
