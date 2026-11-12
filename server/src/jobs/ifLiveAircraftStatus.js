/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { setAircraftStatus, getAircraftStatus, clearAircraftStatus } = require('../routes/ifLive');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour
const IF_BASE = 'https://api.infiniteflight.com/public/v2';

async function getExpertServerFlights() {
  const sessRes = await fetch(`${IF_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
  const sessData = await sessRes.json();
  if (sessData.errorCode !== 0) throw new Error(`IF sessions error ${sessData.errorCode}`);
  const expert = (sessData.result || []).find(s => s.name === 'Expert Server' || s.name === 'Expert');
  if (!expert) return [];

  const flightRes = await fetch(`${IF_BASE}/sessions/${expert.id}/flights?apikey=${process.env.IF_API_KEY}`);
  const flightData = await flightRes.json();
  if (flightData.errorCode !== 0) throw new Error(`IF flights error ${flightData.errorCode}`);
  return flightData.result || [];
}

async function runIfLiveAircraftStatus() {
  const label = '[if-live-aircraft-status]';
  try {
    const pb = await getAdminClient();

    const activeBids = await pb.collection('if_live_bids').getFullList({
      filter: 'status = "active"',
      requestKey: null,
    });

    const candidates = [];
    for (const bid of activeBids) {
      for (const leg of (bid.legs || [])) {
        if (leg.pirepId || leg.expired || !leg.ifScheduleId) continue;
        candidates.push({ bid, leg });
      }
    }

    const previouslyFlagged = new Set(
      [...new Set(candidates.map(c => c.bid.aircraft_id))].filter(id => getAircraftStatus(id))
    );

    if (candidates.length === 0) return { matched: 0, cleared: 0, errors: 0 };

    let flights;
    try {
      flights = await getExpertServerFlights();
    } catch (err) {
      console.warn(`${label} couldn't fetch Expert Server flights:`, err.message);
      return { matched: 0, cleared: 0, errors: 1 };
    }

    const pilotCache = new Map(); // userId -> user record
    let matched = 0, cleared = 0;
    const matchedAircraftIds = new Set();

    for (const { bid, leg } of candidates) {
      let pilot = pilotCache.get(bid.pilot);
      if (pilot === undefined) {
        try {
          pilot = await pb.collection('users').getOne(bid.pilot, { requestKey: null });
        } catch (err) {
          pilot = null;
        }
        pilotCache.set(bid.pilot, pilot);
      }
      if (!pilot?.if_user_id) continue;

      const liveFlight = flights.find(f => f.flightId === bid.aircraft_id)
        || flights.find(f => f.userId === pilot.if_user_id && f.callsign === leg.flightNumber);
      if (!liveFlight) continue;

      setAircraftStatus(bid.aircraft_id, {
        state: 2,
        altitude: liveFlight.altitude,
        speed: liveFlight.speed,
      });
      matchedAircraftIds.add(bid.aircraft_id);
      matched++;
    }

    for (const aircraftId of previouslyFlagged) {
      if (!matchedAircraftIds.has(aircraftId)) {
        clearAircraftStatus(aircraftId);
        cleared++;
      }
    }

    if (matched > 0 || cleared > 0) console.log(`${label} ${matched} aircraft in flight, ${cleared} cleared`);
    return { matched, cleared, errors: 0 };
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { matched: 0, cleared: 0, errors: 1, error: err.message };
  }
}

function scheduleIfLiveAircraftStatus() {
  console.log('[if-live-aircraft-status] scheduler registered — checks every hour');

  const run = () => {
    scheduleIfLiveAircraftStatus._lastRun = new Date().toISOString();
    scheduleIfLiveAircraftStatus._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
    runIfLiveAircraftStatus();
  };

  scheduleIfLiveAircraftStatus._nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
  setInterval(run, CHECK_INTERVAL_MS);
  run();
}

module.exports = { scheduleIfLiveAircraftStatus, runIfLiveAircraftStatus };
