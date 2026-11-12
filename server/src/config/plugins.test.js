/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const core = require('./brandCore');
const plugins = require('./plugins');

const fakePb = (value) => {
  const rec = value === undefined ? null : { id: 'r1', key: 'plugins', value };
  return {
    saved: null,
    collection() {
      const self = this;
      return {
        getFirstListItem: async () => { if (!rec) throw new Error('404'); return rec; },
        update: async (id, d) => { rec.value = d.value; self.saved = d.value; },
        create: async (d) => { self.saved = d.value; },
      };
    },
  };
};

function run(url) {
  let status = 200, body = null, nexted = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  plugins.guard({ originalUrl: url }, res, () => { nexted = true; });
  return { status, body, nexted };
}

test('saved choice beats va.config.json, which beats the default', () => {
  assert.deepStrictEqual(
    core.pluginState({ career: false }, { career: true, events: false }),
    { career: false, liveMode: true, routesOfTheWeek: true, events: false, challenges: true, tickets: false, atc: true },
  );
  assert.strictEqual(core.pluginState({}, {}).tickets, false, 'new plugins start switched off');
});

test('a switched-off plugin answers 404, except its allowed paths', async () => {
  await plugins.load(fakePb(JSON.stringify({ liveMode: false })));
  assert.strictEqual(run('/api/if-live/organizations').status, 404);
  assert.strictEqual(run('/api/if-live').status, 404);
  assert.ok(run('/api/if-live/auth-start?x=1').nexted, 'IF sign-in still works');
  assert.ok(run('/api/if-livex').nexted, 'only whole path segments match');
  assert.ok(run('/api/career/me').nexted, 'other plugins are untouched');
  assert.ok(plugins.commandOff('livestats'));
  assert.ok(!plugins.commandOff('career'));
});

test('saving keeps earlier choices and ignores unknown plugins', async () => {
  const pb = fakePb(JSON.stringify({ liveMode: false }));
  await plugins.load(pb);
  await plugins.save(pb, { career: false, nope: true });
  assert.deepStrictEqual(JSON.parse(pb.saved), { liveMode: false, career: false });
  assert.strictEqual(plugins.isOn('career'), false);
  await plugins.save(pb, { career: true, liveMode: true });
  assert.ok(run('/api/if-live/organizations').nexted);
});
