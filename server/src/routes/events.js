/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { escFilterValue } = require('../utils/pbFilter');
const { logAction } = require('../utils/audit');
const { getStaffPermissions, isDeveloperUser } = require('../middleware/auth');
const events = require('../services/events');
const { lookupAirport } = require('../utils/airports');
const { eventLive } = require('../services/eventLive');

const router = express.Router();

const PERM = 'events.manage';

function canSeeEvents(user) {
  return ['admin', 'staff', 'beta_tester'].includes(user?.role) || !!user?.staff_role || isDeveloperUser(user);
}
function requireEventsAccess(req, res, next) {
  requireAuth(req, res, () => {
    if (!canSeeEvents(req.user)) return res.status(403).json({ error: 'Events are in beta and not open to everyone yet' });
    next();
  });
}

// Same rule as requirePermission(PERM)
async function canManage(user) {
  if (user.role === 'admin' || isDeveloperUser(user)) return true;
  if (!user.staff_role) return false;
  return (await getStaffPermissions(user.staff_role) || []).includes(PERM);
}

const eventLocks = new Map();
function withEventLock(id, fn) {
  const prev = eventLocks.get(id) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => { if (eventLocks.get(id) === next) eventLocks.delete(id); });
  eventLocks.set(id, next);
  return next;
}

// A route's aircraft list: a JSON array of fleet names, a real array, or one name
function routeAircraft(route) {
  const raw = route?.aircraft;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const t = String(raw || '').trim();
  if (t.startsWith('[')) { try { return JSON.parse(t).filter(Boolean); } catch { return []; } }
  return t ? [t] : [];
}

function cleanEvent(body, { partial = false } = {}) {
  const out = {};
  const has = k => body[k] !== undefined;
  const err = msg => { const e = new Error(msg); e.status = 400; throw e; };

  if (!partial || has('title')) {
    const t = String(body.title || '').trim();
    if (!t) err('Give the event a title');
    out.title = t.slice(0, 120);
  }
  if (has('body')) out.body = String(body.body || '').slice(0, 10000);
  if (has('header_image')) out.header_image = String(body.header_image || '').slice(0, 500);
  if (!partial || has('start_at')) {
    const d = new Date(body.start_at);
    if (!body.start_at || isNaN(d)) err('Set when the event starts');
    out.start_at = d.toISOString();
  }
  if (has('end_at')) {
    if (!body.end_at) out.end_at = null;
    else {
      const d = new Date(body.end_at);
      if (isNaN(d)) err('The end time isn\'t a valid date');
      out.end_at = d.toISOString();
    }
  }
  if (!partial || has('route')) {
    const r = String(body.route || '').trim();
    if (!r) err('Choose a route');
    out.route = r;
  }
  if (!partial || has('aircraft')) {
    const a = String(body.aircraft || '').trim();
    if (!a) err('Choose an aircraft');
    out.aircraft = a.slice(0, 120);
  }
  if (has('gates')) {
    const list = Array.isArray(body.gates) ? body.gates : String(body.gates || '').split(/[\n,]/);
    const gates = [...new Set(list.map(g => String(g).trim().toUpperCase()).filter(Boolean))].slice(0, 200);
    out.gates = gates;
  }
  if (has('multiplier')) {
    const m = body.multiplier === '' || body.multiplier == null ? 1 : parseFloat(body.multiplier);
    if (!Number.isFinite(m) || m < 1 || m > 5) err('The multiplier has to be between 1 and 5');
    out.multiplier = Math.round(m * 100) / 100;
  }
  if (has('status')) {
    if (!['draft', 'published', 'cancelled'].includes(body.status)) err('Unknown status');
    out.status = body.status;
  }
  if (out.start_at && out.end_at && new Date(out.end_at) <= new Date(out.start_at)) err('The event has to end after it starts');
  return out;
}

async function applyRoute(pb, data, before = null) {
  const routeId = data.route || before?.route;
  if (!routeId) { const e = new Error('Choose a route'); e.status = 400; throw e; }
  const route = await pb.collection('routes').getOne(String(routeId), { requestKey: null }).catch(() => null);
  if (!route) { const e = new Error('That route no longer exists. Pick another one.'); e.status = 400; throw e; }
  const aircraft = data.aircraft !== undefined ? data.aircraft : before?.aircraft;
  const allowed = routeAircraft(route);
  if (allowed.length && !allowed.includes(aircraft)) {
    const e = new Error(`${route.flight_number} isn't flown with ${aircraft || 'that aircraft'}. Pick one of its aircraft.`); e.status = 400; throw e;
  }
  return {
    ...data,
    route: route.id,
    flight_number: String(route.flight_number || '').toUpperCase().slice(0, 12),
    departure_icao: String(route.departure_icao || '').toUpperCase(),
    arrival_icao: String(route.arrival_icao || '').toUpperCase(),
  };
}

// { icao, city, lat, lng } for the event page's map, or just the code
function airportInfo(icao) {
  const a = lookupAirport(icao);
  return a ? { icao, city: a.city ? a.city.replace(/\s*\(.*\)\s*$/, '') : null, lat: a.lat, lng: a.lng } : { icao, city: null, lat: null, lng: null };
}

function serializeEvent(ev, { regs = null, me = null, myFlight = null } = {}) {
  const gates = events.parseGates(ev.gates);
  const window = events.filingWindow(ev);
  return {
    id: ev.id,
    title: ev.title,
    body: ev.body || '',
    header_image: ev.header_image || '',
    start_at: ev.start_at,
    end_at: ev.end_at || null,
    route: ev.route || '',
    flight_number: ev.flight_number || '',
    departure_icao: ev.departure_icao,
    arrival_icao: ev.arrival_icao,
    departure: airportInfo(ev.departure_icao),
    arrival: airportInfo(ev.arrival_icao),
    aircraft: ev.aircraft,
    gates,
    multiplier: ev.multiplier || 1,
    status: ev.status,
    created: ev.created,
    filing: window,
    ...(regs ? {
      registrations: regs.map(r => ({
        id: r.id,
        gate: r.gate || '',
        user: r.expand?.user ? {
          id: r.expand.user.id,
          name: events.pilotName(r.expand.user),
          first_name: r.expand.user.first_name || '',
          callsign: r.expand.user.callsign || '',
          ifc_username: r.expand.user.ifc_username || '', // for the avatar (components/UserAvatar.js)
          rank: r.expand.user.expand?.rank?.name || '',
        } : null,
        isMe: !!me && r.user === me,
        created: r.created,
        landed_at: r.landed_at ? new Date(String(r.landed_at).replace(' ', 'T')).toISOString() : null,
      })),
      takenGates: regs.map(r => r.gate).filter(Boolean),
    } : {}),
    ...(me !== null ? {
      myRegistration: regs ? (regs.find(r => r.user === me) ? { id: regs.find(r => r.user === me).id, gate: regs.find(r => r.user === me).gate || '' } : null) : undefined,
      myFlight: myFlight ? { id: myFlight.id, status: myFlight.status, flight_time: myFlight.flight_time, date: myFlight.date } : null,
    } : {}),
  };
}

async function loadEvent(pb, id) {
  return pb.collection('events').getOne(String(id), { requestKey: null }).catch(() => null);
}

async function myEventFlight(pb, eventId, userId) {
  return pb.collection('flights').getFirstListItem(
    `event = "${escFilterValue(eventId)}" && user = "${escFilterValue(userId)}" && status != "rejected"`,
    { sort: '-created', requestKey: null },
  ).catch(() => null);
}

// Pilots

router.get('/', requireEventsAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const all = req.query.all === '1' && await canManage(req.user);
    const list = await pb.collection('events').getFullList({
      filter: all ? '' : 'status = "published"', sort: '-start_at', requestKey: null,
    });
    const ids = list.map(e => e.id);
    const regs = ids.length ? await pb.collection('event_registrations').getFullList({
      filter: ids.map(id => `event = "${escFilterValue(id)}"`).join(' || '), fields: 'id,event,user,gate', requestKey: null,
    }) : [];
    // Events this pilot has already logged (File PIREP hides their Log event button)
    const logged = new Set((await pb.collection('flights').getFullList({
      filter: `user = "${escFilterValue(req.user.id)}" && event != "" && status != "rejected"`, fields: 'event', requestKey: null,
    }).catch(() => [])).map(f => f.event));
    res.json({
      canManage: await canManage(req.user),
      events: list.map(ev => {
        const mine = regs.filter(r => r.event === ev.id);
        const s = serializeEvent(ev);
        const me = mine.find(r => r.user === req.user.id);
        return {
          ...s, registrationCount: mine.length, takenGates: mine.map(r => r.gate).filter(Boolean),
          myRegistration: me ? { id: me.id, gate: me.gate || '' } : null, myLogged: logged.has(ev.id),
        };
      }),
    });
  } catch (err) {
    console.error('[events] list', err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.get('/:id', requireEventsAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const ev = await loadEvent(pb, req.params.id);
    if (!ev || (ev.status === 'draft' && !await canManage(req.user))) return res.status(404).json({ error: 'Event not found' });
    const [regs, flight] = await Promise.all([events.registrationsFor(pb, ev.id), myEventFlight(pb, ev.id, req.user.id)]);
    res.json({ event: serializeEvent(ev, { regs, me: req.user.id, myFlight: flight }), canManage: await canManage(req.user) });
  } catch (err) {
    console.error('[events] get', err);
    res.status(500).json({ error: 'Failed to load the event' });
  }
});

router.get('/:id/live', requireEventsAccess, async (req, res) => {
  try {
    res.json(await eventLive(req.params.id));
  } catch (err) {
    console.error('[events] live', err.message);
    res.json({ active: false, pilots: [], error: 'Live positions are unavailable right now' });
  }
});

router.post('/:id/register', requireEventsAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { fields: 'id,status', requestKey: null });
    if (user.status !== 'approved') return res.status(403).json({ error: 'Only active pilots can sign up for events' });

    const result = await withEventLock(req.params.id, async () => {
      const ev = await loadEvent(pb, req.params.id);
      if (!ev || ev.status !== 'published') return { status: 404, error: 'Event not found' };
      if (events.eventEnd(ev) < Date.now()) return { status: 400, error: 'This event has finished' };
      const gates = events.parseGates(ev.gates);
      const gate = String(req.body?.gate || '').trim().toUpperCase();
      if (gates.length && !gates.includes(gate)) return { status: 400, error: 'Pick one of the event\'s gates' };

      const regs = await events.registrationsFor(pb, ev.id);
      const mine = regs.find(r => r.user === req.user.id);
      if (gate && regs.some(r => r.gate === gate && r.user !== req.user.id)) return { status: 409, error: `Gate ${gate} has just been taken. Pick another one.` };
      if (mine) {
        if ((mine.gate || '') === gate) return { ev, reg: mine };
        const reg = await pb.collection('event_registrations').update(mine.id, { gate });
        return { ev, reg, moved: true };
      }
      const reg = await pb.collection('event_registrations').create({ event: ev.id, user: req.user.id, gate });
      return { ev, reg };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });

    events.syncDiscord(result.ev, { pb }).catch(() => {});
    res.status(result.moved ? 200 : 201).json({ registration: { id: result.reg.id, gate: result.reg.gate || '' } });
  } catch (err) {
    console.error('[events] register', err);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

router.delete('/:id/register', requireEventsAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const result = await withEventLock(req.params.id, async () => {
      const ev = await loadEvent(pb, req.params.id);
      if (!ev) return { status: 404, error: 'Event not found' };
      const reg = await pb.collection('event_registrations').getFirstListItem(
        `event = "${escFilterValue(ev.id)}" && user = "${escFilterValue(req.user.id)}"`, { requestKey: null },
      ).catch(() => null);
      if (!reg) return { status: 404, error: 'You\'re not signed up for this event' };
      if (await myEventFlight(pb, ev.id, req.user.id)) return { status: 400, error: 'You\'ve already logged this event, so you can\'t drop out' };
      await pb.collection('event_registrations').delete(reg.id);
      return { ev };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    events.syncDiscord(result.ev, { pb }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[events] deregister', err);
    res.status(500).json({ error: 'Failed to drop out' });
  }
});

// Staff

router.post('/', requirePermission(PERM), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const data = await applyRoute(pb, cleanEvent(req.body));
    const ev = await pb.collection('events').create({
      gates: [], multiplier: 1, body: '', header_image: '', flight_number: '', status: 'draft',
      ...data, created_by: req.user.id,
    });
    logAction(req.user, 'event.created', { id: ev.id, name: ev.title }, { status: ev.status });
    if (ev.status === 'published') await events.syncDiscord(ev, { pb });
    res.status(201).json({ event: serializeEvent(ev) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[events] create', err);
    res.status(500).json({ error: 'Failed to create the event' });
  }
});

router.patch('/:id', requirePermission(PERM), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const before = await loadEvent(pb, req.params.id);
    if (!before) return res.status(404).json({ error: 'Event not found' });
    let data = cleanEvent(req.body, { partial: true });
    if (data.route !== undefined || data.aircraft !== undefined) data = await applyRoute(pb, data, before);
    const start = data.start_at || before.start_at, end = data.end_at !== undefined ? data.end_at : before.end_at;
    if (end && new Date(end) <= new Date(start)) return res.status(400).json({ error: 'The event has to end after it starts' });
    if (data.gates) {
      // A gate someone holds can't be removed out from under them
      const regs = await events.registrationsFor(pb, before.id);
      const lost = regs.filter(r => r.gate && !data.gates.includes(r.gate));
      if (lost.length) return res.status(400).json({ error: `Gate${lost.length > 1 ? 's' : ''} ${lost.map(r => r.gate).join(', ')} ${lost.length > 1 ? 'are' : 'is'} taken. Remove ${lost.length > 1 ? 'those sign-ups' : 'that sign-up'} first.` });
    }
    const ev = await pb.collection('events').update(before.id, data);
    logAction(req.user, 'event.updated', { id: ev.id, name: ev.title }, { fields: Object.keys(data).join(', ') });
    await events.syncDiscord(ev, { pb });
    res.json({ event: serializeEvent(ev) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[events] update', err);
    res.status(500).json({ error: 'Failed to save the event' });
  }
});

router.delete('/:id', requirePermission(PERM), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const ev = await loadEvent(pb, req.params.id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    const logged = await pb.collection('flights').getList(1, 1, { filter: `event = "${escFilterValue(ev.id)}"`, requestKey: null });
    if (logged.totalItems) return res.status(400).json({ error: `${logged.totalItems} PIREP${logged.totalItems > 1 ? 's are' : ' is'} logged against this event. Cancel it instead, so they keep their EVENT tag.` });
    await events.deleteDiscordMessage(ev);
    await pb.collection('events').delete(ev.id); // sign-ups go with it (cascade)
    logAction(req.user, 'event.deleted', { id: ev.id, name: ev.title });
    res.json({ ok: true });
  } catch (err) {
    console.error('[events] delete', err);
    res.status(500).json({ error: 'Failed to delete the event' });
  }
});

router.delete('/:id/registrations/:regId', requirePermission(PERM), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const reg = await pb.collection('event_registrations').getOne(req.params.regId, { expand: 'user', requestKey: null }).catch(() => null);
    if (!reg || reg.event !== req.params.id) return res.status(404).json({ error: 'Sign-up not found' });
    await pb.collection('event_registrations').delete(reg.id);
    const ev = await loadEvent(pb, req.params.id);
    logAction(req.user, 'event.registration_removed', { id: ev?.id, name: ev?.title }, { pilot: events.pilotName(reg.expand?.user), gate: reg.gate || '' });
    if (ev) events.syncDiscord(ev, { pb }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[events] remove registration', err);
    res.status(500).json({ error: 'Failed to remove the sign-up' });
  }
});

module.exports = router;
module.exports.cleanEvent = cleanEvent; // for tests
module.exports.canSeeEvents = canSeeEvents;
module.exports.routeAircraft = routeAircraft;
module.exports.applyRoute = applyRoute;
