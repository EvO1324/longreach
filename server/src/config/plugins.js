/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Which plugins are on (Admin › Plugins). The list itself is PLUGINS in
// brandCore. The saved choices live in the settings collection as "plugins".

const core = require('./brandCore');
const brand = require('./brand');

const KEY = 'plugins';
let saved = {};

const state = () => core.pluginState(saved, brand.features);
const isOn = id => state()[id] !== false;

// Read once at start-up (boot.js), so jobs and bot commands know what to start
async function load(pb) {
  const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  try { saved = r?.value ? JSON.parse(r.value) : {}; } catch { saved = {}; }
}

async function save(pb, next) {
  const clean = {};
  for (const p of core.PLUGINS) if (typeof next[p.id] === 'boolean') clean[p.id] = next[p.id];
  const value = JSON.stringify({ ...saved, ...clean });
  const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  if (r) await pb.collection('settings').update(r.id, { value });
  else await pb.collection('settings').create({ key: KEY, value });
  saved = JSON.parse(value);
}

const list = () => {
  const on = state();
  return core.PLUGINS.map(p => ({ id: p.id, name: p.name, description: p.description, enabled: on[p.id], beta: !!p.beta }));
};

// API paths of a switched-off plugin answer 404
function guard(req, res, next) {
  const url = req.originalUrl.split('?')[0];
  const under = (list, u) => (list || []).some(prefix => u === prefix || u.startsWith(prefix + '/'));
  const off = core.PLUGINS.find(p => !isOn(p.id) && under(p.api, url) && !under(p.apiAllow, url));
  if (off) return res.status(404).json({ error: `${off.name} is switched off` });
  next();
}

const commandOff = name => core.PLUGINS.some(p => (p.commands || []).includes(name) && !isOn(p.id));

module.exports = { KEY, load, save, list, isOn, state, guard, commandOff };
