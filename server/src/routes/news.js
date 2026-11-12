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
const { getCached, setCached, invalidateCache } = createCache('news');

router.get('/', requireAuth, async (req, res) => {
  try {
    const cached = getCached('active');
    if (cached) return res.json(cached);

    const pb   = await getAdminClient();
    const all  = await pb.collection('news').getFullList({
      filter: 'active = true',
      sort:   '-created',
      requestKey: null,
    });

    const result = { news: all };
    setCached('active', result, 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[news/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.get('/all', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb  = await getAdminClient();
    const all = await pb.collection('news').getFullList({ sort: '-created', requestKey: null });
    res.json({ news: all });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// POST /api/news
router.post('/', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { title, body, image_url, active = true } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    if (!body?.trim())  return res.status(400).json({ error: 'Body required' });
    const post = await pb.collection('news').create({
      title:     title.trim(),
      body:      body.trim(),
      image_url: image_url?.trim() || '',
      active,
      posted_by: req.user?.first_name || req.user?.callsign || 'Admin',
    });
    logAction(req.user, 'news.created', { id: post.id, name: post.title }, { active: post.active });
    invalidateCache('active');
    res.status(201).json({ post });
  } catch (err) {
    console.error('[news/create]', err.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PATCH /api/news/:id
router.patch('/:id', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb     = await getAdminClient();
    const before = await pb.collection('news').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const post   = await pb.collection('news').update(req.params.id, req.body);
    logAction(req.user, 'news.updated', { id: post.id, name: post.title }, { changes: diffFields(before, req.body) });
    invalidateCache('active');
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/news/:id
router.delete('/:id', requirePermission('notams.manage'), async (req, res) => {
  try {
    const pb   = await getAdminClient();
    const post = await pb.collection('news').getOne(req.params.id, { requestKey: null });
    await pb.collection('news').delete(req.params.id);
    logAction(req.user, 'news.deleted', { id: req.params.id, name: post.title }, {});
    invalidateCache('active');
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
