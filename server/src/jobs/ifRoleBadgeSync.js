/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { syncAllRoleBadges, handleMissingCollections } = require('../services/badges');

const DAY_MS = 24 * 60 * 60 * 1000;

async function runIfRoleBadgeSync() {
  try {
    const pb = await getAdminClient();
    return await syncAllRoleBadges(pb);
  } catch (err) {
    if (!handleMissingCollections(err)) console.error('[if-role-badges] sync failed:', err.message);
    return null;
  }
}

function scheduleIfRoleBadgeSync() {
  console.log('[if-role-badges] scheduler registered — first run in 10min, then every 24h');
  setTimeout(runIfRoleBadgeSync, 10 * 60 * 1000);
  setInterval(runIfRoleBadgeSync, DAY_MS);
}

module.exports = { runIfRoleBadgeSync, scheduleIfRoleBadgeSync };
