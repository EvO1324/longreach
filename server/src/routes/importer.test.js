/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const { _parse: { hours, minutes, date } } = require('./importer');

test('import: flight times read every common way', () => {
  for (const [v, h] of [['1:30', 1.5], ['01:30:00', 1.5], ['1h 30m', 1.5], ['1h30', 1.5], ['90m', 1.5], ['1.5', 1.5], ['1,5', 1.5], ['2 hours', 2], ['45 mins', 0.75]]) {
    assert.ok(Math.abs(hours(v) - h) < 1e-9, `${v} → ${hours(v)}`);
  }
  assert.equal(hours('soon'), null);
  assert.equal(minutes('95'), 95);
  assert.equal(minutes('1:35'), 95);
});

test('import: dates in the usual formats', () => {
  assert.equal(date('2026-11-12'), '2026-11-12');
  assert.equal(date('2026-11-12T08:00:00Z'), '2026-11-12');
  assert.equal(date('12/11/2026'), '2026-11-12');   // day first
  assert.equal(date('11/13/2026'), '2026-11-13');   // can only be month first
  assert.equal(date('12.11.26'), '2026-11-12');
  assert.equal(date('46338'), '2026-11-12');        // Excel serial
  assert.equal(date('12 Nov 2026'), '2026-11-12');
  assert.equal(date('nonsense'), null);
});
