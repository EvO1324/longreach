/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const { seedDocs } = require('./docs');
const STARTER = require('../data/starterDocs');

function fakePb(docs = [], seeded = null) {
  const settings = seeded ? [{ id: 's1', key: 'docs_seeded', value: JSON.stringify(seeded) }] : [];
  let n = 0;
  return {
    docs, settings,
    collection(name) {
      const rows = name === 'docs' ? docs : settings;
      return {
        getFullList: async () => rows.map(r => ({ ...r })),
        getFirstListItem: async (f) => { const r = rows.find(x => f.includes(`"${x.key}"`)); if (!r) throw new Error('404'); return r; },
        create: async (d) => { const r = { id: `n${n++}`, ...d }; rows.push(r); return r; },
        update: async (id, d) => Object.assign(rows.find(r => r.id === id), d),
        delete: async (id) => rows.splice(rows.findIndex(r => r.id === id), 1),
      };
    },
  };
}

test('a new crew centre gets every starter doc, filled in for the VA', async () => {
  const pb = fakePb();
  assert.strictEqual(await seedDocs(pb), STARTER.length);
  const all = JSON.stringify(pb.docs);
  assert.ok(!/\{(name|short|callsign|callsign_short)\}/.test(all), 'no placeholders left');
  assert.ok(!/\bAVG\b|Australia Virtual/.test(all), 'nothing from another VA');
  assert.strictEqual(pb.docs.find(d => d.doc_id === 'live-mode').plugin, 'liveMode');
  assert.strictEqual(await seedDocs(pb), 0, 'running again adds nothing');
});

test('the old docs are replaced; edited and deleted docs are left alone after that', async () => {
  const pb = fakePb([
    { id: 'o1', doc_id: 'pilot-basics', sections: '[]' },
    { id: 'o2', doc_id: 'finding-a-route', sections: '[]' },
    { id: 'c1', doc_id: 'our-own-doc', sections: '[]' },
  ]);
  await seedDocs(pb);
  assert.ok(!pb.docs.some(d => d.doc_id === 'pilot-basics'), 'old doc removed');
  assert.ok(pb.docs.some(d => d.doc_id === 'our-own-doc'), 'the VA\'s own doc kept');
  assert.notStrictEqual(pb.docs.find(d => d.doc_id === 'finding-a-route').id, 'o2', 'same id, new text');

  // an admin deletes a doc; it doesn't come back
  pb.docs.splice(pb.docs.findIndex(d => d.doc_id === 'code-of-conduct'), 1);
  assert.strictEqual(await seedDocs(pb), 0);
  assert.ok(!pb.docs.some(d => d.doc_id === 'code-of-conduct'));
});
