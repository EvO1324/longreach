/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const brand = require('../config/brand');

const DISCORD_RANKUP_CHANNEL_ID = process.env.DISCORD_RANKUP_CHANNEL_ID;
const DISCORD_GUILD_ID          = process.env.DISCORD_GUILD_ID;
const DISCORD_BOT_TOKEN         = process.env.DISCORD_BOT_TOKEN;

const DISCORD_API = 'https://discord.com/api/v10';

// Helper: Discord REST calls
async function discordRequest(method, path, body) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Discord API ${method} ${path} → ${res.status}: ${JSON.stringify(err)}`);
  }
  // 204 No Content has no body
  if (res.status === 204) return null;
  return res.json();
}

// Main export
async function notifyRankUp({ discordId, pilotName, callsign, rankName, rankIcon, newHours, newRoleId, allRankRoleIds = [], suppressMessage = false }) {
  if (!DISCORD_BOT_TOKEN) {
    console.warn('[rankup] No DISCORD_BOT_TOKEN — skipping notification');
    return;
  }

  try {
    const hoursH = Math.floor(newHours);
    const hoursM = Math.round((newHours % 1) * 60);

    // Post rank-up message to channel
    if (DISCORD_RANKUP_CHANNEL_ID && !suppressMessage) {
      const mention = discordId ? `<@${discordId}>` : `**${pilotName}**`;
      await discordRequest('POST', `/channels/${DISCORD_RANKUP_CHANNEL_ID}/messages`, {
        content:
          `${rankIcon || brand.emoji()} ${mention} has ranked up to **${rankName}**! ` +
          `(${hoursH}h ${hoursM}m total) Callsign: **${callsign}** — congratulations! 🎉`,
      }).catch(err => console.error('[rankup] Failed to send channel message:', err.message));
      console.log(`[rankup] Message sent for ${pilotName} → ${rankName}`);
    }

    // Assign rank role + remove old rank roles
    if (discordId && newRoleId && DISCORD_GUILD_ID) {
      // Remove old rank roles one by one (REST doesn't support bulk remove)
      const rolesToRemove = allRankRoleIds.filter(id => id && id !== newRoleId);
      for (const roleId of rolesToRemove) {
        await discordRequest('DELETE', `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`)
          .catch(() => {}); // ignore if they don't have it
      }

      // Assign new rank role
      await discordRequest('PUT', `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${newRoleId}`);
      console.log(`[rankup] Role ${newRoleId} assigned to ${pilotName}`);
    }
  } catch (err) {
    console.error('[rankup] Error:', err.message);
  }
}

// setClient is kept as a no-op so bot/index.js doesn't need changes
function setClient() {}

module.exports = { notifyRankUp, setClient };
