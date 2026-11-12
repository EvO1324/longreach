/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { adminPatch } = require('../config/pocketbase');
const { sortRanks } = require('./rankAccess');
const { notifyRankUp } = require('../bot/rankup');
const { awardHourBadges } = require('./badges');

// Helper: update user stats via direct REST (bypasses collection rules)
async function updateUserStats(pb, userId, totalFlights, totalHours) {
  await adminPatch(userId, { total_flights: totalFlights, total_hours: totalHours });
}

async function updateVaStats(pb, delta) {
  try {
    let rec;
    try {
      rec = await pb.collection('va_stats').getFirstListItem('', { requestKey: null });
    } catch {
      rec = await pb.collection('va_stats').create({
        total_flights: 0, total_hours: 0, total_distance_nm: 0,
        total_approved_pireps: 0, total_auto_approved: 0,
        total_multiplied_flights: 0, total_multiplied_hours: 0,
      });
    }
    const patch = {};
    for (const [k, v] of Object.entries(delta)) {
      if (v !== undefined && v !== 0) {
        patch[k] = parseFloat(((rec[k] || 0) + v).toFixed(4));
      }
    }
    if (Object.keys(patch).length > 0) {
      await pb.collection('va_stats').update(rec.id, patch);
    }
  } catch (err) {
    console.error('[va_stats] update failed:', err.message);
  }
}

async function recalculateRank(pb, userId, newHours, { silent = false } = {}) {
  await awardHourBadges(pb, userId, newHours);

  try {
    const [ranks, user] = await Promise.all([
      pb.collection('ranks').getFullList({ requestKey: null, sort: 'hours_required' }),
      pb.collection('users').getOne(userId, { requestKey: null }),
    ]);

    // Highest rank the pilot has now earned
    const correctRank = sortRanks(ranks).filter(r => newHours >= r.hours_required).pop();
    if (!correctRank) return; // below first rank threshold

    const prevRankId  = user.rank || null;
    const rankChanged = correctRank.id !== prevRankId;

    await adminPatch(userId, { rank: correctRank.id });

    if (rankChanged) {
      const prevRank = ranks.find(r => r.id === prevRankId);
      console.log(`[rankup] ${user.first_name} ${user.last_name}: ${prevRank?.name || 'none'} → ${correctRank.name} (${newHours.toFixed(1)}h)`);
    }

    // Notify Discord only on actual rank change and not during silent bulk import
    if (rankChanged && !silent) {
      const allRankRoleIds = ranks
        .map(r => process.env[`DISCORD_RANK_ROLE_${r.id}`])
        .filter(Boolean);
      const newRoleId = process.env[`DISCORD_RANK_ROLE_${correctRank.id}`];
      console.log(`[rankup] rank id=${correctRank.id} newRoleId=${newRoleId || 'NOT SET'} discordId=${user.discord_id || 'NOT SET'}`);

      await notifyRankUp({
        discordId:      user.discord_id || null,
        pilotName:      `${user.first_name} ${user.last_name}`,
        callsign:       user.callsign || '',
        rankName:       correctRank.name,
        rankIcon:       correctRank.icon || '🎖',
        newHours,
        newRoleId:      newRoleId || null,
        allRankRoleIds,
        guildId:        process.env.DISCORD_GUILD_ID || null,
      });
    }
  } catch (err) {
    console.error('[rankup] recalculate failed:', err.message);
  }
}

async function checkRankUp(pb, userId, _oldHours, newHours) {
  return recalculateRank(pb, userId, newHours, { silent: false });
}

module.exports = { updateUserStats, updateVaStats, recalculateRank, checkRankUp };
