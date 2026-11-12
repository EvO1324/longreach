/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

let bids = [];
let flights = [];
let updates = [];

const stubs = {
  [path.join(__dirname, '../config/pocketbase.js')]: {
    getAdminClient: async () => ({
      collection: name => ({
        getFullList: async () => (name === 'if_live_bids' ? bids : []),
        getOne: async id => ({ id, if_user_id: `if-${id}` }),
        update: async (id, data) => { updates.push({ id, ...data }); return { id, ...data }; },
      }),
    }),
  },
  [path.join(__dirname, '../routes/ifLive.js')]: {
    getServiceUserIdForOrg: async () => null,
    ifLiveWrite: async () => [], ifLiveRequest: async () => null, invalidateAircraftSchedulesCache: () => {},
    startedDeadline: (leg, at) => new Date(at + 3 * 3600e3).toISOString(),
    deadlineForLeg: () => new Date(Date.now() + 6 * 3600e3).toISOString(),
    isTimelessLeg: () => true,
    notifyNextBookingOfEarlyRelease: async () => {},
    START_WINDOW_MS: 4 * 3600e3,
  },
  [path.join(__dirname, '../routes/discord.js')]: { notifyBookingDropped: async () => {} },
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  const file = Module._resolveFilename(req, parent, isMain);
  return stubs[file] || origLoad.apply(this, arguments);
};
global.fetch = async url => ({
  json: async () => (/flights/.test(url)
    ? { errorCode: 0, result: flights }
    : { errorCode: 0, result: [{ id: 'exp', name: 'Expert' }] }),
});
const { runIfLiveNoShow } = require('./ifLiveNoShow');

const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const booking = (id, { pilot = 'p1', aircraft = 'ac1', holdStart = ago(0.5), crew = [] } = {}) => ({
  id, pilot, aircraft_id: aircraft, organization_id: 'org', status: 'active', crew,
  aircraft_type_id: 'a320', livery_id: 'jq', created: ago(1),
  legs: [{ flightNumber: 'JQ1', originIcao: 'YSSY', destIcao: 'YMML', holdStartUtc: holdStart, windowStartUtc: holdStart }],
});
// A Live aircraft on the Expert Server: its v2 flightId is the aircraft id
const onServer = ({ aircraft = 'ac1', user = 'if-p1', speed = 0, callsign = 'Australia 1VG' } = {}) =>
  ({ flightId: aircraft, userId: user, speed, callsign, aircraftId: 'other-type', liveryId: 'x' });

async function run(b, f) {
  bids = b; flights = f; updates = [];
  await runIfLiveNoShow();
  return updates.filter(u => (u.legs || []).some(l => l.startedAt)).map(u => u.id);
}

test('parked in persistent mode is not seen flying', async () => {
  assert.deepEqual(await run([booking('b1')], [onServer({ speed: 0 })]), []);
});

test('moving after the booking time is seen flying', async () => {
  assert.deepEqual(await run([booking('b1')], [onServer({ speed: 18 })]), ['b1']);
});

test('moving before the booking is due does not count', async () => {
  const later = new Date(Date.now() + 2 * 3600e3).toISOString();
  assert.deepEqual(await run([booking('b1', { holdStart: later })], [onServer({ speed: 250 })]), []);
});

test('moving while another booking is ahead on the aircraft does not count', async () => {
  const first = booking('b0', { pilot: 'p0', holdStart: ago(3) });
  const mine = booking('b1', { holdStart: ago(0.5) });
  // p0 is flying it; only their booking starts
  assert.deepEqual(await run([first, mine], [onServer({ user: 'if-p0', speed: 300 })]), ['b0']);
});

test('someone else moving the aircraft does not count', async () => {
  assert.deepEqual(await run([booking('b1')], [onServer({ user: 'if-stranger', speed: 300 })]), []);
});

test('crew moving the aircraft counts', async () => {
  const b = booking('b1', { crew: [{ ifUserId: 'if-fo' }] });
  assert.deepEqual(await run([b], [onServer({ user: 'if-fo', speed: 140 })]), ['b1']);
});

test('the pilot moving with the booked callsign counts', async () => {
  const f = { flightId: 'not-the-live-aircraft', userId: 'if-p1', speed: 120, callsign: 'Jetstar JQ1', aircraftId: 'x', liveryId: 'y' };
  assert.deepEqual(await run([booking('b1')], [f]), ['b1']);
});

test('the pilot parked with the booked callsign does not count', async () => {
  const f = { flightId: 'not-the-live-aircraft', userId: 'if-p1', speed: 0, callsign: 'Jetstar JQ1', aircraftId: 'a320', liveryId: 'jq' };
  assert.deepEqual(await run([booking('b1')], [f]), []);
});
