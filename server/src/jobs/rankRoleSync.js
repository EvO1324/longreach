/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');

const { notifyRankSync } = require('../routes/discord');

let _client = null;
function setClient(client) { _client = client; }

async function runRankRoleSync({ silent = false } = {}) {
  const label = '[rank-role-sync]';
  console.log(`${label} starting...`);

  if (!_client?.isReady()) {
    console.warn(`${label} Discord bot not ready — skipping`);
    return { synced: 0, skipped: 0, errors: 0, reason: 'bot not ready' };
  }

  const pb = await getAdminClient();

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const guild    = GUILD_ID ? _client.guilds.cache.get(GUILD_ID) : _client.guilds.cache.first();
  if (!guild) {
    console.warn(`${label} Guild not found — skipping`);
    return { synced: 0, skipped: 0, errors: 0, reason: 'guild not found' };
  }

  await guild.roles.fetch();

  const [pilots, ranks] = await Promise.all([
    pb.collection('users').getFullList({
      filter: 'status = "approved"',
      fields: 'id,first_name,last_name,callsign,discord_id,total_hours,rank',
      requestKey: null,
    }),
    pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null }),
  ]);

  const allRankRoleIds = ranks.map(r => r.discord_role_id).filter(Boolean);
  let synced = 0, skipped = 0, errors = 0;

  for (const pilot of pilots) {
    if (!pilot.discord_id) {
      skipped++;
      continue;
    }

    const hours       = pilot.total_hours || 0;
    const correctRank = [...ranks].reverse().find(r => hours >= r.hours_required);

    if (!correctRank?.discord_role_id) {
      skipped++;
      continue;
    }

    const newRole = guild.roles.cache.get(correctRank.discord_role_id);
    if (!newRole) {
      skipped++;
      console.warn(`${label} Role ${correctRank.discord_role_id} not found for ${pilot.callsign}`);
      continue;
    }

    try {
      const member = await guild.members.fetch({ user: pilot.discord_id, force: false }).catch(() => null);
      if (!member) { skipped++; continue; }

      const toRemove = allRankRoleIds
        .filter(id => id !== correctRank.discord_role_id)
        .map(id => guild.roles.cache.get(id))
        .filter(r => r && member.roles.cache.has(r.id));

      const alreadyHasRole = member.roles.cache.has(newRole.id);

      // Skip if already correct and nothing to remove
      if (alreadyHasRole && toRemove.length === 0) {
        skipped++;
        continue;
      }

      if (toRemove.length > 0) await member.roles.remove(toRemove);
      if (!alreadyHasRole)    await member.roles.add(newRole);

      synced++;
      if (!silent) console.log(`${label} ${pilot.callsign} → ${correctRank.name}`);
    } catch (err) {
      errors++;
      console.error(`${label} ${pilot.callsign}:`, err.message);
    }
  }

  console.log(`${label} done — synced:${synced} skipped:${skipped} errors:${errors}`);

  await notifyRankSync({ synced, errors });

  return { synced, skipped, errors, total: pilots.length };
}

function scheduleRankRoleSync(client) {
  _client = client;
  console.log('[rank-role-sync] scheduler registered — first run in 5min, then every 24h');

  // First run shortly after startup so any drift from downtime is fixed quickly
  setTimeout(async () => {
    try { await runRankRoleSync({ silent: true }); }
    catch (err) { console.error('[rank-role-sync] startup run failed:', err.message); }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try { await runRankRoleSync({ silent: true }); }
    catch (err) { console.error('[rank-role-sync] scheduled run failed:', err.message); }
  }, 24 * 60 * 60 * 1000);
}

module.exports = { runRankRoleSync, scheduleRankRoleSync, setClient };
