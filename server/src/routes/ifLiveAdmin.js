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
const { logAction } = require('../utils/audit');
const {
  getServiceUserIdForOrg, ifLiveWrite, ifLiveRequest, invalidateAircraftSchedulesCache, fleetStatus,
  schedulePayloadForLeg, deadlineForLeg, isTimelessLeg, createLiveSchedulesForBid,
  applyCrewToLegs, CREW_ROLE_CAPTAIN, ALLOWED_ORG_IDS, MAX_BOOKINGS_PER_PILOT,
} = require('./ifLive');
const { notifyBookingCreated, notifyLegAbandoned } = require('./discord');
const { lookupAirport, nearestAirport } = require('../utils/airports');
const liveAircraftAdmin = require('../services/liveAircraftAdmin');
const { scheduleIfLiveNoShow } = require('../jobs/ifLiveNoShow');
const { scheduleIfLiveAutoPirep } = require('../jobs/ifLiveAutoPirep');
const { scheduleIfLiveBidExpiry } = require('../jobs/ifLiveBidExpiry');
const { scheduleIfLiveTimeWarning } = require('../jobs/ifLiveTimeWarning');
const { scheduleIfLiveAircraftStatus } = require('../jobs/ifLiveAircraftStatus');

const router = express.Router();
router.use(requireAdmin);

const HOUR = 60 * 60 * 1000;
// Legs given a stand-in schedule id by hand (no real IF schedule exists).
const MANUAL_SCHEDULE_PREFIX = 'manual-';

const esc = v => String(v ?? '').replace(/["\\]/g, '');
const isOpen = l => !l.pirepId && !l.expired;
const isRealSchedule = id => !!id && !String(id).startsWith(MANUAL_SCHEDULE_PREFIX);
const ms = v => (v ? new Date(String(v).replace(' ', 'T')).getTime() : NaN);
const legStart = (l, bid) => ms(l.holdStartUtc) || ms(l.departureUtc) || ms(bid.created);
const routeOf = l => `${l.flightNumber ? `${l.flightNumber} ` : ''}${l.originIcao} to ${l.destIcao}`;
const pilotName = p => (p ? (p.callsign || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown') : 'Unknown');
const target = bid => ({ id: bid.id, name: `${bid.aircraft_registration || 'Aircraft'} ${bid.expand?.pilot ? pilotName(bid.expand.pilot) : ''}`.trim() });

const orgId = () => ALLOWED_ORG_IDS[0] || null;

async function loadBid(pb, id) {
  return pb.collection('if_live_bids').getOne(id, { expand: 'pilot', requestKey: null });
}

function legAt(bid, index) {
  const i = Number(index);
  const legs = bid.legs || [];
  if (!Number.isInteger(i) || i < 0 || i >= legs.length) {
    const err = new Error('No such leg on this booking');
    err.status = 404;
    throw err;
  }
  return { i, legs: legs.map(l => ({ ...l })) };
}

async function createLegSchedule(bid, leg, { withoutFlightPlan = false, captainIfUserId } = {}) {
  const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
  if (!serviceUserId) throw bad('No connected Infinite Flight account is set for the organization', 503);
  const payload = schedulePayloadForLeg(leg);
  if (withoutFlightPlan) delete payload.flightPlan;
  const schedule = await ifLiveWrite(serviceUserId, 'POST', `/live/aircraft/${encodeURIComponent(bid.aircraft_id)}/schedules`, payload);
  leg.ifScheduleId = schedule.id;
  invalidateAircraftSchedulesCache(bid.aircraft_id);
  const warnings = [];
  const captain = captainIfUserId || bid.expand?.pilot?.if_user_id;
  if (captain) {
    await applyCrewToLegs(serviceUserId, [leg], captain, CREW_ROLE_CAPTAIN)
      .catch(e => warnings.push(`The pilot couldn't be added as Captain: ${e.message}`));
  }
  return { scheduleId: schedule.id, warnings };
}

function fail(res, err) {
  res.status(err.status || 500).json({ error: err.message });
}

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function serialize(bid) {
  const p = bid.expand?.pilot;
  return {
    id: bid.id,
    status: bid.status,
    created: bid.created,
    updated: bid.updated,
    aircraftId: bid.aircraft_id,
    registration: bid.aircraft_registration,
    note: bid.review_note || '',
    pilot: p ? { id: p.id, name: pilotName(p), firstName: p.first_name || '', ifLinked: !!p.if_user_id } : null,
    legs: (bid.legs || []).map((l, i) => {
      const { flightPlan, ...rest } = l;
      return { ...rest, index: i, hasFlightPlan: !!flightPlan, manualSchedule: !!l.ifScheduleId && !isRealSchedule(l.ifScheduleId) };
    }),
  };
}

function findIssues(bids, recentFlights, now) {
  const issues = [];
  const add = (kind, bid, legIndex, title, detail, actions, extra = {}) =>
    issues.push({ kind, bidId: bid.id, legIndex, title, detail, actions, ...extra });

  const active = bids.filter(b => b.status === 'active');

  for (const bid of bids.filter(b => b.status === 'pending')) {
    const hours = Math.max(0, Math.round((now - ms(bid.created)) / HOUR));
    const hasPlan = (bid.legs || []).some(l => l.flightPlan);
    add('pending', bid, null,
      `${bid.aircraft_registration} ${routeOf((bid.legs || [])[0] || {})} | ${pilotName(bid.expand?.pilot)}`,
      `Pending for ${hours}h. The Infinite Flight schedule was never created${bid.review_note ? `: ${bid.review_note.replace(/^Schedule failed:\s*/, '')}` : '.'}`,
      [hasPlan ? 'retry_no_plan' : null, 'retry', 'cancel'].filter(Boolean));
  }

  for (const bid of active) {
    const legs = bid.legs || [];
    if (!legs.some(isOpen)) {
      add('stuck', bid, null,
        `${bid.aircraft_registration} | ${pilotName(bid.expand?.pilot)}`,
        'Every leg is filed or cancelled, but the booking is still active, so the aircraft looks booked.',
        ['close']);
      continue;
    }
    legs.forEach((l, i) => {
      if (!isOpen(l)) return;
      if (!l.ifScheduleId) {
        add('no_schedule', bid, i,
          `${bid.aircraft_registration} ${routeOf(l)} | ${pilotName(bid.expand?.pilot)}`,
          'No Infinite Flight schedule, so landings on this leg are never detected and it can\'t be filed from the booking.',
          [l.flightPlan ? 'schedule_no_plan' : null, 'schedule', 'cancel_leg'].filter(Boolean));
      }
      if (l.landedPromptAt && now - ms(l.landedPromptAt) > 3 * HOUR) {
        const hrs = Math.round((now - ms(l.landedPromptAt)) / HOUR);
        add('prompt_unfiled', bid, i,
          `${bid.aircraft_registration} ${routeOf(l)} | ${pilotName(bid.expand?.pilot)}`,
          `Landing message posted ${hrs}h ago and the PIREP still isn't filed.`,
          ['link_pirep']);
      }
    });
  }

  const byAircraft = new Map();
  for (const bid of active) {
    const open = (bid.legs || []).map((l, i) => ({ l, i })).filter(x => isOpen(x.l));
    if (!open.length) continue;
    const list = byAircraft.get(bid.aircraft_id) || [];
    list.push({ bid, first: open[0], start: legStart(open[0].l, bid) });
    byAircraft.set(bid.aircraft_id, list);
  }
  for (const list of byAircraft.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.start - b.start);
    for (let k = 1; k < list.length; k++) {
      const { bid, first } = list[k];
      if (!first.l.startedAt) continue;
      const ahead = list[0].bid;
      const samePilot = ahead.pilot === bid.pilot;
      add('started_early', bid, first.i,
        `${bid.aircraft_registration} ${routeOf(first.l)} | ${pilotName(bid.expand?.pilot)}`,
        `Marked started while ${routeOf((ahead.legs || []).find(isOpen) || {})} on an earlier booking is still open. The earlier flight started it.`,
        [samePilot ? 'merge' : null, 'clear_start'].filter(Boolean),
        samePilot ? { mergeInto: ahead.id } : {});
    }
  }

  // PIREPs filed outside Live for a route that's open on the pilot's booking
  const used = new Set(bids.flatMap(b => (b.legs || []).map(l => l.pirepId).filter(Boolean)));
  for (const bid of active) {
    (bid.legs || []).forEach((l, i) => {
      if (!isOpen(l) || !(l.startedAt || l.landedPromptAt)) return;
      const since = ms(l.startedAt || l.landedPromptAt) - 12 * HOUR;
      const match = recentFlights.find(f => f.user === bid.pilot && !f.is_live && !used.has(f.id)
        && f.departure_icao === l.originIcao && f.arrival_icao === l.destIcao && ms(f.created) >= since);
      if (!match) return;
      used.add(match.id);
      add('pirep_outside', bid, i,
        `${bid.aircraft_registration} ${routeOf(l)} | ${pilotName(bid.expand?.pilot)}`,
        `PIREP filed with the normal form (${Number(match.flight_time || 0).toFixed(1)}h, ${match.status}). It isn't counted in Live totals until it's linked.`,
        ['link_pirep'], { flightId: match.id });
    });
  }

  return issues;
}

function jobInfo() {
  const jobs = [
    ['No-show and start check', scheduleIfLiveNoShow, 5],
    ['Landing check', scheduleIfLiveAutoPirep, 5],
    ['Hold expiry', scheduleIfLiveBidExpiry, 15],
    ['Time warnings', scheduleIfLiveTimeWarning, 5],
    ['Aircraft status', scheduleIfLiveAircraftStatus, 60],
  ];
  const now = Date.now();
  return jobs.map(([name, fn, everyMin]) => {
    const last = fn._lastRun || null;
    // Late when it's missed two runs in a row
    const late = !last || now - ms(last) > everyMin * 2 * 60 * 1000 + 60 * 1000;
    return { name, everyMinutes: everyMin, lastRun: last, nextRun: fn._nextRun || null, late };
  });
}

// GET /overview
router.get('/overview', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const now = Date.now();
    const org = orgId();
    const since = new Date(now - 14 * 24 * HOUR).toISOString().replace('T', ' ');
    const orgClause = org ? ` && organization_id = "${esc(org)}"` : '';

    const [bids, flights, serviceUserId] = await Promise.all([
      pb.collection('if_live_bids').getFullList({
        filter: `(status = "active" || status = "pending")${orgClause}`, expand: 'pilot', sort: 'created', requestKey: null,
      }),
      pb.collection('flights').getFullList({
        filter: `created >= "${since}" && is_live != true`,
        fields: 'id,user,departure_icao,arrival_icao,flight_time,status,is_live,created', requestKey: null,
      }),
      org ? getServiceUserIdForOrg(org).catch(() => null) : null,
    ]);

    let fleet = null;
    let fleetError = null;
    if (org && serviceUserId) {
      try { fleet = await fleetStatus(org); } catch (err) { fleetError = err.message; }
    }

    const busy = new Set(bids.filter(b => b.status === 'pending' || (b.legs || []).some(isOpen)).map(b => b.aircraft_id));
    const flyingIds = new Set();
    for (const b of bids) for (const l of b.legs || []) if (isOpen(l) && l.startedAt && !l.landedPromptAt) flyingIds.add(b.aircraft_id);
    for (const ac of fleet || []) if (ac.live && !ac.live.onGround) flyingIds.add(ac.id);

    const landedUnfiled = bids.flatMap(b => (b.legs || []).filter(l => isOpen(l) && l.landedPromptAt)).length;
    const abandoned = await findAbandoned(pb, now).catch(() => []);
    const issues = [
      // Only the ones still to act on: an aircraft that's flown since can't be finished
      ...abandoned.filter(a => !a.where.movedOn).map(a => ({
        kind: 'abandoned', bidId: a.bidId, legIndex: a.legIndex,
        title: `${a.registration} ${routeOf(a.leg)} | ${a.pilot?.name || 'Unknown'}`,
        detail: `Abandoned: started ${new Date(ms(a.leg.startedAt)).toISOString().slice(11, 16)}Z, the window expired with no PIREP and the aircraft was freed. ${a.where.text}${a.where.lastSeen ? `, last seen ${new Date(ms(a.where.lastSeen)).toISOString().slice(11, 16)}Z` : ''}.`,
        actions: ['open_abandoned'],
      })),
      ...findIssues(bids, flights, now),
    ];

    res.json({
      now: new Date(now).toISOString(),
      connection: {
        orgId: org,
        connected: !!serviceUserId,
        reachable: fleet !== null,
        error: !org ? 'No Live organization is configured (IF_LIVE_ORG_ID)' : !serviceUserId ? 'No connected Infinite Flight account is set for the organization' : fleetError,
      },
      counts: {
        aircraft: fleet ? fleet.length : null,
        flying: flyingIds.size,
        booked: busy.size,
        free: fleet ? fleet.filter(ac => !busy.has(ac.id)).length : null,
        pending: bids.filter(b => b.status === 'pending').length,
        landedUnfiled,
        abandoned: abandoned.filter(a => !a.where.movedOn).length,
      },
      jobs: jobInfo(),
      issues,
      bookings: bids.map(serialize),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/bids/:id/legs/:i', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (!isOpen(leg)) throw bad('This leg is already filed or cancelled');

    const before = { holdStartUtc: leg.holdStartUtc || null, deadlineUtc: leg.deadlineUtc || null, startedAt: leg.startedAt || null };
    const { holdStartUtc, deadlineUtc, clearStarted } = req.body || {};
    for (const [key, value] of Object.entries({ holdStartUtc, deadlineUtc })) {
      if (value === undefined) continue;
      if (Number.isNaN(Date.parse(value))) throw bad(`${key} isn't a valid time`);
      leg[key] = new Date(value).toISOString();
    }
    if (ms(leg.deadlineUtc) <= ms(leg.holdStartUtc)) throw bad('The deadline has to be after the hold starts');
    if (clearStarted) {
      delete leg.startedAt;
      delete leg.windowStartUtc;
    } else if (holdStartUtc !== undefined && !leg.startedAt) {
      // The start window opens again from the new hold
      delete leg.windowStartUtc;
    }

    const updated = await pb.collection('if_live_bids').update(bid.id, { legs });
    const after = { holdStartUtc: leg.holdStartUtc || null, deadlineUtc: leg.deadlineUtc || null, startedAt: leg.startedAt || null };
    await logAction(req.user, 'if_live.leg_edited', target(bid), { leg: i, route: routeOf(leg), before, after });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/retry  { withoutFlightPlan? } (pending bookings)
router.post('/bids/:id/retry', async (req, res) => {
  const pb = await getAdminClient();
  let bid;
  try {
    bid = await loadBid(pb, req.params.id);
    if (bid.status !== 'pending') throw bad(`This booking is ${bid.status}, not pending`);
    const withoutPlan = !!req.body?.withoutFlightPlan;
    const legs = (bid.legs || []).map(l => {
      const copy = { ...l };
      if (withoutPlan) delete copy.flightPlan;
      return copy;
    });
    const { legs: created, crewWarnings } = await createLiveSchedulesForBid({
      organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs, crew: bid.crew || [],
      captain: { ifUserId: bid.expand?.pilot?.if_user_id },
    });
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs: created, status: 'active', review_note: '' });
    await logAction(req.user, 'if_live.schedule_retried', target(bid), { withoutFlightPlan: withoutPlan, result: 'active' });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }), warnings: crewWarnings });
  } catch (err) {
    // Keep the newest reason on the booking
    if (bid?.status === 'pending') {
      pb.collection('if_live_bids').update(bid.id, { review_note: `Schedule failed: ${err.message}`.slice(0, 500) }).catch(() => {});
      logAction(req.user, 'if_live.schedule_retried', target(bid), { withoutFlightPlan: !!req.body?.withoutFlightPlan, result: 'failed', error: err.message });
    }
    fail(res, err);
  }
});

// POST /bids/:id/legs/:i/schedule  { withoutFlightPlan? } (one leg with no schedule)
router.post('/bids/:id/legs/:i/schedule', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    if (bid.status !== 'active') throw bad('Use Retry for a pending booking');
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (!isOpen(leg)) throw bad('This leg is already filed or cancelled');
    if (isRealSchedule(leg.ifScheduleId)) throw bad('This leg already has an Infinite Flight schedule');

    const { scheduleId, warnings } = await createLegSchedule(bid, leg, { withoutFlightPlan: !!req.body?.withoutFlightPlan });
    if (!leg.holdStartUtc) leg.holdStartUtc = new Date().toISOString();
    if (!leg.deadlineUtc) leg.deadlineUtc = deadlineForLeg(leg, i, ms(leg.holdStartUtc), i > 0 ? legs[i - 1].deadlineUtc : null);
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs });
    await logAction(req.user, 'if_live.leg_scheduled', target(bid), { leg: i, route: routeOf(leg), scheduleId, withoutFlightPlan: !!req.body?.withoutFlightPlan });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }), warnings });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/legs/:i/link-pirep  { flightId }
router.post('/bids/:id/legs/:i/link-pirep', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (leg.pirepId) throw bad('This leg already has a PIREP');
    if (leg.expired) throw bad('This leg was cancelled');
    const flight = await pb.collection('flights').getOne(String(req.body?.flightId || ''), { requestKey: null })
      .catch(() => { throw bad('PIREP not found', 404); });
    if (flight.user !== bid.pilot) throw bad("That PIREP belongs to a different pilot");
    const other = await pb.collection('if_live_bids').getFullList({ filter: `pilot = "${esc(bid.pilot)}"`, requestKey: null });
    if (other.some(b => (b.legs || []).some(l => l.pirepId === flight.id))) throw bad('That PIREP is already linked to a Live leg');

    const now = new Date().toISOString();
    Object.assign(leg, { pirepId: flight.id, pirepFlightTime: Number(flight.flight_time) || 0, loggedAt: now, releasedAtUtc: now, linkedByAdmin: true });
    const allDone = legs.every(l => l.pirepId || l.expired);
    await pb.collection('flights').update(flight.id, { is_live: true });
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, ...(allDone ? { status: 'completed' } : {}) });
    await logAction(req.user, 'if_live.pirep_linked', target(bid), { leg: i, route: routeOf(leg), flightId: flight.id, hours: leg.pirepFlightTime });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/legs/:i/unlink-pirep
router.post('/bids/:id/legs/:i/unlink-pirep', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (!leg.pirepId) throw bad('This leg has no PIREP linked');
    const flightId = leg.pirepId;
    for (const k of ['pirepId', 'pirepFlightTime', 'loggedAt', 'releasedAtUtc', 'matchedFlightCreated', 'linkedByAdmin']) delete leg[k];
    await pb.collection('flights').update(flightId, { is_live: false }).catch(() => {});
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, ...(bid.status === 'completed' ? { status: 'active' } : {}) });
    await logAction(req.user, 'if_live.pirep_unlinked', target(bid), { leg: i, route: routeOf(leg), flightId });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

async function deleteSchedules(bid, legs) {
  const ids = legs.map(l => l.ifScheduleId).filter(isRealSchedule);
  if (!ids.length) return;
  const serviceUserId = await getServiceUserIdForOrg(bid.organization_id).catch(() => null);
  if (!serviceUserId) return;
  await Promise.allSettled(ids.map(id => ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(id)}`)));
  invalidateAircraftSchedulesCache(bid.aircraft_id);
}

// POST /bids/:id/legs/:i/cancel
router.post('/bids/:id/legs/:i/cancel', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (!isOpen(leg)) throw bad('This leg is already filed or cancelled');
    await deleteSchedules(bid, [leg]);
    leg.expired = true;
    leg.cancelledByAdmin = true;
    const allDone = legs.every(l => l.pirepId || l.expired);
    const status = allDone ? (legs.some(l => l.pirepId) ? 'completed' : 'cancelled') : bid.status;
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status });
    await logAction(req.user, 'if_live.leg_cancelled', target(bid), { leg: i, route: routeOf(leg) });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/bids/:id/merge', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const from = await loadBid(pb, req.params.id);
    const into = await loadBid(pb, String(req.body?.intoBidId || ''));
    if (from.id === into.id) throw bad("A booking can't be merged into itself");
    if (from.pilot !== into.pilot || from.aircraft_id !== into.aircraft_id) throw bad('Only bookings for the same pilot and aircraft can be merged');
    if (from.status !== 'active' || into.status !== 'active') throw bad('Both bookings have to be active');

    const moving = (from.legs || []).filter(isOpen).map(l => {
      const copy = { ...l };
      delete copy.startedAt;
      delete copy.windowStartUtc;
      return copy;
    });
    if (!moving.length) throw bad('This booking has no open legs to move');
    const intoLegs = (into.legs || []).map(l => ({ ...l }));
    const lastOpen = [...intoLegs].reverse().find(isOpen);
    let prevDeadline = lastOpen?.deadlineUtc || null;
    for (const leg of moving) {
      if (prevDeadline && isTimelessLeg(leg) && ms(leg.holdStartUtc || 0) < ms(prevDeadline)) {
        leg.holdStartUtc = prevDeadline;
        leg.deadlineUtc = deadlineForLeg(leg, 1, Date.now(), prevDeadline);
      }
      prevDeadline = leg.deadlineUtc;
    }

    const fromLegs = (from.legs || []).filter(l => !isOpen(l));
    const updated = await pb.collection('if_live_bids').update(into.id, { legs: [...intoLegs, ...moving], status: 'active' });
    await pb.collection('if_live_bids').update(from.id, {
      legs: fromLegs.length ? fromLegs : from.legs,
      status: fromLegs.some(l => l.pirepId) ? 'completed' : 'cancelled',
      review_note: `Merged into booking ${into.id}`,
    });
    await logAction(req.user, 'if_live.bookings_merged', target(into), { from: from.id, legs: moving.map(routeOf) });
    await logAction(req.user, 'if_live.bookings_merged', target(from), { into: into.id, legs: moving.map(routeOf) });
    res.json({ booking: serialize({ ...updated, expand: into.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/close
router.post('/bids/:id/close', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    if ((bid.legs || []).some(isOpen)) throw bad('This booking still has open legs. Cancel them or the booking instead.');
    const status = (bid.legs || []).some(l => l.pirepId) ? 'completed' : 'cancelled';
    const updated = await pb.collection('if_live_bids').update(bid.id, { status });
    await logAction(req.user, 'if_live.booking_closed', target(bid), { status });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/cancel
router.post('/bids/:id/cancel', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    if (!['active', 'pending'].includes(bid.status)) throw bad(`This booking is already ${bid.status}`);
    const legs = (bid.legs || []).map(l => ({ ...l }));
    const open = legs.filter(isOpen);
    await deleteSchedules(bid, open);
    for (const l of open) { l.expired = true; l.cancelledByAdmin = true; }
    const status = legs.some(l => l.pirepId) ? 'completed' : 'cancelled';
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status });
    await logAction(req.user, 'if_live.booking_cancelled', target(bid), { legs: open.map(routeOf) });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// GET /bids/:id/history
router.get('/bids/:id/history', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const list = await pb.collection('audit_logs').getList(1, 50, {
      filter: `target_id = "${esc(req.params.id)}" && action ~ "if_live."`, sort: '-created', requestKey: null,
    });
    res.json({ history: list.items.map(x => ({ id: x.id, action: x.action, by: x.actor_name, at: x.created, details: x.details })) });
  } catch (err) {
    fail(res, err);
  }
});

// GET /pilots/:id/pireps  (last 14 days, for the link picker)
router.get('/pilots/:id/pireps', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const since = new Date(Date.now() - 14 * 24 * HOUR).toISOString().replace('T', ' ');
    const flights = await pb.collection('flights').getFullList({
      filter: `user = "${esc(req.params.id)}" && created >= "${since}"`, sort: '-created',
      fields: 'id,flight_number,departure_icao,arrival_icao,flight_time,status,is_live,created', requestKey: null,
    });
    res.json({ pireps: flights });
  } catch (err) {
    fail(res, err);
  }
});

const ABANDON_LOOKBACK_DAYS = 14;
const pbDate = msValue => new Date(msValue).toISOString().replace('T', ' ');
const isoOf = msValue => new Date(msValue).toISOString();

function nmBetween(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Where the aircraft is now, in words, from its IF Live position
function describePosition(pos, leg) {
  if (!pos || pos.latitude == null || pos.longitude == null) return { text: 'No position from Infinite Flight', known: false };
  const near = nearestAirport(pos.latitude, pos.longitude);
  const dest = lookupAirport(leg.destIcao);
  const origin = lookupAirport(leg.originIcao);
  const toDest = dest ? Math.round(nmBetween(pos.latitude, pos.longitude, dest.lat, dest.lng)) : null;
  const fromOrigin = origin ? Math.round(nmBetween(pos.latitude, pos.longitude, origin.lat, origin.lng)) : null;
  const onGround = pos.isOnGround !== false;
  let text;
  if (onGround && near) text = `On the ground at ${near.icao}`;
  else if (onGround) text = 'On the ground away from any airport';
  else text = `In the air at ${Math.round(pos.altitude || 0).toLocaleString('en-AU')} ft`;
  if (toDest != null && !(onGround && near?.icao === leg.destIcao)) text += `, ${toDest} nm from ${leg.destIcao}`;
  return {
    text, known: true, onGround, nearestIcao: near?.icao || null, nmToDest: toDest, nmFromOrigin: fromOrigin,
    latitude: pos.latitude, longitude: pos.longitude, altitudeFt: Math.round(pos.altitude || 0),
    lastSeen: pos.updatedAt || null, lastPilot: pos.lastPilotUsername || null,
  };
}

async function findAbandoned(pb, now = Date.now()) {
  const org = orgId();
  const orgClause = org ? ` && organization_id = "${esc(org)}"` : '';
  const bids = await pb.collection('if_live_bids').getFullList({
    filter: `updated >= "${pbDate(now - ABANDON_LOOKBACK_DAYS * 24 * HOUR)}"${orgClause}`, expand: 'pilot', requestKey: null,
  });

  const candidates = [];
  for (const bid of bids) {
    (bid.legs || []).forEach((l, i) => {
      if (l.pirepId || !l.startedAt || l.abandonResolvedAt) return;
      if (l.expired && !l.noShow && !l.cancelledByAdmin) candidates.push({ bid, i, l, kind: 'expired' });
    });
  }
  if (!candidates.length) return [];

  const serviceUserId = org ? await getServiceUserIdForOrg(org).catch(() => null) : null;
  const positions = new Map();
  if (serviceUserId) {
    await Promise.all([...new Set(candidates.map(c => c.bid.aircraft_id))].map(async id => {
      try { positions.set(id, await ifLiveRequest(serviceUserId, `/live/aircraft/${encodeURIComponent(id)}/position`)); } catch { /* no position */ }
    }));
  }

  const out = [];
  for (const { bid, i, l, kind } of candidates) {
    const pos = positions.get(bid.aircraft_id) || null;
    const where = describePosition(pos, l);
    // Has the aircraft flown since? Then where it is now isn't where this flight left it.
    const movedOn = bids.some(b => b.aircraft_id === bid.aircraft_id
      && (b.legs || []).some(x => x !== l && x.startedAt && ms(x.startedAt) > ms(l.startedAt)));
    out.push({
      bidId: bid.id, legIndex: i, kind, status: bid.status,
      registration: bid.aircraft_registration, aircraftId: bid.aircraft_id,
      pilot: bid.expand?.pilot ? { id: bid.expand.pilot.id, name: pilotName(bid.expand.pilot) } : null,
      leg: { flightNumber: l.flightNumber, originIcao: l.originIcao, destIcao: l.destIcao, startedAt: l.startedAt, deadlineUtc: l.deadlineUtc },
      where: movedOn ? { text: 'The aircraft has flown since', known: false, movedOn: true } : where,
    });
  }
  return out.sort((a, b) => ms(b.leg.startedAt) - ms(a.leg.startedAt));
}

// Status for a booking once its legs change
function statusFor(legs, fallback = 'expired') {
  if (!legs.every(l => l.pirepId || l.expired)) return 'active';
  return legs.some(l => l.pirepId) ? 'completed' : fallback;
}

const ABANDON_FLAGS = ['startedAt', 'windowStartUtc', 'expired', 'noShow', 'abandoned', 'abandonResolvedAt', 'reassignedTo',
  'landedPromptAt', 'landedPromptChannelId', 'landedPromptMessageId', 'landedPromptFlight'];

// GET /abandoned
router.get('/abandoned', async (req, res) => {
  try {
    const pb = await getAdminClient();
    res.json({ abandoned: await findAbandoned(pb) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/bids/:id/legs/:i/give-back', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (leg.pirepId) throw bad('This leg is already filed');
    const hours = Math.min(24, Math.max(1, Number(req.body?.hours) || 4));
    const wasExpired = !!leg.expired;
    for (const k of ABANDON_FLAGS) delete leg[k];
    const now = Date.now();
    leg.holdStartUtc = isoOf(now);
    leg.deadlineUtc = isoOf(now + hours * HOUR);

    const warnings = [];
    if (wasExpired || !isRealSchedule(leg.ifScheduleId)) {
      const r = await createLegSchedule(bid, leg);
      warnings.push(...r.warnings);
    }
    // Later timeless legs wait for this one again
    for (let k = i + 1; k < legs.length; k++) {
      if (!isOpen(legs[k]) || !isTimelessLeg(legs[k])) continue;
      if (ms(legs[k].holdStartUtc) < ms(legs[k - 1].deadlineUtc)) {
        legs[k].holdStartUtc = legs[k - 1].deadlineUtc;
        legs[k].deadlineUtc = deadlineForLeg(legs[k], 1, now, legs[k - 1].deadlineUtc);
      }
    }
    const others = await pb.collection('if_live_bids').getFullList({
      filter: `aircraft_id = "${esc(bid.aircraft_id)}" && (status = "active" || status = "pending") && id != "${esc(bid.id)}"`, requestKey: null,
    });
    if (others.some(b => (b.legs || []).some(isOpen))) warnings.push('Another booking on this aircraft is still open. Check the order on Bookings.');

    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status: 'active' });
    await logAction(req.user, 'if_live.abandoned_given_back', target(bid), { leg: i, route: routeOf(leg), hours });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }), warnings });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/bids/:id/legs/:i/reassign', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (leg.pirepId) throw bad('This leg is already filed');
    const pilot = await pb.collection('users').getOne(String(req.body?.pilotId || ''), { requestKey: null })
      .catch(() => { throw bad('Pilot not found', 404); });
    if (pilot.id === bid.pilot) throw bad('Use Give back to reopen it for the same pilot');
    const hours = Math.min(24, Math.max(1, Number(req.body?.hours) || 4));
    const warnings = [];
    if (!pilot.if_user_id) warnings.push(`${pilotName(pilot)} hasn't linked an Infinite Flight account, so landings can't be matched until they do.`);

    if (!leg.expired) await deleteSchedules(bid, [leg]);
    const now = Date.now();
    const newLeg = { flightNumber: leg.flightNumber, originIcao: leg.originIcao, destIcao: leg.destIcao, timeless: true };
    const created = await createLiveSchedulesForBid({
      organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs: [newLeg], crew: [],
      captain: { ifUserId: pilot.if_user_id }, startAt: now,
    });
    warnings.push(...(created.crewWarnings || []));
    const newLegs = created.legs.map(l => ({ ...l, holdStartUtc: isoOf(now), deadlineUtc: isoOf(now + hours * HOUR) }));
    const newBid = await pb.collection('if_live_bids').create({
      pilot: pilot.id, organization_id: bid.organization_id, aircraft_id: bid.aircraft_id,
      aircraft_registration: bid.aircraft_registration, aircraft_type_id: bid.aircraft_type_id || '', livery_id: bid.livery_id || '',
      legs: newLegs, status: 'active',
      review_note: `Finishing ${pilotName(bid.expand?.pilot)}'s flight. Booked by ${req.user.callsign || 'an admin'}`.slice(0, 500),
    });

    Object.assign(leg, { expired: true, abandoned: true, abandonResolvedAt: isoOf(now), reassignedTo: newBid.id });
    await pb.collection('if_live_bids').update(bid.id, { legs, status: statusFor(legs, bid.status === 'active' ? 'expired' : bid.status) });
    notifyBookingCreated({ pilot, aircraftRegistration: bid.aircraft_registration, aircraftTypeId: bid.aircraft_type_id, legs: newLegs }).catch(() => {});
    await logAction(req.user, 'if_live.abandoned_reassigned', target(bid), { leg: i, route: routeOf(leg), to: pilotName(pilot), newBidId: newBid.id });
    await logAction(req.user, 'if_live.booked_for_pilot', { id: newBid.id, name: `${bid.aircraft_registration} ${pilotName(pilot)}` }, { legs: [routeOf(leg)], finishing: bid.id });
    res.json({ bookingId: newBid.id, warnings });
  } catch (err) {
    fail(res, err);
  }
});

// POST /bids/:id/legs/:i/abandon  { notify }
router.post('/bids/:id/legs/:i/abandon', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await loadBid(pb, req.params.id);
    const { i, legs } = legAt(bid, req.params.i);
    const leg = legs[i];
    if (leg.pirepId) throw bad('This leg is already filed');
    if (!leg.expired) await deleteSchedules(bid, [leg]);
    Object.assign(leg, { expired: true, abandoned: true, abandonResolvedAt: isoOf(Date.now()) });
    const status = statusFor(legs, 'expired');
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status: bid.status === 'active' ? status : bid.status });
    if (req.body?.notify && bid.expand?.pilot) {
      notifyLegAbandoned({ pilot: bid.expand.pilot, leg, aircraftRegistration: bid.aircraft_registration }).catch(() => {});
    }
    await logAction(req.user, 'if_live.abandoned_closed', target(bid), { leg: i, route: routeOf(leg), notified: !!req.body?.notify });
    res.json({ booking: serialize({ ...updated, expand: bid.expand }) });
  } catch (err) {
    fail(res, err);
  }
});

// Pilots
function legOutcome(l) {
  if (l.pirepId) return 'flown';
  if (!l.expired) return 'open';
  if (l.noShow) return 'no_show';
  if (l.cancelledByAdmin) return 'cancelled';
  if (l.abandoned || l.startedAt) return 'abandoned';
  return 'expired';
}

async function allOrgBids(pb) {
  const org = orgId();
  return pb.collection('if_live_bids').getFullList({
    filter: org ? `organization_id = "${esc(org)}"` : '', expand: 'pilot', requestKey: null,
  });
}

// GET /pilots
router.get('/pilots', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const [bids, users] = await Promise.all([
      allOrgBids(pb),
      pb.collection('users').getFullList({
        filter: 'live_access = true || role = "admin" || role = "staff"',
        fields: 'id,callsign,first_name,last_name,role,live_access,if_user_id', requestKey: null,
      }),
    ]);
    const byId = new Map(users.map(u => [u.id, u]));
    for (const b of bids) if (b.expand?.pilot && !byId.has(b.pilot)) byId.set(b.pilot, b.expand.pilot);

    const stats = new Map();
    const get = id => {
      if (!stats.has(id)) stats.set(id, { bookings: 0, flights: 0, hours: 0, noShows: 0, abandoned: 0, cancelled: 0, lastFlownAt: null, current: null });
      return stats.get(id);
    };
    for (const b of bids) {
      const s = get(b.pilot);
      s.bookings++;
      if (b.status === 'cancelled' && !String(b.review_note || '').startsWith('Merged')) s.cancelled++;
      for (const l of b.legs || []) {
        const o = legOutcome(l);
        if (o === 'flown') {
          s.flights++;
          s.hours += Number(l.pirepFlightTime) || 0;
          if (!s.lastFlownAt || ms(l.loggedAt) > ms(s.lastFlownAt)) s.lastFlownAt = l.loggedAt;
        } else if (o === 'no_show') s.noShows++;
        else if (o === 'abandoned') s.abandoned++;
      }
      if ((b.status === 'active' || b.status === 'pending') && (b.status === 'pending' || (b.legs || []).some(isOpen))) {
        s.current = { bidId: b.id, registration: b.aircraft_registration };
      }
    }
    const pilots = [...byId.values()].map(u => ({
      id: u.id, name: pilotName(u), role: u.role || 'pilot', liveAccess: !!u.live_access, ifLinked: !!u.if_user_id,
      ...get(u.id), hours: Math.round((get(u.id).hours) * 10) / 10,
    })).sort((a, b) => b.flights - a.flights || a.name.localeCompare(b.name));
    res.json({ pilots });
  } catch (err) {
    fail(res, err);
  }
});

// GET /pilots/:id
router.get('/pilots/:id', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bids = await pb.collection('if_live_bids').getFullList({ filter: `pilot = "${esc(req.params.id)}"`, sort: '-created', requestKey: null });
    const legs = bids.flatMap(b => (b.legs || []).map((l, i) => ({
      bidId: b.id, legIndex: i, registration: b.aircraft_registration, route: routeOf(l), outcome: legOutcome(l),
      hours: l.pirepId ? Number(l.pirepFlightTime) || 0 : null,
      at: l.loggedAt || l.startedAt || l.holdStartUtc || b.created,
    }))).sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 30);
    res.json({ legs });
  } catch (err) {
    fail(res, err);
  }
});

// PATCH /pilots/:id  { liveAccess }
router.patch('/pilots/:id', async (req, res) => {
  try {
    const pb = await getAdminClient();
    if (typeof req.body?.liveAccess !== 'boolean') throw bad('liveAccess must be true or false');
    const user = await pb.collection('users').getOne(req.params.id, { requestKey: null });
    await pb.collection('users').update(user.id, { live_access: req.body.liveAccess });
    await logAction(req.user, 'if_live.pilot_access', { id: user.id, name: pilotName(user) }, { liveAccess: req.body.liveAccess });
    res.json({ id: user.id, liveAccess: req.body.liveAccess, staff: user.role === 'admin' || user.role === 'staff' });
  } catch (err) {
    fail(res, err);
  }
});

// Aircraft GET /aircraft
router.get('/aircraft', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const org = orgId();
    const [bids, fleet, admin] = await Promise.all([
      allOrgBids(pb),
      org ? fleetStatus(org).catch(() => []) : [],
      liveAircraftAdmin.getAll(),
    ]);
    const ids = new Set([...fleet.map(a => a.id), ...bids.map(b => b.aircraft_id)]);
    const aircraft = [...ids].map(id => {
      const ac = fleet.find(a => a.id === id) || { id, registration: bids.find(b => b.aircraft_id === id)?.aircraft_registration, type: null, currentIcao: null, live: null };
      const mine = bids.filter(b => b.aircraft_id === id);
      let flights = 0;
      let hours = 0;
      let last = null;
      for (const b of mine) for (const l of b.legs || []) {
        if (!l.pirepId) continue;
        flights++;
        hours += Number(l.pirepFlightTime) || 0;
        if (!last || ms(l.loggedAt) > ms(last.at)) last = { at: l.loggedAt, route: routeOf(l), pilot: pilotName(b.expand?.pilot) };
      }
      const open = mine.filter(b => b.status === 'pending' || (b.status === 'active' && (b.legs || []).some(isOpen)))
        .map(b => {
          const l = (b.legs || []).find(isOpen) || (b.legs || [])[0] || {};
          return { bidId: b.id, status: b.status, pilot: pilotName(b.expand?.pilot), route: routeOf(l), started: !!l.startedAt };
        });
      const settings = admin[id] || {};
      const flying = !!(ac.live && !ac.live.onGround) || open.some(o => o.started);
      return {
        id, registration: ac.registration || '', type: ac.type || null, location: ac.currentIcao || null,
        live: ac.live || null, flights, hours: Math.round(hours * 10) / 10, last, bookings: open,
        blocked: !!settings.blocked, blockReason: settings.reason || '', blockedBy: settings.blockedBy || null, blockedAt: settings.blockedAt || null,
        locationIcao: settings.locationIcao || null, locationBy: settings.locationBy || null, locationAt: settings.locationAt || null,
        state: settings.blocked ? 'blocked' : flying ? 'flying' : open.length ? 'booked' : 'free',
      };
    }).sort((a, b) => a.registration.localeCompare(b.registration));
    res.json({ aircraft });
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/aircraft/:id', async (req, res) => {
  try {
    const { blocked, reason, locationIcao, registration } = req.body || {};
    const patch = {};
    const by = req.user.callsign || req.user.email || 'admin';
    const now = isoOf(Date.now());
    if (blocked !== undefined) {
      Object.assign(patch, { blocked: !!blocked, reason: blocked ? String(reason || '').slice(0, 200) : '', blockedBy: blocked ? by : null, blockedAt: blocked ? now : null });
    }
    if (locationIcao !== undefined) {
      if (locationIcao) {
        const icao = String(locationIcao).trim().toUpperCase();
        if (!lookupAirport(icao)) throw bad(`${icao} isn't an airport we know`);
        Object.assign(patch, { locationIcao: icao, locationBy: by, locationAt: now });
      } else {
        Object.assign(patch, { locationIcao: null, locationBy: null, locationAt: null });
      }
    }
    if (!Object.keys(patch).length) throw bad('Nothing to change');
    const entry = await liveAircraftAdmin.setFor(req.params.id, patch);
    await logAction(req.user, 'if_live.aircraft_updated', { id: req.params.id, name: registration || req.params.id }, patch);
    res.json({ aircraft: entry });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const org = orgId();
    if (!org) throw bad('No Live organization is configured');
    const { pilotId, aircraftId } = req.body || {};
    const rawLegs = Array.isArray(req.body?.legs) ? req.body.legs : [];
    if (rawLegs.length < 1 || rawLegs.length > 6) throw bad('Add between 1 and 6 legs');
    const legs = rawLegs.map(l => ({
      flightNumber: String(l.flightNumber || '').trim().toUpperCase(),
      originIcao: String(l.originIcao || '').trim().toUpperCase(),
      destIcao: String(l.destIcao || '').trim().toUpperCase(),
      timeless: true,
    }));
    legs.forEach((l, n) => {
      if (!l.flightNumber || !l.originIcao || !l.destIcao) throw bad(`Leg ${n + 1} needs a flight number, origin and destination`);
      for (const icao of [l.originIcao, l.destIcao]) if (!lookupAirport(icao)) throw bad(`${icao} isn't an airport we know`);
      if (n > 0 && l.originIcao !== legs[n - 1].destIcao) throw bad(`Leg ${n + 1} has to depart from ${legs[n - 1].destIcao}`);
    });

    const pilot = await pb.collection('users').getOne(String(pilotId || ''), { requestKey: null }).catch(() => { throw bad('Pilot not found', 404); });
    const serviceUserId = await getServiceUserIdForOrg(org);
    if (!serviceUserId) throw bad('No connected Infinite Flight account is set for the organization', 503);
    const list = await ifLiveRequest(serviceUserId, `/live/organizations/${encodeURIComponent(org)}/aircraft`);
    const ac = (list || []).find(a => a.id === aircraftId);
    if (!ac) throw bad('That aircraft isn\'t in the Live fleet', 404);

    const warnings = [];
    if (!pilot.if_user_id) warnings.push(`${pilotName(pilot)} hasn't linked an Infinite Flight account, so landings can't be matched until they do.`);
    if (await liveAircraftAdmin.blockFor(aircraftId)) warnings.push('This aircraft is blocked from booking. It was booked anyway.');
    const [theirs, onAircraft] = await Promise.all([
      pb.collection('if_live_bids').getFullList({ filter: `pilot = "${esc(pilot.id)}" && (status = "active" || status = "pending")`, requestKey: null }),
      pb.collection('if_live_bids').getFullList({ filter: `aircraft_id = "${esc(aircraftId)}" && (status = "active" || status = "pending")`, requestKey: null }),
    ]);
    const theirOpen = theirs.filter(b => b.status === 'pending' || (b.legs || []).some(isOpen));
    if (theirOpen.some(b => b.aircraft_id === aircraftId)) warnings.push(`${pilotName(pilot)} already has a booking on this aircraft.`);
    else if (theirOpen.length >= MAX_BOOKINGS_PER_PILOT) warnings.push(`${pilotName(pilot)} already has ${theirOpen.length} aircraft booked, more than pilots can book themselves.`);
    let last = null;
    for (const b of onAircraft) for (const l of b.legs || []) {
      if (!isOpen(l) || !l.deadlineUtc) continue;
      if (!last || ms(l.deadlineUtc) > last.at) last = { at: ms(l.deadlineUtc), icao: l.destIcao };
    }
    if (last?.icao && last.icao !== legs[0].originIcao) warnings.push(`The booking before this one finishes at ${last.icao}, not ${legs[0].originIcao}.`);

    const created = await createLiveSchedulesForBid({
      organizationId: org, aircraftId, legs, crew: [], captain: { ifUserId: pilot.if_user_id },
      startAt: Math.max(Date.now(), last?.at || 0),
    });
    warnings.push(...(created.crewWarnings || []));
    const bid = await pb.collection('if_live_bids').create({
      pilot: pilot.id, organization_id: org, aircraft_id: aircraftId, aircraft_registration: ac.registration || '',
      aircraft_type_id: ac.aircraftId || '', livery_id: ac.liveryId || '', legs: created.legs, status: 'active',
      review_note: `Booked by ${req.user.callsign || 'an admin'}`,
    });
    notifyBookingCreated({ pilot, aircraftRegistration: ac.registration, aircraftTypeId: ac.aircraftId, legs: created.legs }).catch(() => {});
    await logAction(req.user, 'if_live.booked_for_pilot', { id: bid.id, name: `${ac.registration} ${pilotName(pilot)}` }, { legs: legs.map(routeOf) });
    res.json({ bookingId: bid.id, warnings });
  } catch (err) {
    fail(res, err);
  }
});

// GET /bookings/recent?days=7  closed bookings
router.get('/bookings/recent', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const days = Math.min(60, Math.max(1, Number(req.query.days) || 7));
    const org = orgId();
    const bids = await pb.collection('if_live_bids').getFullList({
      filter: `status != "active" && status != "pending" && updated >= "${pbDate(Date.now() - days * 24 * HOUR)}"${org ? ` && organization_id = "${esc(org)}"` : ''}`,
      expand: 'pilot', sort: '-updated', requestKey: null,
    });
    res.json({ bookings: bids.map(serialize) });
  } catch (err) {
    fail(res, err);
  }
});

const ADMIN_ACTION_TEXT = {
  'if_live.leg_edited': 'edited a leg', 'if_live.schedule_retried': 'retried a schedule', 'if_live.leg_scheduled': 'created a schedule',
  'if_live.pirep_linked': 'linked a PIREP', 'if_live.pirep_unlinked': 'unlinked a PIREP', 'if_live.leg_cancelled': 'cancelled a leg',
  'if_live.booking_cancelled': 'cancelled a booking', 'if_live.booking_closed': 'closed a booking', 'if_live.bookings_merged': 'merged bookings',
  'if_live.abandoned_given_back': 'gave an abandoned flight back', 'if_live.abandoned_reassigned': 'reassigned an abandoned flight',
  'if_live.abandoned_closed': 'closed an abandoned flight', 'if_live.pilot_access': 'changed Live access', 'if_live.aircraft_updated': 'changed an aircraft',
  'if_live.booked_for_pilot': 'booked for a pilot',
};

router.get('/activity', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const since = Date.now() - hours * HOUR;
    const org = orgId();
    const [bids, logs] = await Promise.all([
      pb.collection('if_live_bids').getFullList({
        filter: `updated >= "${pbDate(since)}"${org ? ` && organization_id = "${esc(org)}"` : ''}`, expand: 'pilot', requestKey: null,
      }),
      pb.collection('audit_logs').getFullList({ filter: `created >= "${pbDate(since)}" && action ~ "if_live."`, requestKey: null }),
    ]);
    const events = [];
    const push = (kind, at, bid, text) => { if (ms(at) >= since) events.push({ kind, at: isoOf(ms(at)), bidId: bid?.id || null, registration: bid?.aircraft_registration || null, pilot: bid ? pilotName(bid.expand?.pilot) : null, text }); };
    for (const b of bids) {
      push('booked', b.created, b, `booked ${(b.legs || []).map(routeOf).join(', ')}`);
      if (b.status === 'cancelled') push('cancelled', b.updated, b, String(b.review_note || '').startsWith('Merged') ? 'booking merged into another' : 'booking cancelled');
      for (const l of b.legs || []) {
        if (l.startedAt) push('started', l.startedAt, b, `started ${routeOf(l)}`);
        if (l.landedPromptAt) push('landed', l.landedPromptAt, b, `landed ${routeOf(l)}`);
        if (l.loggedAt) push('filed', l.loggedAt, b, `filed ${routeOf(l)}, ${Number(l.pirepFlightTime || 0).toFixed(1)}h`);
        const o = legOutcome(l);
        if (o === 'no_show') push('no_show', b.updated, b, `no-show on ${routeOf(l)}`);
        if (o === 'abandoned') push('abandoned', l.abandonResolvedAt || b.updated, b, `abandoned ${routeOf(l)}`);
      }
    }
    for (const x of logs) {
      if (!(ms(x.created) >= since)) continue;
      events.push({ kind: 'admin', at: isoOf(ms(x.created)), bidId: x.target_id || null, registration: null, pilot: x.actor_name, text: `${ADMIN_ACTION_TEXT[x.action] || x.action}${x.target_name ? ` (${x.target_name})` : ''}` });
    }
    events.sort((a, b) => ms(b.at) - ms(a.at));
    res.json({ events: events.slice(0, 300) });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
module.exports.findIssues = findIssues;
module.exports.findAbandoned = findAbandoned;
