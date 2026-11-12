/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const updates = require('../services/updates');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [status, run] = await Promise.all([updates.status(), updates.lastRun().catch(() => null)]);
    res.json({ ...status, run });
  } catch (err) {
    res.json({ current: updates.CURRENT, available: [], error: err.message, upstream: updates.UPSTREAM });
  }
});

router.get('/run', requireAdmin, async (req, res) => {
  res.json({ run: await updates.lastRun().catch(() => null) });
});

// POST /api/updates/apply { version }
router.post('/apply', requireAdmin, async (req, res) => {
  try {
    const version = String(req.body?.version || '');
    const result = await updates.apply(version);
    logAction(req.user, 'update.start', null, { version }).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
