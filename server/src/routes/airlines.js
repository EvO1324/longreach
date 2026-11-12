/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');

const router = express.Router();

// Simple cache
let _cache = null;
let _cacheExp = 0;
const CACHE_TTL = 5 * 60 * 1000;
const getCache  = () => (_cache && Date.now() < _cacheExp) ? _cache : null;
const setCache  = (v) => { _cache = v; _cacheExp = Date.now() + CACHE_TTL; };
const bustCache = () => { _cache = null; };

// GET /api/airlines
router.get('/', async (req, res) => {
  try {
    const cached = getCache();
    if (cached) return res.json(cached);
    const pb = await getAdminClient();
    const airlines = await pb.collection('airlines').getFullList({
      sort: 'code',
      requestKey: null,
    });
    const result = { airlines: airlines.map(a => ({
      id:       a.id,
      code:     a.code,
      name:     a.name,
      logo_url: a.logo_url || '',
    }))};
    setCache(result);
    res.json(result);
  } catch (err) {
    console.error('[airlines/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch airlines' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { code, name, logo_url } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const pb = await getAdminClient();
    const airline = await pb.collection('airlines').create({
      code:     code.toUpperCase().trim(),
      name:     name.trim(),
      logo_url: logo_url || '',
    });
    bustCache();
    logAction(req.user, 'airline.created', { id: airline.id, name: airline.name }, { code: airline.code });
    res.status(201).json({ airline });
  } catch (err) {
    console.error('[airlines/create]', err.message);
    res.status(500).json({ error: 'Failed to create airline' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { code, name, logo_url } = req.body;
    const update = {};
    if (code     !== undefined) update.code     = code.toUpperCase().trim();
    if (name     !== undefined) update.name     = name.trim();
    if (logo_url !== undefined) update.logo_url = logo_url;
    const pb = await getAdminClient();
    const before = await pb.collection('airlines').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const airline = await pb.collection('airlines').update(req.params.id, update);
    bustCache();
    logAction(req.user, 'airline.updated', { id: airline.id, name: airline.name }, { changes: diffFields(before, update) });
    res.json({ airline });
  } catch (err) {
    console.error('[airlines/update]', err.message);
    res.status(500).json({ error: 'Failed to update airline' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const airline = await pb.collection('airlines').getOne(req.params.id, { requestKey: null });
    await pb.collection('airlines').delete(req.params.id);
    bustCache();
    logAction(req.user, 'airline.deleted', { id: req.params.id, name: airline.name }, {});
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[airlines/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete airline' });
  }
});

module.exports = router;
