/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Plugins: switch optional parts of the crew centre on and off

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const plugins = require('../config/plugins');
const runtime = require('../config/runtime');

const router = express.Router();

// The site reads this to know which pages to show
router.get('/', (req, res) => {
  res.json({ plugins: plugins.list(), canRestart: process.env.pm_id !== undefined });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const p = plugins.list().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'No such plugin' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled should be true or false' });
  try {
    const pb = await getAdminClient();
    await plugins.save(pb, { [p.id]: req.body.enabled });
    // the bot and the scheduled jobs pick it up when they restart
    await runtime.bumpVersion(pb);
    logAction(req.user, req.body.enabled ? 'plugin.enabled' : 'plugin.disabled', { id: p.id, name: p.name });
    const restarting = process.env.pm_id !== undefined;
    res.json({ ok: true, plugins: plugins.list(), restarting });
    if (restarting) setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t save' });
  }
});

module.exports = router;
