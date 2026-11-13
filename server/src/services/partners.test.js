/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const partners = require('./partners');

test('partners: invite codes round-trip and junk is refused', () => {
  const token = partners.newToken();
  const code = partners.makeInvite({ url: 'https://avg-api.fly.dev', name: 'AVG', token });
  assert.deepStrictEqual(partners.readInvite(code), { url: 'https://avg-api.fly.dev', name: 'AVG', token });
  assert.match(partners.readInvite('hello').error, /isn't a partner invite/);
  assert.match(partners.readInvite(partners.makeInvite({ url: 'http://evil.example', name: 'x', token })).error, /isn't/);
  assert.match(partners.readInvite(partners.makeInvite({ url: 'https://a.b', name: 'x', token: 'short' })).error, /isn't/);
});

test('partners: addresses are https, trimmed, without /api', () => {
  assert.strictEqual(partners.cleanUrl('https://x.fly.dev/api/'), 'https://x.fly.dev');
  assert.strictEqual(partners.cleanUrl('http://localhost:3099'), 'http://localhost:3099');
  assert.strictEqual(partners.cleanUrl('http://x.fly.dev'), null);
  assert.strictEqual(partners.cleanUrl('ftp://x'), null);
  assert.strictEqual(partners.cleanUrl('nope'), null);
});

test('partners: share settings fill in defaults', () => {
  assert.deepStrictEqual(partners.readShare(''), { routes: true, flights: true });
  assert.deepStrictEqual(partners.readShare('{"flights":false}'), { routes: true, flights: false });
  assert.deepStrictEqual(partners.readShare({ routes: false, junk: 1 }), { routes: false, flights: true });
});

test('partners: only what is shared goes out, callsigns not names', async () => {
  const pb = {
    collection: name => ({
      getList: async () => name === 'routes'
        ? { items: [{ flight_number: 'QF1', departure_icao: 'YSSY', arrival_icao: 'EGLL', aircraft: 'A380', distance_nm: 9000, duration: '22:00' }] }
        : { items: [{ departure_icao: 'YSSY', arrival_icao: 'YMML', aircraft: 'B738', flight_time: 1.26, date: '2026-11-01', expand: { user: { callsign: 'Qantas 101VA', first_name: 'Sam' } } }] },
    }),
  };
  const liveFlights = async () => ({ flights: [{ callsign: 'Qantas 102VA', departure: 'YBBN', arrival: 'YSSY', aircraft: 'A330', altitude: 36000, speed: 480, lat: 1, lng: 2 }] });
  const both = await partners.ourData(pb, { routes: true, flights: true }, { liveFlights });
  assert.deepStrictEqual(both.routes[0], { flight_number: 'QF1', from: 'YSSY', to: 'EGLL', aircraft: 'A380', distance_nm: 9000, duration: '22:00' });
  assert.deepStrictEqual(both.recent[0], { callsign: 'Qantas 101VA', from: 'YSSY', to: 'YMML', aircraft: 'B738', hours: 1.3, date: '2026-11-01' });
  assert.deepStrictEqual(both.live[0], { callsign: 'Qantas 102VA', from: 'YBBN', to: 'YSSY', aircraft: 'A330', altitude: 36000, speed: 480 });
  assert.ok(!JSON.stringify(both).includes('Sam'));

  const routesOnly = await partners.ourData(pb, { routes: true, flights: false }, { liveFlights });
  assert.ok(routesOnly.routes && !routesOnly.recent && !routesOnly.live);
});
