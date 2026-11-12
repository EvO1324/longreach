/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');

const API_BASE = brand.apiUrl;

const DEV_DISCORD_IDS = (process.env.DISCORD_DEV_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

function isStaff(member) {
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;
  if (!staffRoleId) return false;
  return member.roles.cache.has(staffRoleId);
}

function isDeveloper(discordId) {
  return DEV_DISCORD_IDS.includes(discordId);
}

function canUseStaffCommand(interaction) {
  return isStaff(interaction.member) || isDeveloper(interaction.user.id);
}

/* * * Find a PocketBase user by discord_id */
async function getUserByDiscordId(discordId) {
  const pb = await getAdminClient();
  try {
    return await pb.collection('users').getFirstListItem(
      `discord_id = "${discordId}"`,
      { requestKey: null }
    );
  } catch {
    return null;
  }
}

async function getUserByIfc(ifcUsername) {
  const pb = await getAdminClient();
  try {
    return await pb.collection('users').getFirstListItem(
      `ifc_username = "${ifcUsername.replace(/["'\\]/g, '')}"`,
      { requestKey: null }
    );
  } catch {
    return null;
  }
}

/* * * Format hours into "Xh Ym" */
function formatHours(hours) {
  const h = Math.floor(hours || 0);
  const m = Math.round(((hours || 0) % 1) * 60);
  return `${h}h ${m}m`;
}

/* * * Get all ranks sorted by hours */
async function getRanks() {
  const pb = await getAdminClient();
  return pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null });
}

async function getRankForHours(hours) {
  const ranks = await getRanks();
  const earned = ranks.filter(r => hours >= r.hours_required);
  return earned.length ? earned[earned.length - 1] : null;
}

module.exports = { isStaff, isDeveloper, canUseStaffCommand, getUserByDiscordId, getUserByIfc, formatHours, getRanks, getRankForHours, API_BASE };
