/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const { filingWindow, discordPayload, parseGates } = require('./events');
const { cleanEvent, routeAircraft } = require('../routes/events');

const HOUR = 3600 * 1000;
const base = { id: 'ev1', title: 'Sydney Shuttle', status: 'published', start_at: '2026-11-20T09:00:00.000Z', end_at: '2026-11-20T12:00:00.000Z', departure_icao: 'YSSY', arrival_icao: 'YMML', aircraft: 'Boeing 737-800 - Qantas', gates: ['A1', 'A2', 'B1'], multiplier: 2 };

test('cleanEvent normalises a new event', () => {
  const e = cleanEvent({ title: '  Shuttle ', start_at: '2026-11-20T09:00:00Z', route: 'r1', aircraft: 'Boeing 737-800 - Qantas', gates: 'a1, a2\nA1\n b1 ', multiplier: '1.5', departure_icao: 'XXXX' });
  assert.equal(e.title, 'Shuttle');
  assert.equal(e.route, 'r1');
  assert.equal(e.departure_icao, undefined); // the route sets these (applyRoute), not the form
  assert.deepEqual(e.gates, ['A1', 'A2', 'B1']); // upper-cased, duplicates dropped
  assert.equal(e.multiplier, 1.5);
});

test('cleanEvent refuses what would break the event', () => {
  const ok = { title: 'x', start_at: '2026-11-20T09:00:00Z', route: 'r1', aircraft: 'A' };
  assert.throws(() => cleanEvent({ ...ok, title: ' ' }), /title/);
  assert.throws(() => cleanEvent({ ...ok, route: '' }), /route/);
  assert.throws(() => cleanEvent({ ...ok, aircraft: '' }), /aircraft/);
  assert.throws(() => cleanEvent({ ...ok, multiplier: 9 }), /multiplier/);
  assert.throws(() => cleanEvent({ ...ok, end_at: '2026-11-20T08:00:00Z' }), /end after/);
  assert.deepEqual(cleanEvent({ multiplier: '' }, { partial: true }), { multiplier: 1 });
});

test("a route's aircraft list reads every way it's stored", () => {
  assert.deepEqual(routeAircraft({ aircraft: '["Airbus A380 - Qantas","Boeing 787-9 - Qantas"]' }), ['Airbus A380 - Qantas', 'Boeing 787-9 - Qantas']);
  assert.deepEqual(routeAircraft({ aircraft: ['E190 - QantasLink'] }), ['E190 - QantasLink']);
  assert.deepEqual(routeAircraft({ aircraft: 'Airbus A320 - Jetstar' }), ['Airbus A320 - Jetstar']);
  assert.deepEqual(routeAircraft({ aircraft: '' }), []);
});

test('logging opens 2h before the start and closes 48h after the end', () => {
  const start = new Date(base.start_at).getTime(), end = new Date(base.end_at).getTime();
  assert.equal(filingWindow(base, start - 3 * HOUR).open, false);
  assert.equal(filingWindow(base, start - 1 * HOUR).open, true);
  assert.equal(filingWindow(base, end + 47 * HOUR).open, true);
  assert.equal(filingWindow(base, end + 49 * HOUR).open, false);
  assert.equal(filingWindow({ ...base, status: 'cancelled' }, start).open, false);
  assert.equal(filingWindow({ ...base, end_at: null }, start + 20 * HOUR).open, true); // 12h default length
});

test('the Discord message lists each gate with who has it', () => {
  const regs = [
    { gate: 'A2', expand: { user: { first_name: 'Zac', last_name: 'Smith', discord_id: '123' } } },
    { gate: 'B1', expand: { user: { first_name: 'Luke', last_name: '' } } },
  ];
  const p = discordPayload(base, regs);
  const gates = p.embeds[0].fields.find(f => f.name === 'Gates').value;
  assert.match(gates, /`A1` \*open\*/);
  assert.match(gates, /`A2` <@123>/);
  assert.match(gates, /`B1` \*\*Luke\*\*/);
  assert.deepEqual(p.allowed_mentions, { parse: [] });
  assert.match(p.embeds[0].fields.find(f => f.name === 'Signed up').value, /2 · 2\/3 gates taken/);
});

test('a long gate list spills into more fields under Discord\'s limit', () => {
  const gates = Array.from({ length: 120 }, (_, i) => `GATE${i}`);
  const p = discordPayload({ ...base, gates }, []);
  const gateFields = p.embeds[0].fields.filter(f => f.name.startsWith('Gates'));
  assert.ok(gateFields.length > 1);
  for (const f of gateFields) assert.ok(f.value.length <= 1024);
  assert.deepEqual(parseGates('["A1"," ","B2"]'), ['A1', 'B2']);
});

test('rank bypass: only an event on this route that is open for logging counts', () => {
  const { openEventsOnRoute } = require('./events');
  const start = new Date(base.start_at).getTime();
  const list = [
    base,                                                      // YSSY-YMML, open at `start`
    { ...base, id: 'ev2', departure_icao: 'YBBN' },            // another route
    { ...base, id: 'ev3', status: 'cancelled' },               // cancelled
    { ...base, id: 'ev4', start_at: '2026-12-25T09:00:00.000Z', end_at: null }, // not open yet
  ];
  assert.deepEqual(openEventsOnRoute(list, 'yssy', 'YMML', start).map(e => e.id), ['ev1']);
  assert.deepEqual(openEventsOnRoute(list, 'YMML', 'YSSY', start), []);       // reverse direction isn't the event
  assert.deepEqual(openEventsOnRoute(list, 'YSSY', 'YMML', start + 60 * HOUR), []); // after it closes
});

test('rank bypass fails closed when the database errors', async () => {
  const { isOpenEventRoute } = require('./events');
  const broken = { collection: () => ({ getFullList: async () => { throw new Error('down'); } }) };
  assert.equal(await isOpenEventRoute(broken, 'u1', 'YSSY', 'YMML'), false);
  assert.equal(await isOpenEventRoute(broken, null, 'YSSY', 'YMML'), false);
});

test('live progress: route match, progress and phase', () => {
  const { planMatches, progressFor, inWindow } = require('./eventLive');
  assert.equal(planMatches({ from: 'YSSY', to: 'YMIA' }, 'YSSY', 'YMIA'), true);
  assert.equal(planMatches({ from: 'OLSEM', to: 'YMIA' }, 'YSSY', 'YMIA'), true);   // filed after the SID
  assert.equal(planMatches({ from: 'YMML', to: 'YMIA' }, 'YSSY', 'YMIA'), false);   // another airport
  assert.equal(planMatches({ from: 'YSSY', to: 'YMML' }, 'YSSY', 'YMIA'), false);   // somewhere else
  assert.equal(planMatches(null, 'YSSY', 'YMIA'), false);
  const dep = [-33.946, 151.177], arr = [-34.229, 142.086];
  assert.equal(progressFor(dep, arr, [-33.947, 151.176], 0).phase, 'At gate');
  assert.ok(Math.abs(progressFor(dep, arr, [-34.15, 146.6], 280).progress - 0.5) < 0.02);
  assert.equal(progressFor(dep, arr, [-34.23, 142.085], 10).phase, 'Taxiing in');
  const start = new Date(base.start_at).getTime();
  assert.equal(inWindow(base, start - 3 * HOUR), false);
  assert.equal(inWindow(base, start), true);
  assert.equal(inWindow({ ...base, status: 'cancelled' }, start), false);
});

test('events beta: only admins, staff, beta testers and the developer account', () => {
  const { canSeeEvents } = require('../routes/events');
  assert.equal(canSeeEvents({ role: 'admin' }), true);
  assert.equal(canSeeEvents({ role: 'staff' }), true);
  assert.equal(canSeeEvents({ role: 'beta_tester' }), true);
  assert.equal(canSeeEvents({ role: 'pilot', staff_role: 'r1' }), true);
  assert.equal(canSeeEvents({ role: 'pilot' }), false);
  assert.equal(canSeeEvents({ role: 'pilot', staff_role: '' }), false);
  assert.equal(canSeeEvents(null), false);
});
