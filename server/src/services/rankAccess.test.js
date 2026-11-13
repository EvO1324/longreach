/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// node test src (npm test)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ra = require('./rankAccess');

// these tests use a VA whose own airlines are QF and JQ
ra.HOME_AIRLINES.splice(0, ra.HOME_AIRLINES.length, 'QF', 'JQ');

// Trimmed copy of the live rank ladder (Nov 2026).
const RANKS = [
  { id: 'r1', name: 'New Pilot',           hours_required: 0,    order_position: 1, aircraft_restrictions: '["Bombardier Dash 8-Q400","E190","Airbus A319"]' },
  { id: 'r2', name: 'Second Officer',      hours_required: 25,   order_position: 2, aircraft_restrictions: '["Airbus A320","Boeing 737-800","Airbus A321 NEO"]' },
  { id: 'r5', name: 'Captain',             hours_required: 400,  order_position: 5, aircraft_restrictions: '["Airbus A350","Boeing 787-9"]' },
  { id: 'r7', name: "Chairman's Silver",   hours_required: 1500, order_position: 7, aircraft_restrictions: '["Airbus A350-1000"]', pirep_multiplier: 1.25 },
  { id: 'r9', name: 'oneworld Discover',   hours_required: 3000, order_position: 9, allows_manual_pirep: true },
];

test('normaliseType matches the spellings found in the live data', () => {
  assert.equal(ra.normaliseType('Embraer E190 - QantasLink'), ra.normaliseType('E190'));
  assert.equal(ra.normaliseType('Bombardier Dash 8-400 - WestJet Encore'), ra.normaliseType('Bombardier Dash 8-Q400'));
  assert.equal(ra.normaliseType('Airbus A321 NEO - JetStar'), ra.normaliseType('Airbus A321neo'));
  assert.notEqual(ra.normaliseType('Airbus A350-1000'), ra.normaliseType('Airbus A350'));
  assert.equal(ra.normaliseType('Boeing 777-300ER - KLM - Orange Pride'), ra.normaliseType('Boeing 777-300ER'));
});

test('current rank comes from hours', () => {
  assert.equal(ra.computeAccess(RANKS, 0).rank.name, 'New Pilot');
  assert.equal(ra.computeAccess(RANKS, 24.9).rank.name, 'New Pilot');
  assert.equal(ra.computeAccess(RANKS, 25).rank.name, 'Second Officer');
  assert.equal(ra.computeAccess(RANKS, 5000).rank.name, 'oneworld Discover');
  assert.equal(ra.computeAccess(RANKS, 1600).pirep_multiplier, 1.25);
  assert.equal(ra.computeAccess(RANKS, 5000).manual_pirep, true);
});

test('aircraft unlock at the lowest rank listing them; unlisted types are open', () => {
  const newPilot = ra.computeAccess(RANKS, 0);
  assert.equal(ra.aircraftLock(newPilot, 'Embraer E190 - QantasLink'), null);
  assert.equal(ra.aircraftLock(newPilot, 'Airbus A320 - Jetstar'), 'Second Officer');
  assert.equal(ra.aircraftLock(newPilot, 'Boeing 717-200 - QantasLink'), null);
  const captain = ra.computeAccess(RANKS, 400);
  assert.equal(ra.aircraftLock(captain, 'Airbus A350 - Emirates'), null);
  assert.equal(ra.aircraftLock(captain, 'Airbus A350-1000 - Qantas'), "Chairman's Silver");
});

test('codeshares: second rank by default, or the lowest ticked rank', () => {
  assert.equal(ra.computeAccess(RANKS, 0).codeshares_unlocked, false);
  assert.equal(ra.computeAccess(RANKS, 25).codeshares_unlocked, true);
  assert.equal(ra.computeAccess(RANKS, 0).codeshare_unlock_rank, 'Second Officer');
  const ticked = RANKS.map(r => r.id === 'r5' ? { ...r, unlocks_codeshares: true } : r);
  assert.equal(ra.computeAccess(ticked, 25).codeshares_unlocked, false);
  assert.equal(ra.computeAccess(ticked, 400).codeshares_unlocked, true);
  assert.equal(ra.isCodeshare('QF1'), false);
  assert.equal(ra.isCodeshare('JQ501'), false);
  assert.equal(ra.isCodeshare('EK413'), true);
});

test('routeLock: flyable if any listed aircraft is unlocked', () => {
  const np = ra.computeAccess(RANKS, 0);
  assert.equal(ra.routeLock(np, { flight_number: 'QF1', aircraft: 'Airbus A320 - Jetstar|Embraer E190 - QantasLink' }), null);
  assert.equal(ra.routeLock(np, { flight_number: 'QF1', aircraft: '["Airbus A320 - Jetstar"]' }), 'Second Officer');
  assert.match(ra.routeLock(np, { flight_number: 'EK413', aircraft: 'Airbus A319 - Generic' }), /Codeshares unlock at Second Officer/);
  assert.equal(ra.routeLock(np, { flight_number: 'QF9', aircraft: '' }), null);
});

test('frontend copy in src/utils/rankAccess.js matches this file', () => {
  const front = fs.readFileSync(path.join(__dirname, '../../../src/utils/rankAccess.js'), 'utf8');
  const back = fs.readFileSync(path.join(__dirname, 'rankAccess.js'), 'utf8');
  const body = (src, name) => {
    const i = src.indexOf(`function ${name}(`);
    assert.notEqual(i, -1, `${name} missing`);
    return src.slice(i, src.indexOf('\n}\n', i));
  };
  for (const name of ['normaliseType', 'isCodeshare', 'parseRouteAircraft', 'aircraftLock', 'routeLock']) {
    assert.equal(body(front, name), body(back, name), `${name} differs between frontend and server`);
  }
  const consts = src => [src.match(/const MANUFACTURERS = .*$/m)[0], /HOME_AIRLINES = .*airlines\?\.home \|\| \[\];$/m.test(src)];
  assert.deepEqual(consts(front), consts(back));
});
