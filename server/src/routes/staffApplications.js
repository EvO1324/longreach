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
const { logAction, diffFields } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();

// Public: list open positions
router.get('/positions', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const positions = await pb.collection('staff_positions').getFullList({
      filter: 'open = true',
      sort:   'title',
      requestKey: null,
    });
    res.json({ positions });
  } catch (err) {
    console.error('[staff-apps/positions]', err.message);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Admin: list all positions
router.get('/positions/all', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const positions = await pb.collection('staff_positions').getFullList({
      sort: 'title',
      requestKey: null,
    });
    res.json({ positions });
  } catch (err) {
    console.error('[staff-apps/positions/all]', err.message);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Admin: create position
router.post('/positions', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const position = await pb.collection('staff_positions').create({
      title: title.trim(),
      description: description?.trim() || '',
      open: true,
    });
    logAction(req.user, 'staff_position.created', { id: position.id, name: position.title }, {});
    res.status(201).json({ position });
  } catch (err) {
    console.error('[staff-apps/positions/create]', err.message);
    res.status(500).json({ error: 'Failed to create position' });
  }
});

// Admin: update position
router.patch('/positions/:id', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('staff_positions').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const position = await pb.collection('staff_positions').update(req.params.id, req.body);
    logAction(req.user, 'staff_position.updated', { id: position.id, name: position.title }, { changes: diffFields(before, req.body) });
    res.json({ position });
  } catch (err) {
    console.error('[staff-apps/positions/update]', err.message);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Admin: delete position
router.delete('/positions/:id', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const position = await pb.collection('staff_positions').getOne(req.params.id, { requestKey: null });
    await pb.collection('staff_positions').delete(req.params.id);
    logAction(req.user, 'staff_position.deleted', { id: req.params.id, name: position.title }, {});
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[staff-apps/positions/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

// Public: submit application
router.post('/', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { name, ifc_username, discord_username, position_id, reason } = req.body;

    if (!name?.trim())           return res.status(400).json({ error: 'Name is required' });
    if (!ifc_username?.trim())   return res.status(400).json({ error: 'IFC username is required' });
    if (!discord_username?.trim()) return res.status(400).json({ error: 'Discord username is required' });
    if (!position_id)            return res.status(400).json({ error: 'Position is required' });
    if (!reason?.trim())         return res.status(400).json({ error: 'Please tell us why you want to join' });

    // Verify position is still open
    let position;
    try {
      position = await pb.collection('staff_positions').getOne(position_id, { requestKey: null });
      if (!position.open) return res.status(400).json({ error: 'This position is no longer accepting applications' });
    } catch {
      return res.status(400).json({ error: 'Invalid position' });
    }

    // Try to find a matching crew centre member by IFC username
    let linked_user = null;
    try {
      const matches = await pb.collection('users').getList(1, 1, {
        filter: `ifc_username = "${escFilterValue(ifc_username.trim())}"`,
        requestKey: null,
      });
      if (matches.items.length > 0) linked_user = matches.items[0];
    } catch {}

    const application = await pb.collection('staff_applications').create({
      name:             name.trim(),
      ifc_username:     ifc_username.trim(),
      discord_username: discord_username.trim(),
      position_id,
      position_title:   position.title,
      reason:           reason.trim(),
      status:           'pending',
      linked_user_id:   linked_user?.id   || '',
      linked_callsign:  linked_user?.callsign || '',
      linked_hours:     linked_user?.total_hours || 0,
    });

    // Discord notification
    try {
      const { notifyStaffApplication } = require('./discord');
      await notifyStaffApplication({
        name:             application.name,
        ifc_username:     application.ifc_username,
        discord_username: application.discord_username,
        position_title:   position.title,
        linked_callsign:  linked_user?.callsign || null,
        linked_hours:     linked_user?.total_hours || null,
      });
    } catch (err) {
      console.warn('[staff-apps/notify]', err.message);
    }

    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (err) {
    console.error('[staff-apps/submit]', err.message);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Admin: list applications
router.get('/', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { status } = req.query;
    const filter = status ? `status = "${status}"` : '';
    const applications = await pb.collection('staff_applications').getFullList({
      filter,
      sort: '-created',
      requestKey: null,
    });
    res.json({ applications });
  } catch (err) {
    console.error('[staff-apps/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Admin: update application status
router.patch('/:id', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await pb.collection('staff_applications').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const application = await pb.collection('staff_applications').update(req.params.id, req.body);
    logAction(req.user, 'staff_app.updated', { id: application.id, name: application.name },
      { changes: diffFields(before, req.body) }
    );
    res.json({ application });
  } catch (err) {
    console.error('[staff-apps/update]', err.message);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// Admin: delete application
router.delete('/:id', requirePermission('staff_apps.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const application = await pb.collection('staff_applications').getOne(req.params.id, { requestKey: null }).catch(() => null);
    await pb.collection('staff_applications').delete(req.params.id);
    logAction(req.user, 'staff_app.deleted', { id: req.params.id, name: application?.name || '' }, {});
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[staff-apps/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

module.exports = router;
