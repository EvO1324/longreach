/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Comment threads on PIREPs: the pilot and staff (anyone who can view PIREPs)
// talk it through on the PIREP itself. Each side gets an unread flag on the
// flight so the logbook and the PIREPs page can show a new reply.

const express = require('express');
const brand = require('../../config/brand');
const { getAdminClient } = require('../../config/pocketbase');
const { requireAuth, requirePermission, getStaffPermissions, isDeveloperUser } = require('../../middleware/auth');
const { notifyUser } = require('../push');

const router = express.Router();
const MAX = 2000;

async function canStaff(user, perm = 'pireps.view') {
  if (user.role === 'admin' || isDeveloperUser(user)) return true;
  if (!user.staff_role) return false;
  return (await getStaffPermissions(user.staff_role)).includes(perm);
}

const nameOf = u => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.callsign || 'Pilot';
const shape = c => ({ id: c.id, author: c.author_name, user: c.user, staff: !!c.staff, body: c.body, created: c.created });

// The flight plus who's asking: { flight, owner, staff } or a 403/404
async function access(pb, req, res) {
  const flight = await pb.collection('flights').getOne(req.params.id, { fields: 'id,user,departure_icao,arrival_icao,status', requestKey: null }).catch(() => null);
  if (!flight) { res.status(404).json({ error: 'PIREP not found' }); return null; }
  const owner = flight.user === req.user.id;
  const staff = await canStaff(req.user);
  if (!owner && !staff) { res.status(403).json({ error: 'Not your PIREP' }); return null; }
  return { flight, owner, staff };
}

// Adds a comment and sets the other side's unread flag. Used by the reject
// routes too, so a rejection reason starts the thread.
async function addComment(pb, { flightId, user, staff, body }) {
  const c = await pb.collection('pirep_comments').create({
    flight: flightId, user: user?.id || '', author_name: user ? nameOf(user) : 'Staff', staff: !!staff, body: String(body).slice(0, MAX),
  });
  await pb.collection('flights').update(flightId, staff ? { pilot_unread: true } : { staff_unread: true }).catch(() => {});
  return c;
}

// PIREPs where the pilot has replied and staff haven't looked yet
router.get('/comments/unread', requirePermission('pireps.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const list = await pb.collection('flights').getList(1, 50, {
      filter: 'staff_unread = true', sort: '-updated', expand: 'user',
      fields: 'id,departure_icao,arrival_icao,status,flight_number,updated,expand.user.first_name,expand.user.last_name,expand.user.callsign',
      requestKey: null,
    });
    res.json({ flights: list.items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load replies' });
  }
});

router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const a = await access(pb, req, res);
    if (!a) return;
    const items = await pb.collection('pirep_comments').getFullList({ filter: pb.filter('flight = {:id}', { id: a.flight.id }), sort: 'created', requestKey: null });
    // reading the thread clears your side's unread flag
    const clear = a.owner ? { pilot_unread: false } : { staff_unread: false };
    pb.collection('flights').update(a.flight.id, clear).catch(() => {});
    res.json({ comments: items.map(shape), you: { owner: a.owner, staff: a.staff } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Write something first' });
    if (body.length > MAX) return res.status(400).json({ error: `Keep it under ${MAX} characters` });
    const pb = await getAdminClient();
    const a = await access(pb, req, res);
    if (!a) return;
    const user = await pb.collection('users').getOne(req.user.id, { fields: 'id,first_name,last_name,callsign', requestKey: null });
    // staff replying on their own PIREP count as the pilot
    const asStaff = a.staff && !a.owner;
    const c = await addComment(pb, { flightId: a.flight.id, user, staff: asStaff, body });
    if (asStaff) {
      notifyUser(a.flight.user, {
        title: `💬 Reply on your ${a.flight.departure_icao} → ${a.flight.arrival_icao} PIREP`,
        body: `${nameOf(user)}: ${body.slice(0, 120)}`,
        url: '/logbook',
        icon: brand.appIcon,
      }).catch(() => {});
    }
    res.json({ comment: shape(c) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Your own comment, or any comment for staff who can approve PIREPs
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const c = await pb.collection('pirep_comments').getOne(req.params.commentId, { requestKey: null }).catch(() => null);
    if (!c || c.flight !== req.params.id) return res.status(404).json({ error: 'Comment not found' });
    if (c.user !== req.user.id && !(await canStaff(req.user, 'pireps.approve'))) return res.status(403).json({ error: 'Not your comment' });
    await pb.collection('pirep_comments').delete(c.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
module.exports.addComment = addComment;
