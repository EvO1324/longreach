/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { matchLandedLeg, getConsumedFlightTimestamps } = require('../routes/ifLive');
const { postLandingPrompt } = require('../services/landingPrompt');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

async function runIfLiveAutoPirep() {
  const label = '[if-live-landing]';
  try {
    const pb = await getAdminClient();

    const activeBids = await pb.collection('if_live_bids').getFullList({
      filter: 'status = "active"',
      requestKey: null,
    });

    const candidates = [];
    for (const bid of activeBids) {
      const legs = bid.legs || [];
      for (let legIndex = 0; legIndex < legs.length; legIndex++) {
        const leg = legs[legIndex];
        if (leg.pirepId || leg.expired || !leg.ifScheduleId || leg.landedPromptAt) continue;
        candidates.push({ bid, legIndex, leg });
      }
    }
    if (candidates.length === 0) return { prompted: 0, errors: 0 };

    const fleetItems = await pb.collection('fleet').getFullList({
      requestKey: null,
      fields: 'name,aircraft_id,livery_id',
    });

    let prompted = 0, errors = 0;
    const pilotCache = new Map();
    const excludeCreatedCache = new Map();

    for (const { bid, legIndex, leg } of candidates) {
      let pilot = pilotCache.get(bid.pilot);
      if (!pilot) {
        try {
          pilot = await pb.collection('users').getOne(bid.pilot, { requestKey: null });
          pilotCache.set(bid.pilot, pilot);
        } catch (err) {
          console.warn(`${label} couldn't load pilot ${bid.pilot} for bid ${bid.id}:`, err.message);
          continue;
        }
      }
      if (!pilot.if_user_id) continue; // nothing to check this leg against

      let excludeCreated = excludeCreatedCache.get(bid.pilot);
      if (!excludeCreated) {
        excludeCreated = await getConsumedFlightTimestamps(pb, bid.pilot);
        // and flights already prompted for on another of their open legs
        for (const b of activeBids) {
          if (b.pilot !== bid.pilot) continue;
          for (const l of b.legs || []) if (l.landedPromptFlight && !l.pirepId) excludeCreated.add(l.landedPromptFlight);
        }
        excludeCreatedCache.set(bid.pilot, excludeCreated);
      }

      try {
        const result = await matchLandedLeg(pb, bid, leg, pilot, { excludeCreated, fleetItems });
        if (!result.matched) continue;
        if (result.bestCandidate?.created) excludeCreated.add(result.bestCandidate.created);

        const where = await postLandingPrompt({ pilot, bid, legIndex });
        const fresh = await pb.collection('if_live_bids').getOne(bid.id, { requestKey: null });
        const freshLeg = (fresh.legs || [])[legIndex];
        if (freshLeg && !freshLeg.landedPromptAt) {
          Object.assign(freshLeg, {
            landedPromptAt: new Date().toISOString(),
            landedPromptChannelId: where.channelId,
            landedPromptMessageId: where.messageId,
            landedPromptFlight: result.bestCandidate?.created || null,
          });
          await pb.collection('if_live_bids').update(bid.id, { legs: fresh.legs });
        }
        prompted++;
        console.log(`${label} landing prompt for leg ${legIndex} on bid ${bid.id} (${leg.flightNumber || ''} ${leg.originIcao}→${leg.destIcao}) for pilot ${bid.pilot}`);
      } catch (err) {
        errors++;
        console.error(`${label} failed checking bid ${bid.id} leg ${legIndex}:`, err.message);
      }
    }

    if (prompted > 0) console.log(`${label} posted ${prompted} landing prompt(s)`);
    return { prompted, errors };
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { prompted: 0, errors: 1, error: err.message };
  }
}

function scheduleIfLiveAutoPirep() {
  console.log('[if-live-landing] scheduler registered — checks every 5 minutes');

  const run = () => {
    scheduleIfLiveAutoPirep._lastRun = new Date().toISOString();
    scheduleIfLiveAutoPirep._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
    runIfLiveAutoPirep();
  };

  scheduleIfLiveAutoPirep._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
  setInterval(run, CHECK_INTERVAL_MS);
  run();
}

module.exports = { scheduleIfLiveAutoPirep, runIfLiveAutoPirep };
