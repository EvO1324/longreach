/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const { newer } = require('./updates');

test('updates: version comparison', () => {
  assert.equal(newer('v1.2.0', '1.1.9'), true);
  assert.equal(newer('v1.10.0', 'v1.9.3'), true);
  assert.equal(newer('2.0.0', 'v2.0.0'), false);
  assert.equal(newer('v1.0.0', '1.0.1'), false);
});
