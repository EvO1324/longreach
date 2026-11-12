/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder } = require('discord.js');
const { isStaff, getUserByDiscordId } = require('../../utils');
const { getAdminClient } = require('../../../config/pocketbase');

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

async function lookupIfUserId(discourseUsername) {
  if (!discourseUsername || !process.env.IF_API_KEY) return null;
  try {
    const res = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discourseNames: [discourseUsername] }),
    });
    const data = await res.json();
    if (data.errorCode !== 0 || !data.result?.length) return null;
    const match = data.result.find(u => u.discourseUsername?.toLowerCase() === discourseUsername.toLowerCase());
    return match?.userId || null;
  } catch (err) {
    console.warn('[linkifc] IF lookup failed:', err.message);
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkifc')
    .setDescription('[Staff] Link an IFC username to a pilot\'s account')
    .addUserOption(opt =>
      opt.setName('discord_user')
         .setDescription('The pilot\'s Discord account')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('ifc_username')
         .setDescription('The IFC username to link')
         .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    if (!isStaff(interaction.member)) {
      return interaction.editReply({ content: '❌ You don\'t have permission to use this command.' });
    }

    const discordUser = interaction.options.getUser('discord_user');
    const ifcUsername = interaction.options.getString('ifc_username').trim().replace(/["'\\]/g, '');

    try {
      const user = await getUserByDiscordId(discordUser.id);
      if (!user) {
        return interaction.editReply({ content: `❌ <@${discordUser.id}> doesn't have a linked crew centre account.` });
      }

      const pb = await getAdminClient();

      // Check IFC username isn't already taken by someone else
      try {
        const existing = await pb.collection('users').getFirstListItem(
          `ifc_username = "${ifcUsername}" && id != "${user.id}"`,
          { requestKey: null }
        );
        if (existing) {
          return interaction.editReply({ content: `❌ IFC username **${ifcUsername}** is already linked to another pilot (${existing.first_name} ${(existing.last_name || '').charAt(0).toUpperCase()}.).` });
        }
      } catch {} // not found = good

      await interaction.editReply({ content: `🔍 Looking up IF account for **@${ifcUsername}**...` });
      const ifUserId = await lookupIfUserId(ifcUsername);

      const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
      const patchRes = await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({
          ifc_username: ifcUsername,
          if_user_id:   ifUserId || '',
        }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('[linkifc] PB patch failed:', JSON.stringify(err));
        return interaction.editReply({ content: '❌ Failed to update the user record.' });
      }

      console.log(`[linkifc] ${interaction.user.username} linked IFC @${ifcUsername} (IF ID: ${ifUserId || 'not found'}) to ${user.first_name} ${user.last_name}`);

      const ifStatus = ifUserId
        ? `✅ Infinite Flight account found — auto-approval is now enabled for this pilot`
        : `⚠️ No matching Infinite Flight account found for **@${ifcUsername}** — IFC username saved but auto-approval won't work until the username matches their actual IF account`;

      await interaction.editReply({
        content: `✅ IFC username **@${ifcUsername}** linked to **${user.first_name} ${(user.last_name || '').charAt(0).toUpperCase()}.** (<@${discordUser.id}>)\n${ifStatus}`,
      });

    } catch (err) {
      console.error('[linkifc] Error:', err);
      await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
  },
};
