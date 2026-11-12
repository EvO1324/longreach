/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { getServiceUserIdForOrg, ifLiveWrite, invalidateAircraftSchedulesCache, getAllServerFlightIds } = require('../routes/ifLive');
const { notifyLegExpired } = require('../routes/discord');

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const MAX_GRACE_MS = 6 * 60 * 60 * 1000;
const STILL_FLYING = new Set([4, 6, 7, 8, 10, 11]);
// Legs this process has already sent an EXPIRED notice for (bidId:leg:deadline).
const notified = new Set();

async function scheduleStatuses(cache, serviceUserId, aircraftId) {
  if (!cache.has(aircraftId)) {
    cache.set(aircraftId, ifLiveWrite(serviceUserId, 'GET', `/live/aircraft/${encodeURIComponent(aircraftId)}/schedules`)
      .then(list => new Map((list || []).map(s => [s.id, s.status])))
      .catch(() => new Map()));
  }
  return cache.get(aircraftId);
}

async function runIfLiveBidExpiry() {
  const label = '[if-live-bid-expiry]';
  try {
    const pb = await getAdminClient();
    const activeBids = await pb.collection('if_live_bids').getFullList({
      filter: 'status = "active"',
      requestKey: null,
    });

    let expiredLegs = 0;
    let expiredBids = 0;
    const statusCache = new Map();
    let airborne = null;
    const isAirborne = async aircraftId => {
      if (!airborne) airborne = getAllServerFlightIds().then(r => r.flightIds).catch(() => new Set());
      return (await airborne).has(aircraftId);
    };

    for (const bid of activeBids) {
      const legs = bid.legs || [];
      const expiring = []; // indexes of legs to expire on this bid

      for (const [legIndex, leg] of legs.entries()) {
        if (leg.pirepId || leg.expired) continue;
        // Not started yet: jobs/ifLiveNoShow.js owns it (4h to start, or dropped).
        if (!leg.startedAt) continue;
        if (!leg.deadlineUtc || new Date() <= new Date(leg.deadlineUtc)) continue;

        if (Date.now() - new Date(leg.deadlineUtc).getTime() < MAX_GRACE_MS && await isAirborne(bid.aircraft_id)) continue;
        if (leg.ifScheduleId && Date.now() - new Date(leg.deadlineUtc).getTime() < MAX_GRACE_MS) {
          const serviceUserId = await getServiceUserIdForOrg(bid.organization_id).catch(() => null);
          if (serviceUserId) {
            const statuses = await scheduleStatuses(statusCache, serviceUserId, bid.aircraft_id);
            if (STILL_FLYING.has(statuses.get(leg.ifScheduleId))) continue; // check again next run
          }
        }
        expiring.push(legIndex);
      }

      if (!expiring.length) continue;

      let saved;
      try {
        const fresh = await pb.collection('if_live_bids').getOne(bid.id, { requestKey: null });
        if (fresh.status !== 'active') continue;
        const freshLegs = fresh.legs || [];
        const nowExpiring = expiring.filter(i => freshLegs[i] && !freshLegs[i].pirepId && !freshLegs[i].expired);
        if (!nowExpiring.length) continue;
        nowExpiring.forEach(i => { freshLegs[i].expired = true; });

        const update = { legs: freshLegs };
        if (freshLegs.every(l => l.pirepId || l.expired)) {
          update.status = freshLegs.some(l => l.pirepId) ? 'completed' : 'expired';
        }
        await pb.collection('if_live_bids').update(bid.id, update);
        saved = { legs: freshLegs, indexes: nowExpiring, closed: !!update.status };
      } catch (err) {
        console.error(`${label} couldn't expire bid ${bid.id}:`, err.message, JSON.stringify(err.response?.data || err.data || {}));
        continue;
      }

      expiredLegs += saved.indexes.length;
      if (saved.closed) expiredBids++;

      for (const i of saved.indexes) {
        const leg = saved.legs[i];
        const key = `${bid.id}:${i}:${leg.deadlineUtc}`;
        if (!notified.has(key)) {
          notified.add(key);
          pb.collection('users').getOne(bid.pilot, { requestKey: null })
            .then(pilot => notifyLegExpired({ pilot, leg, aircraftRegistration: bid.aircraft_registration }))
            .catch(err => console.warn(`${label} couldn't send the expired notice for bid ${bid.id}:`, err.message));
        }

        if (leg.ifScheduleId) {
          getServiceUserIdForOrg(bid.organization_id)
            .then(serviceUserId => serviceUserId && ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(leg.ifScheduleId)}`)
              .then(() => invalidateAircraftSchedulesCache(bid.aircraft_id)))
            .catch(err => console.warn(`${label} failed to remove IF Live schedule ${leg.ifScheduleId} for bid ${bid.id}:`, err.message));
        }
      }
    }

    if (expiredLegs > 0) {
      console.log(`${label} expired ${expiredLegs} leg(s) across ${expiredBids} bid(s)`);
    }
    return { expiredLegs, expiredBids };
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { expiredLegs: 0, expiredBids: 0, error: err.message };
  }
}

function scheduleIfLiveBidExpiry() {
  console.log('[if-live-bid-expiry] scheduler registered — checks every 15 minutes');

  const run = () => {
    scheduleIfLiveBidExpiry._lastRun = new Date().toISOString();
    scheduleIfLiveBidExpiry._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
    runIfLiveBidExpiry();
  };

  scheduleIfLiveBidExpiry._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
  setInterval(run, CHECK_INTERVAL_MS);
  run();
}

module.exports = { scheduleIfLiveBidExpiry, runIfLiveBidExpiry };
