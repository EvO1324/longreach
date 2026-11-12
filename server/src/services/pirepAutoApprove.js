/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

async function tryAutoApprove(pb, flight, user, opts = {}) {
  // Returns { matched: bool, checks: [...], bestCandidate: obj|null }
  const skipDateWindow = !!opts.skipDateWindow;
  const maxAgeHours    = opts.maxAgeHours || null;
  const maxAgeMs        = maxAgeHours ? maxAgeHours * 60 * 60 * 1000 : null;
  const excludeCreated  = opts.excludeCreated || null;

  let windowHours = 36;
  if (!skipDateWindow) {
    const enabled = await pb.collection('settings').getFirstListItem('key = "auto_approve_enabled"', { requestKey: null }).catch(() => null);
    if (enabled?.value === 'false') {
      return { matched: false, reason: 'disabled', checks: [{ key: 'enabled', label: 'Auto-approve', passed: false, detail: 'Switched off in Admin › Site settings' }], bestCandidate: null };
    }
    try {
      const wSetting = await pb.collection('settings').getFirstListItem('key = "auto_approve_window_hours"', { requestKey: null });
      const parsed = parseInt(wSetting?.value, 10);
      if (!isNaN(parsed) && parsed > 0) windowHours = parsed;
    } catch { }
  }

  const dateLabel = skipDateWindow ? 'Date check (skipped for Live flights)' : `Date within ${windowHours}h window`;

  const fail = (reason, checks = []) => ({ matched: false, reason, checks, bestCandidate: null });

  if (!user.if_user_id) {
    console.log('[auto-approve] no if_user_id for user', user.id);
    return fail('no_if_linked', [
      { key: 'if_linked',   label: 'IF account linked',         passed: false, detail: 'No Infinite Flight user ID on this pilot account' },
      { key: 'route',       label: 'Route match',               passed: null  },
      { key: 'date',        label: dateLabel,  passed: null  },
      { key: 'aircraft',    label: 'Aircraft / livery match',   passed: null  },
    ]);
  }
  if (!process.env.IF_API_KEY) {
    console.log('[auto-approve] no IF_API_KEY configured');
    return fail('no_api_key', [
      { key: 'if_linked',   label: 'IF account linked',         passed: true  },
      { key: 'route',       label: 'Route match',               passed: null  },
      { key: 'date',        label: dateLabel,  passed: null  },
      { key: 'aircraft',    label: 'Aircraft / livery match',   passed: null, detail: 'IF_API_KEY not configured on server' },
    ]);
  }

  try {
    console.log(`[auto-approve] fetching IF logbook for user ${user.if_user_id}`);
    const res = await fetch(
      `${IF_BASE}/users/${user.if_user_id}/flights?page=1&apikey=${process.env.IF_API_KEY}`
    );
    const data = await res.json();

    if (data.errorCode !== 0) {
      console.log('[auto-approve] IF API error code:', data.errorCode);
      return fail('if_api_error', [
        { key: 'if_linked',  label: 'IF account linked',        passed: true },
        { key: 'route',      label: 'Route match',              passed: null, detail: `IF API returned error code ${data.errorCode}` },
        { key: 'date',       label: dateLabel, passed: null },
        { key: 'aircraft',   label: 'Aircraft / livery match',  passed: null },
      ]);
    }
    if (!data.result?.data?.length) {
      console.log('[auto-approve] no IF flights found');
      return fail('no_if_flights', [
        { key: 'if_linked',  label: 'IF account linked',        passed: true },
        { key: 'route',      label: 'Route match',              passed: false, detail: 'No recent flights found in IF logbook' },
        { key: 'date',       label: dateLabel, passed: null },
        { key: 'aircraft',   label: 'Aircraft / livery match',  passed: null },
      ]);
    }

    const pirepDate = new Date();
    const windowMs = windowHours * 60 * 60 * 1000;

    const fleetItems = opts.fleetItems || await pb.collection('fleet').getFullList({
      requestKey: null,
      fields: 'name,aircraft_id,livery_id',
    });
    const fleetMatch = fleetItems.find(f => f.name === flight.aircraft);

    const exactAircraftId = opts.exactAircraftId || null;
    const exactLiveryId   = opts.exactLiveryId   || null;
    const hasExactAircraftCheck = !!(exactAircraftId || exactLiveryId);

    // Track the closest failing candidate for diagnostics
    let bestCandidate = null;
    let bestScore = -1;

    for (const ifFlight of data.result.data) {
      const landingStats = ifFlight.landingStats || [];
      const lastLanding  = landingStats.length ? landingStats[landingStats.length - 1] : null;
      const ifDate   = lastLanding?.timestamp ? new Date(lastLanding.timestamp) : new Date(ifFlight.created);
      const diffMs   = Math.abs(ifDate - pirepDate);
      const daysDiff = diffMs / (1000 * 60 * 60 * 24);

      const depMatch  = ifFlight.originAirport      === flight.departure_icao;
      const arrMatch  = ifFlight.destinationAirport === flight.arrival_icao;
      const dateMatch = skipDateWindow
        ? (maxAgeMs ? diffMs <= maxAgeMs : true)
        : diffMs <= windowMs;

      let acMatch = true; // default true if no fleet entry and no exact id supplied
      let acDetail = fleetMatch ? null : 'No fleet entry for this aircraft — skipping aircraft check';
      if (hasExactAircraftCheck) {
        const liveryOk   = exactLiveryId   && ifFlight.liveryId   === exactLiveryId;
        const aircraftOk = exactAircraftId && ifFlight.aircraftId === exactAircraftId;
        acMatch = !!(liveryOk || aircraftOk);
        acDetail = acMatch
          ? (liveryOk ? 'Matched by livery ID (exact, from booking)' : 'Matched by aircraft ID (exact, from booking)')
          : `IF: aircraft=${ifFlight.aircraftId} livery=${ifFlight.liveryId} | Expected: aircraft=${exactAircraftId} livery=${exactLiveryId}`;
      } else if (fleetMatch) {
        const liveryOk   = fleetMatch.livery_id   && ifFlight.liveryId   === fleetMatch.livery_id;
        const aircraftOk = fleetMatch.aircraft_id && ifFlight.aircraftId === fleetMatch.aircraft_id;
        acMatch = !!(liveryOk || aircraftOk);
        if (!acMatch) {
          acDetail = `IF: aircraft=${ifFlight.aircraftId} livery=${ifFlight.liveryId} | Expected: aircraft=${fleetMatch.aircraft_id} livery=${fleetMatch.livery_id}`;
        } else {
          acDetail = liveryOk ? 'Matched by livery ID' : 'Matched by aircraft ID';
        }
      }

      const score = (depMatch ? 2 : 0) + (arrMatch ? 2 : 0) + (dateMatch ? 1 : 0) + (acMatch ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = {
          originAirport:      ifFlight.originAirport,
          destinationAirport: ifFlight.destinationAirport,
          created:            ifFlight.created,
          aircraftId:         ifFlight.aircraftId,
          liveryId:           ifFlight.liveryId,
          worldType:          ifFlight.worldType,
          totalTime:          ifFlight.totalTime,
          daysDiff:           parseFloat(daysDiff.toFixed(1)),
          checks: {
            dep:      depMatch,
            arr:      arrMatch,
            date:     dateMatch,
            aircraft: acMatch,
            acDetail,
          },
        };
      }

      const rawMins  = flight.flight_time
        ? Math.round((flight.flight_time / ((flight.multiplier_value > 1 ? flight.multiplier_value : 1))) * 60)
        : null;
      const ifMins   = Math.round(ifFlight.totalTime);
      const timeDiff = rawMins !== null ? Math.abs(rawMins - ifMins) : null;
      const timeMatch = rawMins === null || timeDiff <= 10;
      const timeDetail = rawMins !== null
        ? `Submitted: ${Math.floor(rawMins/60)}h ${rawMins%60}m — IF: ${Math.floor(ifMins/60)}h ${ifMins%60}m (${timeDiff} min diff)`
        : 'No flight time submitted yet';

      // Update bestCandidate with time check info
      if (bestCandidate && bestCandidate.totalTime === ifFlight.totalTime) {
        bestCandidate.checks.time      = timeMatch;
        bestCandidate.checks.timeDetail = timeDetail;
        bestCandidate.timeDiff          = timeDiff;
      }

      if (!depMatch || !arrMatch || !dateMatch) continue;
      if (!acMatch) {
        console.log(`[auto-approve] aircraft mismatch: ${acDetail}`);
        continue;
      }
      if (!timeMatch) {
        console.log(`[auto-approve] flight time mismatch: ${timeDetail}`);
        continue;
      }
      if (excludeCreated && excludeCreated.has(ifFlight.created)) {
        console.log(`[auto-approve] skipping otherwise-matching flight — already claimed by another leg (created=${ifFlight.created})`);
        continue;
      }

      const fuelUsedKg   = ifFlight.fuelUsedKg   ?? null;
      console.log(`[auto-approve] landings: ${landingStats.length}, fuel: ${fuelUsedKg}kg`);

      console.log('[auto-approve] MATCH FOUND — auto-approving');
      return {
        matched: true,
        reason: 'match',
        bestCandidate,
        landingStats,
        fuelUsedKg,
        checks: [
          { key: 'if_linked',  label: 'IF account linked',        passed: true },
          { key: 'route',      label: 'Route match',              passed: true,  detail: `${ifFlight.originAirport} → ${ifFlight.destinationAirport}` },
          { key: 'date',       label: dateLabel, passed: true,  detail: `${daysDiff.toFixed(1)} days apart` },
          { key: 'aircraft',   label: 'Aircraft / livery match',  passed: true,  detail: acDetail },
          { key: 'flight_time', label: 'Flight time within 10 min', passed: true, detail: timeDetail },
        ],
      };
    }

    // Build checklist from the best candidate found
    const bc = bestCandidate;
    const checks = [
      { key: 'if_linked',  label: 'IF account linked',        passed: true },
      { key: 'route',      label: 'Route match',              passed: bc ? (bc.checks.dep && bc.checks.arr) : false,
        detail: bc ? `Best candidate: ${bc.originAirport} → ${bc.destinationAirport}` : 'No matching route found in recent flights' },
      { key: 'date',       label: dateLabel, passed: bc ? bc.checks.date : false,
        detail: bc ? `${bc.daysDiff} days apart` : null },
      { key: 'aircraft',   label: 'Aircraft / livery match',  passed: bc ? bc.checks.aircraft : null,
        detail: bc ? bc.checks.acDetail : 'No route match to check aircraft against' },
      { key: 'flight_time', label: 'Flight time within 10 min', passed: bc?.checks?.time ?? null,
        detail: bc?.checks?.timeDetail || null },
    ];

    if (bc) {
      console.log(
        `[auto-approve] no matching IF flight found — closest candidate: ` +
        `${bc.originAirport}->${bc.destinationAirport} (expected ${flight.departure_icao}->${flight.arrival_icao}), ` +
        `dep=${bc.checks.dep} arr=${bc.checks.arr} date=${bc.checks.date} (${bc.daysDiff}d apart, window=${skipDateWindow ? (maxAgeHours ? `${maxAgeHours}h cap` : 'none') : `${windowHours}h`}), ` +
        `aircraft=${bc.checks.aircraft} [${bc.checks.acDetail}]`
      );
    } else {
      console.log(`[auto-approve] no matching IF flight found — no candidates scored (expected ${flight.departure_icao}->${flight.arrival_icao})`);
    }
    return { matched: false, reason: 'no_match', checks, bestCandidate: bc };
  } catch (err) {
    console.warn('[auto-approve] IF check failed:', err.message);
    return fail('exception', [
      { key: 'if_linked',  label: 'IF account linked',        passed: true },
      { key: 'route',      label: 'Route match',              passed: null, detail: `Error: ${err.message}` },
      { key: 'date',       label: dateLabel, passed: null },
      { key: 'aircraft',   label: 'Aircraft / livery match',  passed: null },
    ]);
  }
}

module.exports = { tryAutoApprove, IF_BASE };
