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

// Stub the aircraft block lookup so nothing touches a database
const blockPath = path.join(__dirname, '../services/liveAircraftAdmin.js');
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Module._resolveFilename(req, parent, isMain) === blockPath) return { blockFor: async () => null };
  return origLoad.apply(this, arguments);
};
const { checkBidRequest, MAX_BOOKINGS_PER_PILOT } = require('./ifLive');

const open = (id, pilot, aircraft_id, reg, dest = 'YSSY') => ({
  id, pilot, aircraft_id, aircraft_registration: reg, status: 'active',
  legs: [{ flightNumber: 'QF1', originIcao: 'YMML', destIcao: dest, deadlineUtc: new Date(Date.now() + 3600e3).toISOString() }],
});
// getFullList is called twice: the pilot's bookings, then the aircraft's
function fakePb(bids) {
  return { collection: () => ({ getFullList: async ({ filter }) => {
    const pilot = /pilot = "([^"]+)"/.exec(filter)?.[1];
    const ac = /aircraft_id = "([^"]+)"/.exec(filter)?.[1];
    return bids.filter(b => (!pilot || b.pilot === pilot) && (!ac || b.aircraft_id === ac));
  } }) };
}
const leg = [{ flightNumber: 'QF2', originIcao: 'YSSY', destIcao: 'YBBN' }];
const req = aircraftId => ({ organizationId: 'org', aircraftId, legs: leg });

test('limit is 2', () => assert.equal(MAX_BOOKINGS_PER_PILOT, 2));

test('second aircraft is allowed', async () => {
  // ac2 is queued behind someone else, so the check ends there (no IF calls)
  const pb = fakePb([open('b1', 'me', 'ac1', 'IF-AAA'), open('b9', 'other', 'ac2', 'IF-BBB')]);
  const r = await checkBidRequest(pb, 'me', req('ac2'));
  assert.ok(!r.error, r.error);
});

test('third aircraft is refused', async () => {
  const pb = fakePb([open('b1', 'me', 'ac1', 'IF-AAA'), open('b2', 'me', 'ac2', 'IF-BBB'), open('b9', 'other', 'ac3', 'IF-CCC')]);
  const r = await checkBidRequest(pb, 'me', req('ac3'));
  assert.equal(r.status, 409);
  assert.match(r.error, /up to 2 aircraft.*IF-AAA and IF-BBB/);
});

test('a second booking on an aircraft you already have is refused', async () => {
  const pb = fakePb([open('b1', 'me', 'ac1', 'IF-AAA')]);
  const r = await checkBidRequest(pb, 'me', req('ac1'));
  assert.equal(r.status, 409);
  assert.match(r.error, /already have IF-AAA booked\. Add a sector/);
});

test('adding a sector still works with two bookings', async () => {
  const pb = fakePb([open('b1', 'me', 'ac1', 'IF-AAA'), open('b2', 'me', 'ac2', 'IF-BBB')]);
  const r = await checkBidRequest(pb, 'me', { ...req('ac1'), extendBidId: 'b1' });
  assert.ok(!r.error, r.error);
});

test('finished bookings do not count', async () => {
  const done = open('b1', 'me', 'ac1', 'IF-AAA'); done.legs[0].pirepId = 'p1';
  const pb = fakePb([done, open('b2', 'me', 'ac2', 'IF-BBB'), open('b9', 'other', 'ac3', 'IF-CCC')]);
  const r = await checkBidRequest(pb, 'me', req('ac3'));
  assert.ok(!r.error, r.error);
});
