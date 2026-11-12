/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { escFilterValue } = require('../utils/pbFilter');
const { lookupAirport } = require('../utils/airports');
const { pilotName, syncDiscord } = require('./events');

const LIVE_TTL_MS = 15 * 1000;
const BEFORE_MS = 2 * 60 * 60 * 1000;
const AFTER_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LENGTH_MS = 12 * 60 * 60 * 1000;

const R = Math.PI / 180;
function nmBetween(a, b) {
  const [l1, o1, l2, o2] = [a[0] * R, a[1] * R, b[0] * R, b[1] * R];
  const h = Math.sin((l2 - l1) / 2) ** 2 + Math.cos(l1) * Math.cos(l2) * Math.sin((o2 - o1) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * 3440.065;
}

function progressFor(dep, arr, pos, speedKts) {
  const fromDep = nmBetween(dep, pos), toArr = nmBetween(pos, arr);
  const progress = fromDep + toArr > 0 ? Math.min(1, Math.max(0, fromDep / (fromDep + toArr))) : 0;
  const slow = speedKts < 40;
  let phase;
  if (slow && fromDep < 8) phase = speedKts < 3 ? 'At gate' : 'Taxiing';
  else if (slow && toArr < 8) phase = speedKts < 3 ? 'Landed' : 'Taxiing in';
  else if (toArr < 40) phase = 'Arriving';
  else if (fromDep < 40) phase = 'Departing';
  else phase = 'En route';
  return { progress: Math.round(progress * 1000) / 1000, phase, toGoNm: Math.round(toArr) };
}

const ICAO = /^[A-Z]{4}$/;
function planMatches(plan, dep, arr) {
  if (!plan || plan.to !== arr) return false;
  return plan.from === dep || !ICAO.test(plan.from);
}

function inWindow(ev, now = Date.now()) {
  const start = new Date(ev.start_at).getTime();
  const end = ev.end_at ? new Date(ev.end_at).getTime() : start + DEFAULT_LENGTH_MS;
  return ev.status === 'published' && now >= start - BEFORE_MS && now <= end + AFTER_MS;
}

const cache = new Map(); // eventId -> { data, expires, pending }

const lastSeen = new Map();
const SHORT_FINAL_NM = 10;
const SHORT_FINAL_FT = 4000;
const LAST_SEEN_FOR_MS = 10 * 60 * 1000;

const pbDate = ms => new Date(ms).toISOString().replace('T', ' ');
const iso = d => (d ? new Date(String(d).replace(' ', 'T')).toISOString() : null);

async function build(eventId) {
  const pb = await getAdminClient();
  const ev = await pb.collection('events').getOne(String(eventId), { requestKey: null }).catch(() => null);
  if (!ev) return { active: false, pilots: [] };
  if (!inWindow(ev)) return { active: false, pilots: [] };

  const regs = await pb.collection('event_registrations').getFullList({
    filter: `event = "${escFilterValue(ev.id)}"`, expand: 'user', requestKey: null,
  });
  const newlyLanded = [];
  const markLanded = async (r, at, how) => {
    await pb.collection('event_registrations').update(r.id, { landed_at: at }).catch(err => console.warn('[eventLive] landing save failed:', err.message));
    r.landed_at = at;
    newlyLanded.push(`${pilotName(r.expand?.user)} (${how})`);
  };

  const waiting = regs.filter(r => !r.landed_at);
  if (waiting.length) {
    const since = new Date(ev.start_at).getTime() - BEFORE_MS;
    const pireps = await pb.collection('flights').getFullList({
      filter: `departure_icao = "${escFilterValue(ev.departure_icao)}" && arrival_icao = "${escFilterValue(ev.arrival_icao)}"`
        + ` && status != "rejected" && created >= "${pbDate(since)}"`
        + ` && (${waiting.map(r => `user = "${escFilterValue(r.user)}"`).join(' || ')})`,
      fields: 'user,created', sort: 'created', requestKey: null,
    }).catch(() => []);
    for (const r of waiting) {
      const f = pireps.find(x => x.user === r.user);
      if (f) await markLanded(r, iso(f.created), 'PIREP filed');
    }
  }

  const linked = regs.filter(r => r.expand?.user?.if_user_id);
  // Landings already recorded stay "Landed" after the pilot leaves the server
  const landedOnly = r => ({ userId: r.user, name: pilotName(r.expand?.user), gate: r.gate || '', status: 'landed', landedAt: iso(r.landed_at) });
  if (!linked.length) return { active: true, pilots: regs.filter(r => r.landed_at).map(landedOnly) };

  // Late require: routes/livemap.js is a router module with its own state
  const { expertFlights, flightPlanEnds, fleetList } = require('../routes/livemap');
  const [{ expert, flights }, fleet] = await Promise.all([expertFlights(), fleetList()]);
  if (!expert) return { active: true, serverOnline: false, pilots: [] };

  const records = fleet.filter(f => f.name === ev.aircraft);
  const liveryIds = new Set(records.map(f => f.livery_id).filter(Boolean));
  const aircraftIds = new Set(records.filter(f => !f.livery_id).map(f => f.aircraft_id).filter(Boolean));
  const rightAircraft = f => liveryIds.has(f.liveryId) || aircraftIds.has(f.aircraftId);

  const depA = lookupAirport(ev.departure_icao), arrA = lookupAirport(ev.arrival_icao);
  const dep = depA ? [depA.lat, depA.lng] : null, arr = arrA ? [arrA.lat, arrA.lng] : null;

  const byIfUser = new Map();
  for (const f of flights) if (f.userId) (byIfUser.get(f.userId) || byIfUser.set(f.userId, []).get(f.userId)).push(f);

  const pilots = [];
  for (const r of linked) {
    const u = r.expand.user;
    const seenKey = `${ev.id}:${u.id}`;
    const candidates = (byIfUser.get(u.if_user_id) || []).filter(rightAircraft);
    if (!candidates.length) {
      const seen = lastSeen.get(seenKey);
      if (!r.landed_at && seen && Date.now() - seen.at < LAST_SEEN_FOR_MS && seen.toGoNm <= SHORT_FINAL_NM && seen.altitude < SHORT_FINAL_FT) {
        await markLanded(r, new Date(seen.at).toISOString(), 'left the server on short final');
      }
      lastSeen.delete(seenKey);
      if (r.landed_at) pilots.push(landedOnly(r));
      continue;
    }
    let matched = null, noPlan = false;
    for (const f of candidates) {
      const plan = await flightPlanEnds(expert.id, f.flightId);
      if (!plan) { noPlan = true; continue; }
      if (planMatches(plan, ev.departure_icao, ev.arrival_icao)) { matched = f; break; }
    }
    const base = { userId: u.id, name: pilotName(u), gate: r.gate || '', landedAt: iso(r.landed_at) };
    if (!matched) {
      if (r.landed_at) pilots.push(landedOnly(r));
      else if (noPlan) pilots.push({ ...base, status: 'no_plan' });
      continue;
    }
    const pos = [matched.latitude, matched.longitude];
    const speed = Math.round(matched.speed || 0);
    const prog = dep && arr ? progressFor(dep, arr, pos, speed) : { progress: null, phase: 'En route' };
    // On the ground at the arrival: record the landing once
    if (!r.landed_at && (prog.phase === 'Landed' || prog.phase === 'Taxiing in')) {
      await markLanded(r, new Date().toISOString(), 'on the ground at the arrival');
      base.landedAt = iso(r.landed_at);
    }
    if (prog.toGoNm != null) lastSeen.set(seenKey, { toGoNm: prog.toGoNm, altitude: Math.round(matched.altitude || 0), at: Date.now() });
    pilots.push({
      ...base,
      status: 'flying',
      lat: matched.latitude,
      lng: matched.longitude,
      heading: Math.round(matched.track || matched.heading || 0),
      altitude: Math.round(matched.altitude || 0),
      speed,
      ...prog,
    });
  }
  // Signed up, not linked to IF, but landed earlier: keep them listed
  for (const r of regs) if (!r.expand?.user?.if_user_id && r.landed_at) pilots.push(landedOnly(r));
  if (newlyLanded.length) {
    console.log(`[eventLive] ${ev.title}: landed ${newlyLanded.join(', ')}`);
    syncDiscord(ev, { pb }).catch(() => {}); // the gate list now says Landed next to them
  }
  return { active: true, serverOnline: true, pilots, updated: new Date().toISOString() };
}

async function eventLive(eventId) {
  const now = Date.now();
  for (const [k, v] of cache) if (now > v.expires + 60 * 1000 && !v.pending) cache.delete(k);
  const hit = cache.get(eventId);
  if (hit && now < hit.expires) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = build(eventId)
    .then(data => { cache.set(eventId, { data, expires: Date.now() + LIVE_TTL_MS }); return data; })
    .catch(err => {
      cache.delete(eventId);
      if (hit?.data) return hit.data; // keep showing the last good positions
      throw err;
    });
  cache.set(eventId, { ...hit, pending });
  return pending;
}

module.exports = { eventLive, progressFor, inWindow, planMatches };
