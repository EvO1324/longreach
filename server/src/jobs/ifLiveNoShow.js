/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const {
  getServiceUserIdForOrg, ifLiveWrite, ifLiveRequest, invalidateAircraftSchedulesCache,
  startedDeadline, deadlineForLeg, isTimelessLeg, notifyNextBookingOfEarlyRelease, START_WINDOW_MS,
} = require('../routes/ifLive');
const { notifyBookingDropped } = require('../routes/discord');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const IF_BASE = 'https://api.infiniteflight.com/public/v2';
const MOVED = new Set([4, 6, 7, 10, 11]);
const MOVING_KT = 5;
const isMoving = f => (Number(f.speed) || 0) >= MOVING_KT;

const pbDate = v => new Date(String(v).replace(' ', 'T')).getTime();
const holdStart = (leg, bid) => (leg.holdStartUtc ? new Date(leg.holdStartUtc).getTime()
  : leg.departureUtc ? new Date(leg.departureUtc).getTime() : pbDate(bid.created));
const isOpen = l => !l.pirepId && !l.expired;

async function expertFlights() {
  const sessData = await (await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`)).json();
  if (sessData.errorCode !== 0) throw new Error(`IF sessions error ${sessData.errorCode}`);
  const expert = (sessData.result || []).find(s => /expert/i.test(s.name || ''));
  if (!expert) return [];
  const flightData = await (await fetch(`${IF_BASE}/sessions/${expert.id}/flights?apikey=${process.env.IF_API_KEY}`)).json();
  if (flightData.errorCode !== 0) throw new Error(`IF flights error ${flightData.errorCode}`);
  return flightData.result || [];
}

function matchesFlight(f, pilot, bid, leg, typeAmbiguous = false) {
  if (!pilot?.if_user_id || f.userId !== pilot.if_user_id) return false;
  const typeOk = !typeAmbiguous && bid.aircraft_type_id && f.aircraftId === bid.aircraft_type_id && (!bid.livery_id || f.liveryId === bid.livery_id);
  const callsignOk = leg.flightNumber && String(f.callsign || '').replace(/\s+/g, '').toUpperCase().includes(String(leg.flightNumber).replace(/\s+/g, '').toUpperCase());
  return !!(typeOk || callsignOk);
}

// The Live aircraft took off with this pilot on it after `sinceMs`.
async function airborneOnLive(bid, pilot, sinceMs) {
  if (!pilot?.if_user_id) return false;
  const serviceUserId = await getServiceUserIdForOrg(bid.organization_id).catch(() => null);
  if (!serviceUserId) return false;
  const pos = await ifLiveRequest(serviceUserId, `/live/aircraft/${encodeURIComponent(bid.aircraft_id)}/position`).catch(() => null);
  if (!pos || pos.isOnGround !== false || pos.lastPilotId !== pilot.if_user_id) return false;
  const at = Date.parse(pos.updatedAt || '');
  return Number.isFinite(at) && at >= sinceMs;
}

async function runIfLiveNoShow() {
  const label = '[if-live-no-show]';
  const stats = { started: 0, dropped: 0, windows: 0 };
  try {
    const pb = await getAdminClient();
    const active = await pb.collection('if_live_bids').getFullList({ filter: 'status = "active"', requestKey: null });
    const now = Date.now();

    // Current (first open) leg of each booking that hasn't started yet.
    const candidates = active.map(bid => {
      const legIndex = (bid.legs || []).findIndex(isOpen);
      return legIndex >= 0 && !bid.legs[legIndex].startedAt ? { bid, legIndex, leg: bid.legs[legIndex] } : null;
    }).filter(Boolean);
    if (!candidates.length) return stats;

    let flights = null; // null = couldn't check, so nobody is dropped this run
    try { flights = await expertFlights(); } catch (err) { console.warn(`${label} couldn't fetch Expert Server flights:`, err.message); }

    const statusCache = new Map();
    const scheduleStatus = async (bid, scheduleId) => {
      if (!scheduleId) return null;
      if (!statusCache.has(bid.aircraft_id)) {
        statusCache.set(bid.aircraft_id, (async () => {
          const serviceUserId = await getServiceUserIdForOrg(bid.organization_id).catch(() => null);
          if (!serviceUserId) return new Map();
          const list = await ifLiveWrite(serviceUserId, 'GET', `/live/aircraft/${encodeURIComponent(bid.aircraft_id)}/schedules`).catch(() => []);
          return new Map((list || []).map(s => [s.id, s.status]));
        })());
      }
      return (await statusCache.get(bid.aircraft_id)).get(scheduleId) ?? null;
    };
    const pilots = new Map();
    const pilotOf = async id => {
      if (!pilots.has(id)) pilots.set(id, await pb.collection('users').getOne(id, { requestKey: null }).catch(() => null));
      return pilots.get(id);
    };

    for (const { bid, legIndex, leg } of candidates) {
      const legs = bid.legs.map(l => ({ ...l }));
      const pilot = await pilotOf(bid.pilot);
      const typeAmbiguous = active.some(b => b.id !== bid.id && b.pilot === bid.pilot && (b.legs || []).some(isOpen)
        && b.aircraft_type_id && b.aircraft_type_id === bid.aircraft_type_id && (b.livery_id || null) === (bid.livery_id || null));
      const myStart = holdStart(leg, bid);
      const ahead = active.some(b => b.id !== bid.id && b.aircraft_id === bid.aircraft_id
        && (b.legs || []).some(l => isOpen(l) && holdStart(l, b) < myStart));
      if (ahead) continue;
      const due = now >= myStart;

      // Who can be flying it: the booking pilot, or crew they added.
      const flyers = [pilot?.if_user_id, ...(bid.crew || []).map(c => c.ifUserId)].filter(Boolean);
      const onExpert = (flights || []).some(f => isMoving(f) && (
        (f.flightId === bid.aircraft_id && (!flyers.length || flyers.includes(f.userId)))
        || matchesFlight(f, pilot, bid, leg, typeAmbiguous)));
      const since = leg.windowStartUtc ? new Date(leg.windowStartUtc).getTime() : myStart;
      const started = due && (onExpert || MOVED.has(await scheduleStatus(bid, leg.ifScheduleId))
        || await airborneOnLive(bid, pilot, since));

      if (started) {
        legs[legIndex].startedAt = new Date(now).toISOString();
        legs[legIndex].deadlineUtc = startedDeadline(leg, now);
        // Later timeless legs re-stack from the new deadline.
        for (let i = legIndex + 1; i < legs.length; i++) {
          if (!isTimelessLeg(legs[i])) continue;
          legs[i].holdStartUtc = legs[i - 1].deadlineUtc;
          legs[i].deadlineUtc = deadlineForLeg(legs[i], 1, now, legs[i - 1].deadlineUtc);
        }
        await pb.collection('if_live_bids').update(bid.id, { legs });
        stats.started++;
        continue;
      }

      if (!leg.windowStartUtc) {
        legs[legIndex].windowStartUtc = new Date(Math.max(now, myStart)).toISOString();
        await pb.collection('if_live_bids').update(bid.id, { legs });
        stats.windows++;
        continue;
      }
      if (flights === null) continue; // couldn't see the Expert Server, don't punish anyone for it
      if (now < new Date(leg.windowStartUtc).getTime() + START_WINDOW_MS) continue;

      // No-show: drop the rest of the booking.
      const serviceUserId = await getServiceUserIdForOrg(bid.organization_id).catch(() => null);
      for (const l of legs) {
        if (!isOpen(l)) continue;
        if (l.ifScheduleId && serviceUserId) {
          await ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(l.ifScheduleId)}`)
            .catch(err => console.warn(`${label} couldn't delete schedule ${l.ifScheduleId}:`, err.message));
        }
        l.expired = true;
        l.noShow = true;
      }
      invalidateAircraftSchedulesCache(bid.aircraft_id);
      const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status: legs.some(l => l.pirepId) ? 'completed' : 'expired' });
      stats.dropped++;
      if (pilot) notifyBookingDropped({ pilot, leg, aircraftRegistration: bid.aircraft_registration }).catch(() => {});
      notifyNextBookingOfEarlyRelease(pb, updated, leg, pilot, 'dropped').catch(() => {});
    }

    if (stats.started || stats.dropped) console.log(`${label} ${stats.started} started, ${stats.dropped} dropped`);
    return stats;
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { ...stats, error: err.message };
  }
}

function scheduleIfLiveNoShow() {
  console.log('[if-live-no-show] scheduler registered — checks every 5 minutes');
  const run = () => {
    scheduleIfLiveNoShow._lastRun = new Date().toISOString();
    scheduleIfLiveNoShow._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
    runIfLiveNoShow();
  };
  scheduleIfLiveNoShow._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
  setInterval(run, CHECK_INTERVAL_MS);
  run();
}

module.exports = { scheduleIfLiveNoShow, runIfLiveNoShow, matchesFlight };
