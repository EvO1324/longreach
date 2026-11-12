/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');

const KEY = 'if_live_aircraft_admin';
const TTL_MS = 30 * 1000;
let cache = null;
let cacheAt = 0;

async function getAll() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const pb = await getAdminClient();
    const rec = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null });
    const value = typeof rec.value === 'string' ? JSON.parse(rec.value || '{}') : (rec.value || {});
    cache = value && typeof value === 'object' ? value : {};
  } catch {
    cache = {};
  }
  cacheAt = Date.now();
  return cache;
}

async function setFor(aircraftId, patch) {
  const pb = await getAdminClient();
  let rec = null;
  try { rec = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }); } catch { /* first one */ }
  const all = rec ? (typeof rec.value === 'string' ? JSON.parse(rec.value || '{}') : (rec.value || {})) : {};
  const next = { ...(all[aircraftId] || {}), ...patch };
  // Drop empty entries so the value stays small
  if (!next.blocked && !next.locationIcao) delete all[aircraftId];
  else all[aircraftId] = next;
  // Stored as a JSON string, which works whether the value field is text or JSON
  if (rec) await pb.collection('settings').update(rec.id, { value: JSON.stringify(all) });
  else await pb.collection('settings').create({ key: KEY, value: JSON.stringify(all) });
  cache = all;
  cacheAt = Date.now();
  return all[aircraftId] || null;
}

async function blockFor(aircraftId) {
  const entry = (await getAll())[aircraftId];
  return entry?.blocked ? entry : null;
}

module.exports = { getAll, setFor, blockFor };
