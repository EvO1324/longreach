/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const { newer, notesToEntries } = require('./updates');

test('updates: version comparison', () => {
  assert.equal(newer('v1.2.0', '1.1.9'), true);
  assert.equal(newer('v1.10.0', 'v1.9.3'), true);
  assert.equal(newer('2.0.0', 'v2.0.0'), false);
  assert.equal(newer('v1.0.0', '1.0.1'), false);
});

test('updates: release notes become What\'s New entries', () => {
  const notes = [
    'Big one this time.',
    '',
    '## New',
    '- **Support tickets** plugin',
    '- Docs for pilots and staff',
    '  - 26 to start with',
    '',
    '### Changed',
    '* Fleet ICAO is set per type, see [the fleet page](https://x.y)',
    '',
    '**Fixed**',
    '- `Fleet` images not saving',
    '## Removed',
    '- Old seed script',
  ].join('\n');
  assert.deepStrictEqual(notesToEntries(notes), [
    { tag: 'new', text: 'Support tickets plugin' },
    { tag: 'new', text: 'Docs for pilots and staff (26 to start with)' },
    { tag: 'improved', text: 'Fleet ICAO is set per type, see the fleet page' },
    { tag: 'fixed', text: 'Fleet images not saving' },
    { tag: 'removed', text: 'Old seed script' },
  ]);
  assert.deepStrictEqual(notesToEntries(''), []);
});
