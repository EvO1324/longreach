/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { logAction, diffFields } = require('../utils/audit');

const router = express.Router();

const ALL_PERMISSIONS = [
  // Pilots
  'pilots.view',
  'pilots.edit',
  'pilots.view_email',
  'pilots.edit_email',
  // PIREPs
  'pireps.view',
  'pireps.approve',
  'pireps.reject',
  // Recruitment
  'recruitment.view',
  'recruitment.manage',
  // Operations
  'notams.manage',
  'audit.view',
  // Staff applications
  'staff_apps.manage',
  'events.manage',
];

// GET /api/roles
router.get('/', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const roles = await pb.collection('roles').getFullList({ sort: 'name', requestKey: null });
    res.json({ roles, all_permissions: ALL_PERMISSIONS });
  } catch (err) {
    console.error('[roles GET]', err.message || err);
    res.status(500).json({ error: 'Failed to fetch roles', detail: err.message });
  }
});

// POST /api/roles
router.post('/', requireAdmin, async (req, res) => {
  const { name, permissions, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const pb = await getAdminClient();
    const role = await pb.collection('roles').create({ name, permissions: permissions || [], color: color || '#6e6e6e' });
    logAction(req.user, 'role.created', { id: role.id, name: role.name }, { permissions: (permissions || []).join(', ') });
    res.status(201).json({ role });
  } catch (err) {
    console.error('[roles POST]', err.message || err);
    res.status(500).json({ error: 'Failed to create role', detail: err.message });
  }
});

router.patch('/assign/:userId', requireAdmin, async (req, res) => {
  const { role_id } = req.body;
  try {
    const pb = await getAdminClient();
    const [before, roleNames] = await Promise.all([
      pb.collection('users').getOne(req.params.userId, { requestKey: null }).catch(() => null),
      pb.collection('roles').getFullList({ requestKey: null }).catch(() => []),
    ]);
    await adminPatch(req.params.userId, { staff_role: role_id || '' });
    const nameOf = (id) => roleNames.find(r => r.id === id)?.name || (id ? id : 'None');
    logAction(req.user, 'role.assigned',
      { id: req.params.userId, name: before ? `${before.first_name} ${before.last_name}` : req.params.userId },
      { changes: { staff_role: { from: nameOf(before?.staff_role), to: nameOf(role_id) } } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[roles assign]', err.message || err);
    res.status(500).json({ error: 'Failed to assign role', detail: err.message });
  }
});

// PATCH /api/roles/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, permissions, color } = req.body;
  try {
    const pb = await getAdminClient();
    const update = {};
    if (name !== undefined) update.name = name;
    if (permissions !== undefined) update.permissions = permissions;
    if (color !== undefined) update.color = color;
    const before = await pb.collection('roles').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const role = await pb.collection('roles').update(req.params.id, update);
    logAction(req.user, 'role.updated', { id: role.id, name: role.name }, { changes: diffFields(before, update) });
    res.json({ role });
  } catch (err) {
    console.error('[roles PATCH]', err.message || err);
    res.status(500).json({ error: 'Failed to update role', detail: err.message });
  }
});

// DELETE /api/roles/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const role = await pb.collection('roles').getOne(req.params.id, { requestKey: null });
    await pb.collection('roles').delete(req.params.id);
    logAction(req.user, 'role.deleted', { id: req.params.id, name: role.name }, {});
    res.json({ success: true });
  } catch (err) {
    console.error('[roles DELETE]', err.message || err);
    res.status(500).json({ error: 'Failed to delete role', detail: err.message });
  }
});

module.exports = { router, ALL_PERMISSIONS };
