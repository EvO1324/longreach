/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

const SYSTEM_NOISE_ACTIONS = [
  'activity_check.run',
  'activity_check.dry_run',
  'pirep.retry_no_match',
  'pirep.auto_approved_retry',
  'pirep.auto_approved',
];

// GET /api/audit-logs
// Query params: page, limit, action, actor_id, search, hide_system
router.get('/', requirePermission('audit.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const {
      page   = 1,
      limit  = 50,
      action = '',
      actor_id = '',
      search = '',
      hide_system = '',
    } = req.query;

    const filters = [];
    if (action)   filters.push(`action = "${action}"`);
    if (actor_id) filters.push(`actor_id = "${actor_id}"`);
    if (search)   filters.push(`(actor_name ~ "${search}" || target_name ~ "${search}" || action ~ "${search}")`);
    if (hide_system === 'true' && !action) {
      filters.push(SYSTEM_NOISE_ACTIONS.map(a => `action != "${a}"`).join(' && '));
    }

    const filter = filters.join(' && ');

    const result = await pb.collection('audit_logs').getList(
      Number(page),
      Number(limit),
      { filter, sort: '-created', requestKey: null }
    );

    res.json({
      logs:       result.items,
      total:      result.totalItems,
      totalPages: result.totalPages,
      page:       result.page,
    });
  } catch (err) {
    console.error('[audit-logs/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/actions', requirePermission('audit.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const all = await pb.collection('audit_logs').getFullList({
      fields: 'action',
      requestKey: null,
    });
    const actions = [...new Set(all.map(l => l.action))].sort();
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch action types' });
  }
});

router.delete('/', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const all = await pb.collection('audit_logs').getFullList({ fields: 'id', requestKey: null });
    await Promise.all(all.map(l => pb.collection('audit_logs').delete(l.id)));
    res.json({ deleted: all.length });
  } catch (err) {
    console.error('[audit-logs/clear]', err.message);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

module.exports = router;
