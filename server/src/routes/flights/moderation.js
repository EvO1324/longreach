/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../../config/brand');
const { getAdminClient, adminPatch } = require('../../config/pocketbase');
const { requireAuth, requireAdmin, requirePermission } = require('../../middleware/auth');
const { notifyUser } = require('../push');
const { logAction } = require('../../utils/audit');
const { escFilterValue } = require('../../utils/pbFilter');
const { matchChallengeOnApproval } = require('../challenges');
const dailyStats = require('../../utils/dailyStats');
const { resolveActivityWarning } = require('../../jobs/activityCheck');
const { tryAutoApprove } = require('../../services/pirepAutoApprove');
const { updateUserStats, updateVaStats, checkRankUp } = require('../../services/pirepStats');
const { invalidateCache } = require('./_cache');
const { returnGift, reclaimGift } = require('../../services/giftMultipliers');

const router = express.Router();

router.post('/:id/retry-auto-approve', requirePermission('pireps.approve'), async (req, res) => {
  try {
    const pb     = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, {
      expand: 'user', requestKey: null,
    });

    if (flight.status === 'rejected') {
      return res.status(400).json({ error: 'Cannot retry a rejected PIREP' });
    }

    const user       = flight.expand?.user || await pb.collection('users').getOne(flight.user, { requestKey: null });
    const autoResult = await tryAutoApprove(pb, flight, user);
    const pbUrl      = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

    await fetch(`${pbUrl}/api/collections/flights/records/${flight.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
      body: JSON.stringify({ auto_approve_result: JSON.stringify(autoResult) }),
    }).catch(() => {});

    if (autoResult.matched) {
      // Only update status + stats if not already approved (avoid double-counting)
      if (flight.status !== 'approved') {
        await fetch(`${pbUrl}/api/collections/flights/records/${flight.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
          body: JSON.stringify({
            status: 'approved',
            auto_approved: true,
            fuel_used_kg:  autoResult.fuelUsedKg   ?? null,
            landing_stats: autoResult.landingStats?.length ? JSON.stringify(autoResult.landingStats) : null,
          }),
        });

        // flight_time is already multiplied at submission time
        const oldHours = user.total_hours || 0;
        const newHours = parseFloat((oldHours + (flight.flight_time || 0)).toFixed(4));
        await updateUserStats(pb, flight.user, (user.total_flights || 0) + 1, newHours);
        checkRankUp(pb, flight.user, oldHours, newHours).catch(() => {});

        const hasMult = !!(flight.multiplier_value && flight.multiplier_value > 1);
        updateVaStats(pb, {
          total_flights: 1,
          total_hours: flight.flight_time || 0,
          total_distance_nm: flight.distance_nm || 0,
          total_approved_pireps: 1,
          total_auto_approved: 1,
          total_multiplied_flights: hasMult ? 1 : 0,
          total_multiplied_hours: hasMult ? (flight.flight_time || 0) : 0,
        }).catch(() => {});
        dailyStats.recordFlight(pb, {
          date: flight.date, flightTime: flight.flight_time || 0, autoApproved: true,
          multiplied: hasMult, departureIcao: flight.departure_icao, arrivalIcao: flight.arrival_icao,
          aircraft: flight.aircraft, userId: flight.user,
        }).catch(err => console.error('[daily_stats] record failed:', err.message));

        if (user.activity_warned_at) {
          adminPatch(flight.user, { activity_warned_at: null, activity_thread_id: null }).catch(() => {});
          resolveActivityWarning(user).catch(() => {});
        }

        notifyUser(flight.user, {
          title: '✅ PIREP Auto-Approved',
          body: `Your flight ${flight.flight_number || ''} was verified via Infinite Flight!`,
          url: '/logbook',
          icon: brand.appIcon,
        }).catch(() => {});
      } else {
        await fetch(`${pbUrl}/api/collections/flights/records/${flight.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
          body: JSON.stringify({ auto_approved: true }),
        });
      }

      logAction(req.user, 'pirep.auto_approved_retry',
        { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
        { flight_number: flight.flight_number, pilot: `${user.first_name} ${user.last_name}` }
      );

      // Credit challenge leg if this was a fresh approval (fire and forget)
      if (flight.status !== 'approved') {
        matchChallengeOnApproval(pb, { ...flight, status: 'approved' }).catch(err =>
          console.error('[challenges] matchChallengeOnApproval failed:', err.message)
        );
      }

      return res.json({ matched: true, approved: true, autoResult });
    }

    logAction(req.user, 'pirep.retry_no_match',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { reason: autoResult.reason }
    );

    res.json({ matched: false, approved: false, autoResult });
  } catch (err) {
    console.error('[flights/retry-auto-approve]', err);
    res.status(500).json({ error: 'Retry failed', detail: err.message });
  }
});

// PATCH /api/flights/:id/approve
router.patch('/:id/approve', requirePermission('pireps.approve'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { requestKey: null });

    if (flight.status === 'rejected') {
      return res.status(400).json({ error: 'Cannot approve a rejected PIREP' });
    }
    if (flight.status === 'approved') {
      return res.status(400).json({ error: 'PIREP is already approved' });
    }

    await pb.collection('flights').update(req.params.id, { status: 'approved' });
    invalidateCache('flights-pending');

    // flight_time is already multiplied at submission time
    const user = await pb.collection('users').getOne(flight.user, { requestKey: null });
    const oldHours = user.total_hours || 0;
    const newHours = parseFloat((oldHours + (flight.flight_time || 0)).toFixed(4));
    await updateUserStats(pb, flight.user, (user.total_flights || 0) + 1, newHours);

    // Update va_stats
    const hasMultManual = parseFloat(flight.multiplier_value) > 1;
    updateVaStats(pb, {
      total_flights: 1,
      total_hours: flight.flight_time || 0,
      total_distance_nm: flight.distance_nm || 0,
      total_approved_pireps: 1,
      total_auto_approved: 0,
      total_multiplied_flights: hasMultManual ? 1 : 0,
      total_multiplied_hours: hasMultManual ? (flight.flight_time || 0) : 0,
    }).catch(() => {});
    dailyStats.recordFlight(pb, {
      date: flight.date, flightTime: flight.flight_time || 0, autoApproved: false,
      multiplied: hasMultManual, departureIcao: flight.departure_icao, arrivalIcao: flight.arrival_icao,
      aircraft: flight.aircraft, userId: flight.user,
    }).catch(err => console.error('[daily_stats] record failed:', err.message));

    if (user.activity_warned_at) {
      adminPatch(flight.user, { activity_warned_at: null, activity_thread_id: null }).catch(() => {});
      resolveActivityWarning(user).catch(() => {});
    }

    checkRankUp(pb, flight.user, oldHours, newHours).catch(() => {});

    // Update career stats if this is a career flight
    if (flight.is_career && user.career_active) {
      const careerFlights = (user.career_total_flights || 0) + 1;
      const careerHours   = parseFloat(((user.career_total_hours || 0) + (flight.flight_time || 0)).toFixed(4));
      const careerPatch = {
        career_total_flights: careerFlights,
        career_total_hours:   careerHours,
        career_current_icao:  flight.arrival_icao?.toUpperCase() || user.career_current_icao,
      };
      if (flight.is_ferry) careerPatch.career_last_ferry_at = new Date().toISOString();
      adminPatch(flight.user, careerPatch).catch(err => console.error('[career] stats update failed:', err.message));
      console.log(`[career] ${user.first_name} ${user.last_name}: position → ${flight.arrival_icao}, ${careerFlights} flights, ${careerHours}h${flight.is_ferry ? ' (ferry)' : ''}`);
    }

    notifyUser(flight.user, {
      title: '✅ PIREP Approved',
      body: `Your flight ${flight.flight_number || ''} has been approved!`,
      url: '/logbook',
      icon: brand.appIcon,
    }).catch(err => console.error('[push] notify failed:', err.message));

    // Credit challenge leg if applicable (fire and forget)
    matchChallengeOnApproval(pb, { ...flight, status: 'approved' }).catch(err =>
      console.error('[challenges] matchChallengeOnApproval failed:', err.message)
    );

    res.json({ message: 'PIREP approved' });
    logAction(req.user, 'pirep.approved',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { flight_number: flight.flight_number, pilot: `${user.first_name} ${user.last_name}` }
    );
  } catch (err) {
    console.error('[flights/approve]', err);
    res.status(500).json({ error: 'Failed to approve PIREP' });
  }
});

// PATCH /api/flights/:id/reject
router.patch('/:id/reject', requirePermission('pireps.reject'), async (req, res) => {
  try {
    const { reason } = req.body;
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { requestKey: null });

    if (flight.status === 'approved') {
      return res.status(400).json({ error: 'Cannot reject an already-approved PIREP. Use admin-update to change status.' });
    }
    if (flight.status === 'rejected') {
      return res.status(400).json({ error: 'PIREP is already rejected.' });
    }

    await pb.collection('flights').update(req.params.id, {
      status:               'rejected',
      notes:                reason || 'Rejected by admin',
      rejection_note:       reason || '',
      rejection_note_read:  false,
    });
    invalidateCache('flights-pending');
    returnGift(pb, flight); // a gifted multiplier shouldn't be lost to a rejected PIREP
    dailyStats.recordRejection(pb, flight.date).catch(err => console.error('[daily_stats] record failed:', err.message));

    notifyUser(flight.user, {
      title: '❌ PIREP Rejected',
      body: reason ? `Your PIREP was rejected: ${reason}` : 'Your PIREP was rejected. Check your logbook for details.',
      url: '/logbook',
      icon: brand.appIcon,
    }).catch(err => console.error('[push] notify failed:', err.message));

    res.json({ message: 'PIREP rejected' });
    logAction(req.user, 'pirep.rejected',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { flight_number: flight.flight_number, reason: reason || '' }
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject PIREP' });
  }
});

router.get('/:id', requirePermission('pireps.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { expand: 'user', requestKey: null });
    res.json({ flight });
  } catch (err) {
    res.status(404).json({ error: 'Flight not found' });
  }
});

router.patch('/:id/admin-update', requirePermission('pireps.approve'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { flight_number, departure_icao, arrival_icao, aircraft, flight_time, date, notes, status } = req.body;
    const updates = {};
    if (flight_number  !== undefined) updates.flight_number  = flight_number;
    if (departure_icao !== undefined) updates.departure_icao = departure_icao;
    if (arrival_icao   !== undefined) updates.arrival_icao   = arrival_icao;
    if (aircraft       !== undefined) updates.aircraft       = aircraft;
    if (flight_time    !== undefined) updates.flight_time    = parseFloat(flight_time);
    if (date           !== undefined) updates.date           = date;
    if (notes          !== undefined) updates.notes          = notes;
    if (status         !== undefined) updates.status         = status;
    const flight = await pb.collection('flights').update(req.params.id, updates, { requestKey: null });
    logAction(req.user, 'pirep.edited',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { flight_number: flight.flight_number, fields: Object.keys(updates).join(', ') }
    );
    res.json({ flight });
  } catch (err) {
    console.error('[flights/admin-update]', err.message);
    res.status(500).json({ error: 'Failed to update PIREP' });
  }
});

router.patch('/:id/approve-rejected', requirePermission('pireps.approve'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { expand: 'user', requestKey: null });

    if (flight.status !== 'rejected') {
      return res.status(400).json({ error: 'PIREP is not rejected — use the standard approve action.' });
    }

    const user = flight.expand?.user || await pb.collection('users').getOne(flight.user, { requestKey: null });

    // Credit the hours and flight count
    const oldHours   = parseFloat((user.total_hours || 0).toFixed(4));
    const oldFlights = user.total_flights || 0;
    const flightHours = parseFloat(flight.flight_time || 0);
    const newHours   = parseFloat((oldHours + flightHours).toFixed(4));
    const newFlights = oldFlights + 1;

    await updateUserStats(pb, flight.user, newFlights, newHours);

    // Career stats if applicable
    if (flight.is_career && user.career_active) {
      const careerHours   = parseFloat(((user.career_total_hours   || 0) + flightHours).toFixed(4));
      const careerFlights = (user.career_total_flights || 0) + 1;
      adminPatch(flight.user, {
        career_total_hours:   careerHours,
        career_total_flights: careerFlights,
        career_current_icao:  flight.arrival_icao?.toUpperCase() || user.career_current_icao,
      }).catch(() => {});
    }

    // Check rank promotion
    checkRankUp(pb, flight.user, oldHours, newHours).catch(() => {});

    if (user.activity_warned_at) {
      adminPatch(flight.user, { activity_warned_at: null, activity_thread_id: null }).catch(() => {});
      resolveActivityWarning(user).catch(() => {});
    }

    // Mark as approved
    await pb.collection('flights').update(req.params.id, {
      status:         'approved',
      rejection_note: '',
    });
    invalidateCache('flights-pending');
    reclaimGift(pb, flight);

    notifyUser(flight.user, {
      title: '✅ PIREP Approved',
      body: `Your flight ${flight.flight_number || ''} has been approved!`,
      url: '/logbook',
      icon: brand.appIcon,
    }).catch(() => {});

    logAction(req.user, 'pirep.approved_rejected',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { flight_number: flight.flight_number, hours_credited: flightHours }
    );

    res.json({ message: 'PIREP approved and hours credited', hours_credited: flightHours });
  } catch (err) {
    console.error('[flights/approve-rejected]', err.message);
    res.status(500).json({ error: 'Failed to approve rejected PIREP' });
  }
});

router.patch('/:id/reject-approved', requirePermission('pireps.approve'), async (req, res) => {
  try {
    const { reason } = req.body;
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { expand: 'user', requestKey: null });

    if (flight.status !== 'approved') {
      return res.status(400).json({ error: 'PIREP is not approved — use the standard reject action.' });
    }

    const pilot = flight.expand?.user || await pb.collection('users').getOne(flight.user, { requestKey: null });

    // Reverse the hours and flight count
    const oldHours    = parseFloat((pilot.total_hours    || 0).toFixed(4));
    const oldFlights  = pilot.total_flights || 0;
    const flightHours = parseFloat(flight.flight_time || 0);
    const newHours    = parseFloat(Math.max(0, oldHours - flightHours).toFixed(4));
    const newFlights  = Math.max(0, oldFlights - 1);

    await updateUserStats(pb, flight.user, newFlights, newHours);

    // Also reverse career hours if it was a career flight
    if (flight.is_career && pilot.career_active) {
      const careerHours   = parseFloat(Math.max(0, (pilot.career_total_hours   || 0) - flightHours).toFixed(4));
      const careerFlights = Math.max(0, (pilot.career_total_flights || 0) - 1);
      adminPatch(flight.user, { career_total_hours: careerHours, career_total_flights: careerFlights }).catch(() => {});
    }

    // Mark as rejected
    await pb.collection('flights').update(req.params.id, {
      status:              'rejected',
      rejection_note:      reason || 'Rejected by admin',
      rejection_note_read: false,
      auto_approved:       false,
    });
    invalidateCache('flights-pending');
    returnGift(pb, flight);

    // Notify pilot
    notifyUser(flight.user, {
      title: '❌ PIREP Rejected',
      body: reason ? `Your approved PIREP was reversed: ${reason}` : 'An approved PIREP was reversed by an admin. Check your logbook.',
      url: '/logbook',
      icon: brand.appIcon,
    }).catch(() => {});

    logAction(req.user, 'pirep.rejected_approved',
      { id: flight.id, name: `${flight.departure_icao}→${flight.arrival_icao}` },
      { flight_number: flight.flight_number, hours_reversed: flightHours, reason: reason || '' }
    );

    res.json({ message: 'PIREP rejected and hours reversed', hours_reversed: flightHours });
  } catch (err) {
    console.error('[flights/reject-approved]', err.message);
    res.status(500).json({ error: 'Failed to reject approved PIREP' });
  }
});

router.patch('/:id/read-rejection', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const flight = await pb.collection('flights').getOne(req.params.id, { requestKey: null });
    if (flight.user !== req.user.id) {
      return res.status(403).json({ error: 'Not your flight' });
    }
    await pb.collection('flights').update(req.params.id, { rejection_note_read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.delete('/user/:userId', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { userId } = req.params;

    // Fetch all flights for this user
    const userFlights = await pb.collection('flights').getFullList({
      filter: `user = "${escFilterValue(userId)}"`,
      fields: 'id',
      requestKey: null,
    });

    // Delete all flights
    await Promise.all(userFlights.map(f => pb.collection('flights').delete(f.id)));

    // Reset pilot stats to zero
    await adminPatch(userId, { total_flights: 0, total_hours: 0 });

    console.log(`[flights/bulk-delete] deleted ${userFlights.length} flights for user ${userId}`);
    logAction(req.user, 'pirep.bulk_deleted',
      { id: userId, name: userId },
      { count: userFlights.length }
    );
    res.json({ success: true, deleted: userFlights.length });
  } catch (err) {
    console.error('[flights/bulk-delete]', err.message);
    res.status(500).json({ error: 'Failed to delete flights' });
  }
});

module.exports = router;
