/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { escFilterValue } = require('./pbFilter');

const DEVELOPER_EMAILS = String(process.env.DEVELOPER_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

let cachedIds = null;
let cachedAt = 0;
const TTL = 6 * 60 * 60 * 1000;

async function getDeveloperIds(pb) {
  if (cachedIds && Date.now() - cachedAt < TTL) return cachedIds;
  const ids = new Set();
  for (const email of DEVELOPER_EMAILS) {
    try {
      const rec = await pb.collection('users').getFirstListItem(`email = "${escFilterValue(email)}"`, { requestKey: null, fields: 'id' });
      ids.add(rec.id);
    } catch { }
  }
  cachedIds = ids;
  cachedAt = Date.now();
  return ids;
}

async function tagDevelopers(pb, records) {
  const ids = await getDeveloperIds(pb);
  if (ids.size === 0) return records;
  for (const r of records) {
    if (r?.id && ids.has(r.id)) r.is_developer = true;
  }
  return records;
}

module.exports = { getDeveloperIds, tagDevelopers, DEVELOPER_EMAILS };
