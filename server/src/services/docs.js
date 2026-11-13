/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Adds the starter docs (data/starterDocs.js) when the API starts: all of them
// on a new crew centre, and any new ones after an update. A doc is only ever
// added once, so docs admins have edited or deleted are left alone.

const brand = require('../config/brand');
const STARTER = require('../data/starterDocs');

const KEY = 'docs_seeded';
// 2: the rewritten set. Docs from version 1 (written for one VA) are replaced.
const VERSION = 2;
const V1_IDS = [
  'pilot-basics', 'pilot-code-of-conduct', 'server-rules', 'finding-a-route', 'filing-pirep', 'logbook',
  'rank-progression', 'rotw-guide', 'challenges', 'career-mode', 'staff-code-of-conduct', 'recruitment',
  'managing-pilots', 'approving-pireps', 'leave-approval', 'discord-ticket-tool', 'bot-commands',
  'rotw-process', 'staff-challenges',
];

function exampleCallsign() {
  try { return brand.callsign.format(brand.callsign.min); } catch { return brand.shortName; }
}

// {name}, {short}, {callsign} and {callsign_short} in the doc text
function fill(doc) {
  const sub = s => String(s)
    .replace(/\{name\}/g, brand.name)
    .replace(/\{short\}/g, brand.shortName)
    .replace(/\{callsign\}/g, exampleCallsign())
    .replace(/\{callsign_short\}/g, (() => { try { return brand.callsign.short(brand.callsign.min) || exampleCallsign(); } catch { return exampleCallsign(); } })());
  return JSON.parse(sub(JSON.stringify(doc)));
}

async function seedDocs(pb) {
  const rec = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  let state = { version: 0, ids: [] };
  try { if (rec?.value) state = { ...state, ...JSON.parse(rec.value) }; } catch {}

  const existing = await pb.collection('docs').getFullList({ fields: 'id,doc_id', requestKey: null });
  const have = new Map(existing.map(d => [d.doc_id, d.id]));

  if (state.version < VERSION) {
    for (const id of V1_IDS) {
      if (have.has(id)) { await pb.collection('docs').delete(have.get(id)); have.delete(id); }
    }
    state.ids = [];
  }

  let added = 0;
  for (const doc of STARTER) {
    if (state.ids.includes(doc.doc_id) || have.has(doc.doc_id)) continue;
    const d = fill(doc);
    await pb.collection('docs').create({
      doc_id: d.doc_id, label: d.label, title: d.title, icon_name: d.icon_name,
      admin_only: !!d.admin_only, sort_order: d.sort_order, plugin: d.plugin || '',
      sections: JSON.stringify(d.sections),
    });
    added++;
  }

  const value = JSON.stringify({ version: VERSION, ids: [...new Set([...state.ids, ...STARTER.map(d => d.doc_id)])] });
  if (rec) await pb.collection('settings').update(rec.id, { value });
  else await pb.collection('settings').create({ key: KEY, value });
  if (added) console.log(`[docs] added ${added} doc${added === 1 ? '' : 's'}`);
  return added;
}

module.exports = { seedDocs, fill, VERSION };
