/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { escFilterValue } = require('../utils/pbFilter');

const IF_V2_BASE = 'https://api.infiniteflight.com/public/v2';
const IF_LOOKUP_BATCH = 25;

let warnedMissing = false;
function handleMissingCollections(err) {
  if (err?.status === 404) {
    if (!warnedMissing) console.warn('[badges] badges/pilot_badges not found — run npm run setup and create the database collections');
    warnedMissing = true;
    return true;
  }
  return false;
}

// Creates pilot_badges rows for the given users that don't have this badge yet.
async function grant(pb, badgeId, userIds) {
  const created = [];
  for (const userId of userIds) {
    try {
      created.push(await pb.collection('pilot_badges').create({
        user: userId, badge: badgeId, earned_at: new Date().toISOString(), seen: false,
      }, { requestKey: null }));
    } catch (err) {
      const detail = JSON.stringify(err?.response?.data || {});
      if (!detail.includes('not_unique')) console.error(`[badges] grant ${badgeId} → ${userId} failed:`, err.message, detail);
    }
  }
  return created;
}

async function ownedBadgeIds(pb, userId) {
  const owned = await pb.collection('pilot_badges').getFullList({
    filter: `user = "${escFilterValue(userId)}"`,
    fields: 'id,badge',
    requestKey: null,
  });
  return new Map(owned.map(o => [o.badge, o.id]));
}

// Hour badges

async function awardHourBadges(pb, userId, hours) {
  try {
    const reached = await pb.collection('badges').getFullList({
      filter: `type = "hours" && hours_required <= ${Number(hours) || 0}`,
      requestKey: null,
    });
    if (!reached.length) return [];
    const owned = await ownedBadgeIds(pb, userId);
    const created = [];
    for (const badge of reached.filter(b => !owned.has(b.id))) {
      created.push(...await grant(pb, badge.id, [userId]));
    }
    if (created.length) console.log(`[badges] ${userId} earned ${created.length} hour badge(s) at ${hours}h`);
    return created;
  } catch (err) {
    if (!handleMissingCollections(err)) console.error('[badges] award failed:', err.message);
    return [];
  }
}

// IF role badges

async function fetchIfRoles(usernames) {
  const roles = new Map();
  if (!process.env.IF_API_KEY) return roles;
  for (let i = 0; i < usernames.length; i += IF_LOOKUP_BATCH) {
    const batch = usernames.slice(i, i + IF_LOOKUP_BATCH);
    const res = await fetch(`${IF_V2_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discourseNames: batch }),
    });
    const data = await res.json();
    for (const u of data.result || []) {
      if (u.discourseUsername) roles.set(u.discourseUsername.toLowerCase(), u.roles || []);
    }
  }
  return roles;
}

async function applyRoleBadges(pb, userId, ifRoles, roleBadges, owned) {
  let granted = 0, removed = 0;
  for (const badge of roleBadges) {
    const has = ifRoles.includes(badge.if_role_id);
    if (has && !owned.has(badge.id)) {
      granted += (await grant(pb, badge.id, [userId])).length;
    } else if (!has && owned.has(badge.id)) {
      await pb.collection('pilot_badges').delete(owned.get(badge.id), { requestKey: null }).catch(() => {});
      removed++;
    }
  }
  return { granted, removed };
}

async function syncRoleBadgesForPilot(pb, userId, ifRoles) {
  try {
    const roleBadges = await pb.collection('badges').getFullList({ filter: 'type = "if_role"', requestKey: null });
    if (!roleBadges.length) return { granted: 0, removed: 0 };
    return await applyRoleBadges(pb, userId, ifRoles || [], roleBadges, await ownedBadgeIds(pb, userId));
  } catch (err) {
    if (!handleMissingCollections(err)) console.error('[badges] role sync failed:', err.message);
    return { granted: 0, removed: 0 };
  }
}

async function syncAllRoleBadges(pb) {
  const roleBadges = await pb.collection('badges').getFullList({ filter: 'type = "if_role"', requestKey: null });
  if (!roleBadges.length) return { checked: 0, granted: 0, removed: 0 };

  const pilots = await pb.collection('users').getFullList({
    filter: 'ifc_username != ""',
    fields: 'id,ifc_username',
    requestKey: null,
  });
  const ifRoles = await fetchIfRoles(pilots.map(p => p.ifc_username));
  const allOwned = await pb.collection('pilot_badges').getFullList({
    filter: roleBadges.map(b => `badge = "${escFilterValue(b.id)}"`).join(' || '),
    fields: 'id,user,badge',
    requestKey: null,
  });

  let checked = 0, granted = 0, removed = 0;
  for (const pilot of pilots) {
    const roles = ifRoles.get(pilot.ifc_username.toLowerCase());
    if (!roles) continue;
    const owned = new Map(allOwned.filter(o => o.user === pilot.id).map(o => [o.badge, o.id]));
    const r = await applyRoleBadges(pb, pilot.id, roles, roleBadges, owned);
    checked++; granted += r.granted; removed += r.removed;
  }
  console.log(`[badges] role sync: ${checked} pilots checked, ${granted} granted, ${removed} removed`);
  return { checked, granted, removed };
}

// Backfill

async function backfillBadge(pb, badge) {
  if (badge.type === 'event') return 0; // only its own feature awards it
  if (badge.type === 'if_role') {
    const { granted } = await syncAllRoleBadges(pb);
    return granted;
  }
  const pilots = await pb.collection('users').getFullList({
    filter: `total_hours >= ${Number(badge.hours_required) || 0}`,
    fields: 'id',
    requestKey: null,
  });
  const owned = await pb.collection('pilot_badges').getFullList({
    filter: `badge = "${escFilterValue(badge.id)}"`,
    fields: 'user',
    requestKey: null,
  });
  const ownedBy = new Set(owned.map(o => o.user));
  const created = await grant(pb, badge.id, pilots.map(p => p.id).filter(id => !ownedBy.has(id)));
  console.log(`[badges] backfilled "${badge.name}" to ${created.length} pilot(s)`);
  return created.length;
}

module.exports = {
  awardHourBadges, backfillBadge, handleMissingCollections,
  syncRoleBadgesForPilot, syncAllRoleBadges,
};
