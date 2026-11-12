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
const { requireAuth } = require('../../middleware/auth');
const { notifyUser } = require('../push');
const { notifyPirepFiled } = require('../discord');
const { logAction } = require('../../utils/audit');
const { matchChallengeOnApproval } = require('../challenges');
const dailyStats = require('../../utils/dailyStats');
const { resolveActivityWarning } = require('../../jobs/activityCheck');
const { distanceBetween } = require('../../utils/airports');
const { tryAutoApprove } = require('../../services/pirepAutoApprove');
const { updateUserStats, updateVaStats, checkRankUp } = require('../../services/pirepStats');
const { invalidateCache } = require('./_cache');
const { escFilterValue } = require('../../utils/pbFilter');
const { resolveMultiplier, MultiplierError } = require('../../services/pirepMultiplier');
const { claimMultiplier, attachClaimToFlight, releaseClaim } = require('../../services/giftMultipliers');
const { getAccess, aircraftLock, isCodeshare } = require('../../services/rankAccess');
const { isRotwRoute } = require('../../services/rotwRoutes');
const { isOpenEventRoute } = require('../../services/events');
const { DEVELOPER_EMAILS } = require('../../utils/developers');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();

    const {
      flight_number, departure_icao, arrival_icao, aircraft,
      flight_time, date, notes, distance_nm, route,
      multiplier_code, multiplier_value, multiplier_name,
      multiplier_promo_id, multiplier_gift_id,
      challenge_leg_id, is_career, is_ferry, event_id,
    } = req.body;

    if (!departure_icao || !arrival_icao || !aircraft || !flight_time || !date) {
      return res.status(400).json({ error: 'Missing required fields: departure_icao, arrival_icao, aircraft, flight_time, date' });
    }

    const dupFilter = [
      `user = "${req.user.id}"`,
      `flight_number = "${escFilterValue(flight_number || '')}"`,
      `departure_icao = "${escFilterValue(departure_icao)}"`,
      `arrival_icao = "${escFilterValue(arrival_icao)}"`,
      `date = "${escFilterValue(date)}"`,
      `status = "pending"`,
    ].join(' && ');
    const duplicatePending = await pb.collection('flights').getFirstListItem(dupFilter, { requestKey: null }).catch(() => null);
    if (duplicatePending) {
      return res.status(409).json({
        error: 'A Pirep for this flight has already been submitted and is pending review, a staff member will manually review it soon.',
        code: 'duplicate_pending',
      });
    }

    // Calculate great-circle distance server-side (ignore whatever client sent)
    const calculatedDistance = distanceBetween(departure_icao, arrival_icao) || distance_nm || null;

    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    let multiplier;
    try {
      multiplier = await resolveMultiplier(pb, user, {
        multiplier_promo_id, multiplier_gift_id, multiplier_code, multiplier_value, multiplier_name,
        challenge_leg_id, event_id, departure_icao, arrival_icao,
      });
    } catch (err) {
      if (err instanceof MultiplierError) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    const bypassRank = multiplier?.rotw || !!multiplier?.eventId || !!challenge_leg_id || is_career || is_ferry
      || req.user.role === 'admin' || DEVELOPER_EMAILS.includes(req.user.email)
      || await isRotwRoute(pb, departure_icao, arrival_icao)
      || await isOpenEventRoute(pb, req.user.id, departure_icao, arrival_icao);
    if (!bypassRank) {
      const access = await getAccess(pb, user);
      if (!access.manual_pirep) {
        if (isCodeshare(flight_number) && !access.codeshares_unlocked) {
          return res.status(403).json({
            error: `Codeshare flights unlock at ${access.codeshare_unlock_rank || 'a higher rank'}.`,
            code: 'rank_locked',
          });
        }
        const needed = aircraftLock(access, aircraft);
        if (needed) {
          return res.status(403).json({
            error: `${String(aircraft).split(' - ')[0]} unlocks at ${needed}.`,
            code: 'rank_locked',
          });
        }
      }
    }

    const eventId = multiplier?.eventId || null;
    const storedAircraft = eventId ? multiplier.aircraft : aircraft;
    const storedFlightNumber = eventId ? (multiplier.flightNumber || flight_number) : flight_number;
    if (eventId && !(multiplier.value > 1)) multiplier = null;

    const rawFlightTime = parseFloat(flight_time) || 0;
    const mult = multiplier ? multiplier.value : 1;
    const creditedFlightTime = parseFloat((rawFlightTime * mult).toFixed(4));

    let claim = null;
    if (multiplier?.promoId) {
      claim = await claimMultiplier(pb, req.user.id, multiplier.promoId);
      if (!claim) return res.status(409).json({ error: "You've already used this multiplier" });
    }

    // Create as pending first
    let flight;
    try {
      flight = await pb.collection('flights').create({
        flight_number: storedFlightNumber, departure_icao, arrival_icao, aircraft: storedAircraft,
        event: eventId,
        flight_time: creditedFlightTime, date, notes, distance_nm: calculatedDistance, route,
        multiplier_code:  multiplier?.code || null,
        multiplier_value: multiplier ? multiplier.value : null,
        multiplier_name:  multiplier?.name || null,
        challenge_leg_id: challenge_leg_id || null,
        is_career: is_career || false,
        is_ferry: is_ferry || false,
        user: req.user.id,
        status: 'pending',
      });
    } catch (err) {
      // no PIREP, so the claim shouldn't stick
      if (claim) await releaseClaim(pb, claim.id);
      throw err;
    }
    invalidateCache('flights-pending');
    if (claim) await attachClaimToFlight(pb, claim.id, flight.id);

    // Attempt IF match
    const autoResult = await tryAutoApprove(pb, flight, user);
    const matched    = autoResult.matched;
    const pbUrl      = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

    await fetch(`${pbUrl}/api/collections/flights/records/${flight.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
      body: JSON.stringify({ auto_approve_result: JSON.stringify(autoResult) }),
    }).catch(() => {});

    if (matched) {
      // Update flight status via direct REST (bypasses collection rules)
      await fetch(`${pbUrl}/api/collections/flights/records/${flight.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
          status: 'approved',
          auto_approved: true,
          fuel_used_kg:  autoResult.fuelUsedKg   ?? null,
          landing_stats: autoResult.landingStats?.length ? JSON.stringify(autoResult.landingStats) : null,
        }),
      });
      invalidateCache('flights-pending');

      const oldHoursAuto = user.total_hours || 0;
      const newHoursAuto = parseFloat((oldHoursAuto + (flight.flight_time || 0)).toFixed(4));
      await updateUserStats(pb, req.user.id, (user.total_flights || 0) + 1, newHoursAuto);
      checkRankUp(pb, req.user.id, oldHoursAuto, newHoursAuto).catch(() => {});

      // Update career stats if this is a career flight
      if (flight.is_career) {
        const freshUser     = await pb.collection('users').getOne(req.user.id, { requestKey: null });
        const careerFlights = (freshUser.career_total_flights || 0) + 1;
        const careerHours   = parseFloat(((freshUser.career_total_hours || 0) + (flight.flight_time || 0)).toFixed(4));
        if (freshUser.career_active) {
          const careerPatch = {
            career_total_flights: careerFlights,
            career_total_hours:   careerHours,
            career_current_icao:  flight.arrival_icao?.toUpperCase() || freshUser.career_current_icao,
          };
          if (flight.is_ferry) careerPatch.career_last_ferry_at = new Date().toISOString();
          adminPatch(req.user.id, careerPatch).catch(err => console.error('[career] auto stats update failed:', err.message));
        }
      }

      // Update va_stats
      const hasMultAuto = parseFloat(flight.multiplier_value) > 1;
      updateVaStats(pb, {
        total_flights: 1,
        total_hours: flight.flight_time || 0,
        total_distance_nm: flight.distance_nm || 0,
        total_approved_pireps: 1,
        total_auto_approved: 1,
        total_multiplied_flights: hasMultAuto ? 1 : 0,
        total_multiplied_hours: hasMultAuto ? (flight.flight_time || 0) : 0,
      }).catch(() => {});
      dailyStats.recordFlight(pb, {
        date: flight.date, flightTime: flight.flight_time || 0, autoApproved: true,
        multiplied: hasMultAuto, departureIcao: flight.departure_icao, arrivalIcao: flight.arrival_icao,
        aircraft: flight.aircraft, userId: req.user.id,
      }).catch(err => console.error('[daily_stats] record failed:', err.message));

      if (user.activity_warned_at) {
        adminPatch(req.user.id, { activity_warned_at: null, activity_final_warned_at: null, activity_thread_id: null }).catch(() => {});
        resolveActivityWarning(user).catch(() => {});
      }

      notifyUser(req.user.id, {
        title: '✅ PIREP Auto-Approved',
        body: `Your flight ${flight.flight_number || ''} was verified via Infinite Flight!`,
        url: '/logbook',
        icon: brand.appIcon,
      }).catch(() => {});

      notifyPirepFiled({ pilot: user, flight: { ...flight, status: 'approved', flight_time: rawFlightTime }, auto_approved: true }).catch(() => {});

      // Credit challenge leg if applicable (fire and forget)
      matchChallengeOnApproval(pb, { ...flight, status: 'approved' }).catch(err =>
        console.error('[challenges] matchChallengeOnApproval failed:', err.message)
      );

      return res.status(201).json({
        flight: {
          ...flight,
          status: 'approved',
          auto_approved: true,
          fuel_used_kg:  autoResult.fuelUsedKg ?? null,
          landing_stats: autoResult.landingStats?.length ? autoResult.landingStats : null,
        },
        auto_approved: true,
      });
    }

    notifyPirepFiled({ pilot: user, flight: { ...flight, flight_time: rawFlightTime }, auto_approved: false, checks: autoResult.checks }).catch(() => {});
    res.status(201).json({ flight, auto_approved: false });
  } catch (err) {
    console.error('[flights/create]', err);
    res.status(500).json({ error: 'Failed to submit PIREP' });
  }
});

router.post('/atc', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { airport_icao, session_id, total_time_mins, date } = req.body;

    if (!airport_icao || !total_time_mins) {
      return res.status(400).json({ error: 'airport_icao and total_time_mins are required' });
    }

    const totalHours = parseFloat((total_time_mins / 60).toFixed(4));
    const sessionDate = date || new Date().toISOString().slice(0, 10);

    const flight = await pb.collection('flights').create({
      user:           req.user.id,
      departure_icao: airport_icao.toUpperCase(),
      arrival_icao:   airport_icao.toUpperCase(),
      flight_number:  'ATC',
      aircraft:       'ATC Session',
      flight_time:    totalHours,
      date:           sessionDate,
      notes:          `ATC Session — IF Session ID: ${session_id || 'N/A'}`,
      is_atc:         true,
      status:         'approved',
    });

    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    const newAtcHours = parseFloat(((user.atc_hours || 0) + totalHours).toFixed(4));
    await adminPatch(req.user.id, { atc_hours: newAtcHours });

    // Still count as a flight for VA stats tracking purposes
    updateVaStats(pb, { total_flights: 1, total_hours: 0, total_approved_pireps: 1, total_auto_approved: 1 }).catch(() => {});
    dailyStats.recordFlight(pb, {
      date: sessionDate, flightTime: 0, autoApproved: true, multiplied: false,
      departureIcao: airport_icao.toUpperCase(), arrivalIcao: airport_icao.toUpperCase(),
      aircraft: 'ATC Session', userId: req.user.id,
    }).catch(err => console.error('[daily_stats] record failed:', err.message));

    logAction(req.user, 'atc.filed', { id: flight.id, airport: airport_icao, hours: totalHours }, {});
    res.status(201).json({ flight });
  } catch (err) {
    console.error('[atc/submit]', err.message);
    res.status(500).json({ error: 'Failed to submit ATC session' });
  }
});

router.post('/preview-match', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { departure_icao, arrival_icao, aircraft, date } = req.body;
    if (!departure_icao || !arrival_icao || !aircraft) {
      return res.json({ checked: false, reason: 'incomplete' });
    }
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    const flightDate = date || new Date().toISOString().slice(0, 10);
    const fakeFlight = { departure_icao, arrival_icao, aircraft, date: flightDate, flight_number: '', flight_time: null, multiplier_value: 1 };
    const result = await tryAutoApprove(pb, fakeFlight, user);
    res.json({ checked: true, matched: result.matched, reason: result.reason, checks: result.checks, bestCandidate: result.bestCandidate });
  } catch (err) {
    console.error('[preview-match]', err.message);
    res.json({ checked: false, reason: 'error' });
  }
});

module.exports = router;
