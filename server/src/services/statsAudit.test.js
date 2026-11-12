/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedPilotTotals, buildDays, dayDiffers } = require('./statsAudit');

const noBonuses = { entries: [], entryUser: {}, comps: [] };

test('pilot totals count approved flights only', () => {
  const t = expectedPilotTotals([
    { id: 'a', user: 'u1', flight_time: 2, status: 'approved' },
    { id: 'b', user: 'u1', flight_time: 3, status: 'rejected' },
    { id: 'c', user: 'u1', flight_time: 1.5, status: 'pending' },
    { id: 'd', user: 'u2', flight_time: 4, status: 'approved' },
  ], noBonuses);
  assert.deepEqual(t.u1, { flights: 1, hours: 2 });
  assert.deepEqual(t.u2, { flights: 1, hours: 4 });
});

test('challenge bonus hours are kept, without counting extra flights', () => {
  const t = expectedPilotTotals([
    { id: 'f1', user: 'u1', flight_time: 2, status: 'approved' },
  ], {
    entries: [{ id: 'e1', user: 'u1', placement_bonus_hours: 5 }],
    entryUser: { e1: 'u1' },
    comps: [{ entry: 'e1', flight: 'f1', flight_time: 2, hours_credited: 3 }], // ×1.5 leg: 1h bonus
  });
  assert.deepEqual(t.u1, { flights: 1, hours: 8 }); // 2 flown + 1 leg bonus + 5 placement
});

test("a leg's bonus goes once its flight is no longer approved", () => {
  const t = expectedPilotTotals([
    { id: 'f1', user: 'u1', flight_time: 2, status: 'rejected' },
  ], {
    entries: [{ id: 'e1', user: 'u1', placement_bonus_hours: 0 }],
    entryUser: { e1: 'u1' },
    comps: [{ entry: 'e1', flight: 'f1', flight_time: 2, hours_credited: 4 }],
  });
  assert.equal(t.u1, undefined);
});

test('day rows key aircraft by type, so Live tails merge into their type', () => {
  const days = buildDays([
    { user: 'u1', flight_time: 1, status: 'approved', date: '2026-11-09 00:00:00.000Z', departure_icao: 'YSSY', arrival_icao: 'YMML', aircraft: 'Boeing 737-800 - Qantas', auto_approved: true },
    { user: 'u2', flight_time: 2, status: 'approved', date: '2026-11-09 00:00:00.000Z', departure_icao: 'YSSY', arrival_icao: 'YMML', aircraft: 'Boeing 737-800 - Virgin', multiplier_value: 2 },
    { user: 'u2', flight_time: 9, status: 'rejected', date: '2026-11-09 00:00:00.000Z' },
  ]);
  const d = days.get('2026-11-09');
  assert.equal(d.flights_count, 2);
  assert.equal(d.hours, 3);
  assert.equal(d.auto_approved_count, 1);
  assert.equal(d.multiplied_count, 1);
  assert.equal(d.multiplied_hours, 2);
  assert.equal(d.rejected_count, 1);
  assert.deepEqual(d.aircraft_counts, { 'Boeing 737-800': { count: 2, hours: 3 } });
  assert.deepEqual(d.route_counts, { 'YSSY-YMML': { count: 2, hours: 3 } });
  assert.deepEqual(d.pilot_counts, { u1: { flights: 1, hours: 1 }, u2: { flights: 1, hours: 2 } });
});

test('a day only differs past rounding', () => {
  const want = buildDays([{ user: 'u1', flight_time: 1.23456, status: 'approved', date: '2026-01-01', aircraft: 'A380' }]).get('2026-01-01');
  const stored = JSON.parse(JSON.stringify(want));
  stored.hours += 0.004;
  assert.equal(dayDiffers(stored, want), false);
  stored.aircraft_counts.A380.count = 2;
  assert.equal(dayDiffers(stored, want), true);
  assert.equal(dayDiffers({ ...want, multiplied_hours: undefined }, want), false); // 0 vs missing
});
