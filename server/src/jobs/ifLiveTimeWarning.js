/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { notifyBidTimeWarning } = require('../routes/discord');
const { START_WINDOW_MS, extendBlocker, EXTEND_MAX } = require('../routes/ifLive');
const { postLandingWarning } = require('../services/landingPrompt');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const LAND_WARNING_MS = 60 * 60 * 1000;

const THRESHOLDS = [
  { hours: 1,  flag: 'warned1h' },
];

async function runIfLiveTimeWarning() {
  const label = '[if-live-time-warning]';
  try {
    const pb = await getAdminClient();
    const activeBids = await pb.collection('if_live_bids').getFullList({
      filter: 'status = "active"',
      requestKey: null,
    });

    let warningsSent = 0;
    const pilotCache = new Map();

    for (const bid of activeBids) {
      const legs = bid.legs || [];
      let changed = false;

      for (const leg of legs) {
        if (leg.pirepId || leg.expired || leg.startedAt || !leg.windowStartUtc) continue;

        const startBy = new Date(new Date(leg.windowStartUtc).getTime() + START_WINDOW_MS);
        const hoursLeft = (startBy - new Date()) / 3600000;
        if (hoursLeft <= 0) continue;

        // If the job was down and wakes with 20 minutes left, it still warns.
        for (const { hours, flag } of THRESHOLDS) {
          if (leg[flag] || hoursLeft > hours) continue;

          let pilot = pilotCache.get(bid.pilot);
          if (!pilot) {
            try {
              pilot = await pb.collection('users').getOne(bid.pilot, { requestKey: null });
              pilotCache.set(bid.pilot, pilot);
            } catch (err) {
              console.warn(`${label} couldn't load pilot ${bid.pilot} for bid ${bid.id}:`, err.message);
              break;
            }
          }

          await notifyBidTimeWarning({ pilot, leg, hoursLeft: hours, aircraftRegistration: bid.aircraft_registration, startByUtc: startBy.toISOString() }).catch(() => {});
          leg[flag] = true;
          changed = true;
          warningsSent++;
          break; // one warning per leg per tick is enough
        }
      }

      // 1 HOUR LEFT TO LAND
      for (let legIndex = 0; legIndex < legs.length; legIndex++) {
        const leg = legs[legIndex];
        if (leg.pirepId || leg.expired || !leg.startedAt || leg.landedPromptAt || leg.warnedLand1h || !leg.deadlineUtc) continue;
        const msLeft = new Date(leg.deadlineUtc).getTime() - Date.now();
        if (msLeft <= 0 || msLeft > LAND_WARNING_MS) continue;
        let pilot = pilotCache.get(bid.pilot);
        if (!pilot) {
          pilot = await pb.collection('users').getOne(bid.pilot, { requestKey: null }).catch(() => null);
          if (!pilot) continue;
          pilotCache.set(bid.pilot, pilot);
        }
        try {
          const blocker = await extendBlocker(pb, { ...bid, legs }, legIndex);
          const where = await postLandingWarning({ pilot, bid: { ...bid, legs }, legIndex, blocker, extendMax: EXTEND_MAX });
          Object.assign(leg, { warnedLand1h: true, landWarnChannelId: where.channelId, landWarnMessageId: where.messageId });
          changed = true;
          warningsSent++;
        } catch (err) {
          console.warn(`${label} couldn't post the landing warning for bid ${bid.id} leg ${legIndex}:`, err.message);
        }
      }

      if (changed) {
        // Re-read so a filing or extend in the meantime isn't undone
        const fresh = await pb.collection('if_live_bids').getOne(bid.id, { requestKey: null });
        const merged = (fresh.legs || []).map((l, i) => ({
          ...l,
          ...(legs[i]?.warned1h ? { warned1h: true } : {}),
          ...(legs[i]?.warnedLand1h && l.deadlineUtc === legs[i].deadlineUtc
            ? { warnedLand1h: true, landWarnChannelId: legs[i].landWarnChannelId, landWarnMessageId: legs[i].landWarnMessageId } : {}),
        }));
        await pb.collection('if_live_bids').update(bid.id, { legs: merged });
      }
    }

    if (warningsSent > 0) {
      console.log(`${label} sent ${warningsSent} warning(s)`);
    }
    return { warningsSent };
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { warningsSent: 0, error: err.message };
  }
}

function scheduleIfLiveTimeWarning() {
  console.log('[if-live-time-warning] scheduler registered — checks every 5 minutes');

  const run = () => {
    scheduleIfLiveTimeWarning._lastRun = new Date().toISOString();
    scheduleIfLiveTimeWarning._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
    runIfLiveTimeWarning();
  };

  scheduleIfLiveTimeWarning._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
  setInterval(run, CHECK_INTERVAL_MS);
  run();
}

module.exports = { scheduleIfLiveTimeWarning, runIfLiveTimeWarning };
