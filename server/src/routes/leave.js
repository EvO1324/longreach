/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { notifyLeaveRequest, notifyLeaveReviewed } = require('./discord');
const { getAdminClient } = require('../config/pocketbase');
const { requireAuth, requireAdmin, requirePermission } = require('../middleware/auth');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();

// GET /api/leave/mine — pilot's own leave history
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const pb      = await getAdminClient();
    const records = await pb.collection('leave_requests').getFullList({
      filter: `user = "${escFilterValue(req.user.id)}"`,
      sort: '-created',
      requestKey: null,
    });
    res.json({ leave: records });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// POST /api/leave — pilot submits leave request
router.post('/', requireAuth, async (req, res) => {
  try {
    const { start_date, end_date, reason } = req.body;
    if (!start_date || !end_date || !reason?.trim()) {
      return res.status(400).json({ error: 'start_date, end_date and reason are required' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'end_date must be after start_date' });
    }

    const pb = await getAdminClient();

    // Check for overlapping pending/approved leave
    const existing = await pb.collection('leave_requests').getFullList({
      filter: `user = "${escFilterValue(req.user.id)}" && (status = "pending" || status = "approved") && start_date <= "${escFilterValue(end_date)}" && end_date >= "${escFilterValue(start_date)}"`,
      requestKey: null,
    });
    if (existing.length > 0) {
      return res.status(400).json({ error: 'You already have an active or pending leave request overlapping those dates' });
    }

    const record = await pb.collection('leave_requests').create({
      user:       req.user.id,
      start_date,
      end_date,
      reason:     reason.trim(),
      status:     'pending',
    });

    // Notify #activity channel
    notifyLeaveRequest({
      pilot_name: `${req.user.first_name} ${req.user.last_name}`,
      callsign:   req.user.callsign || null,
      start_date, end_date, reason: reason.trim(),
    }).catch(() => {});

    res.status(201).json({ leave: record });
  } catch (err) {
    console.error('[leave] create error:', err);
    res.status(500).json({ error: 'Failed to submit leave request' });
  }
});

// DELETE /api/leave/:id — pilot cancels their own pending request
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const pb     = await getAdminClient();
    const record = await pb.collection('leave_requests').getOne(req.params.id, { requestKey: null });
    if (record.user !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (record.status !== 'pending')  return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    await pb.collection('leave_requests').delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel leave request' });
  }
});

// GET /api/leave — admin: all leave requests
router.get('/', requirePermission('leave.manage'), async (req, res) => {
  try {
    const pb      = await getAdminClient();
    const { status } = req.query;
    const filter  = status ? `status = "${status}"` : '';
    const records = await pb.collection('leave_requests').getFullList({
      filter,
      sort: '-created',
      expand: 'user',
      requestKey: null,
    });
    res.json({ leave: records });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// PATCH /api/leave/:id — admin: approve or deny
router.patch('/:id', requirePermission('leave.manage'), async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or denied' });
    }
    const pb     = await getAdminClient();
    let leaveRecord;
    try { leaveRecord = await pb.collection('leave_requests').getOne(req.params.id, { expand: 'user', requestKey: null }); } catch {}

    const updated = await pb.collection('leave_requests').update(req.params.id, {
      status,
      admin_note:  admin_note?.trim() || '',
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
    });

    // If approved, clear activity warning from the pilot's account + remove warning role
    if (status === 'approved' && leaveRecord?.expand?.user) {
      const pilot = leaveRecord.expand.user;
      try {
        await pb.collection('users').update(pilot.id, { activity_warned_at: null });
        // Remove the activity warning Discord role
        const { assignRole, removeRole } = require('../jobs/activityCheck');
        const warningRoleId = process.env.DISCORD_ACTIVITY_WARNING_ROLE_ID;
        if (pilot.discord_id && warningRoleId) {
          await removeRole(pilot.discord_id, warningRoleId);
        }
        console.log(`[leave] cleared activity warning for ${pilot.first_name} ${pilot.last_name} (LOA approved)`);
      } catch (e) {
        console.warn('[leave] could not clear activity warning:', e.message);
      }
    }

    if (leaveRecord) {
      const pilot = leaveRecord.expand?.user;
      notifyLeaveReviewed({
        pilot_name: pilot ? `${pilot.first_name} ${pilot.last_name}` : 'Unknown',
        callsign:   pilot?.callsign || null,
        start_date: leaveRecord.start_date,
        end_date:   leaveRecord.end_date,
        status,
        admin_note: admin_note?.trim() || null,
      }).catch(() => {});
    }

    res.json({ leave: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update leave request' });
  }
});

// GET /api/leave/active-users — returns user IDs currently on approved leave (used by activity check)
router.get('/active-users', requirePermission('leave.manage'), async (req, res) => {
  try {
    const pb    = await getAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const records = await pb.collection('leave_requests').getFullList({
      filter: `status = "approved" && start_date <= "${escFilterValue(today)}" && end_date >= "${escFilterValue(today)}"`,
      fields: 'user',
      requestKey: null,
    });
    res.json({ userIds: records.map(r => r.user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active leave' });
  }
});

module.exports = router;
