/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');

const INVITE_CHANNEL_ID = process.env.DISCORD_INVITE_CHANNEL_ID || null;

async function createDiscordInvite(pilotId = null) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error('Bot token not configured');
  if (!INVITE_CHANNEL_ID) throw new Error('DISCORD_INVITE_CHANNEL_ID not configured');

  const response = await fetch(`https://discord.com/api/v10/channels/${INVITE_CHANNEL_ID}/invites`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      max_age:  0,
      max_uses: 1,
      unique:   true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Discord API error (${response.status})`);
  }

  const invite = await response.json();
  const invite_url = `https://discord.gg/${invite.code}`;

  if (pilotId) {
    try {
      const pb = await getAdminClient();
      await pb.collection('users').update(pilotId, {
        discord_invite_url:     invite_url,
        discord_invite_sent_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[createDiscordInvite] could not store invite on user:', e.message, '| pilotId:', pilotId);
    }
  }

  return invite_url;
}

module.exports = { createDiscordInvite };
