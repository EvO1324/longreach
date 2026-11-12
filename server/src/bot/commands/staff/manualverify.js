/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder } = require('discord.js');
const brand = require('../../../config/brand');
const { isStaff, getUserByIfc } = require('../../utils');
const { notifyVerified } = require('../../../routes/discord');
const { getAdminClient } = require('../../../config/pocketbase');

const DISCORD_VERIFIED_ROLE_ID = process.env.DISCORD_VERIFIED_ROLE_ID;
const FRONTEND_URL = brand.frontendUrl;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manualverify')
    .setDescription('[Staff] Manually verify a pilot\'s account')
    .addStringOption(opt =>
      opt.setName('ifc_username')
         .setDescription('The pilot\'s IFC username')
         .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('discord_user')
         .setDescription('The pilot\'s Discord account')
         .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    if (!isStaff(interaction.member)) {
      return interaction.editReply({ content: '❌ You don\'t have permission to use this command.' });
    }

    const ifcUsername = interaction.options.getString('ifc_username').trim().replace(/["'\\]/g, '');
    const discordUser = interaction.options.getUser('discord_user');

    try {
      const pb = await getAdminClient();

      // Find user by IFC username (any status)
      let user;
      try {
        user = await pb.collection('users').getFirstListItem(
          `ifc_username = "${ifcUsername}"`,
          { requestKey: null }
        );
      } catch {
        return interaction.editReply({ content: `❌ No account found for IFC username **${ifcUsername}**.` });
      }

      if (user.status === 'approved') {
        return interaction.editReply({ content: `⚠️ **${user.first_name} ${(user.last_name || '').charAt(0).toUpperCase()}.** is already verified.` });
      }

      // Approve and link Discord
      const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
      const patchRes = await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({
          status:             'approved',
          recruitment_status: 'approved',
          discord_id:         discordUser.id,
          discord_username:   discordUser.username,
        }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('[manualverify] PB patch failed:', JSON.stringify(err));
        return interaction.editReply({ content: '❌ Failed to update the user record. Check PocketBase.' });
      }

      // Assign verified role + nickname in Discord
      try {
        const member = await interaction.guild.members.fetch(discordUser.id);
        if (DISCORD_VERIFIED_ROLE_ID) await member.roles.add(DISCORD_VERIFIED_ROLE_ID);

        // Remove unverified role if present
        const unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID;
        if (unverifiedRoleId) {
          const unverifiedRole = member.roles.cache.get(unverifiedRoleId);
          if (unverifiedRole) await member.roles.remove(unverifiedRoleId);
        }

        const rawCallsign = user.callsign || '';
        const num = brand.callsign.number(rawCallsign);
        const formattedCallsign = num ? brand.callsign.short(num) : rawCallsign;
        const lastInitial = (user.last_name || '').charAt(0).toUpperCase();
        await member.setNickname(`${user.first_name} ${lastInitial} - ${formattedCallsign}`);

        // Assign starter rank and its Discord role
        const ranks = await pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null });
        const starterRank = ranks[0];
        if (starterRank) {
          await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
            body: JSON.stringify({ rank: starterRank.id }),
          });
          const rankRoleId = process.env[`DISCORD_RANK_ROLE_${starterRank.id}`];
          if (rankRoleId) {
            const rankRole = await interaction.guild.roles.fetch(rankRoleId).catch(() => null);
            if (rankRole) await member.roles.add(rankRole);
          }
        }
      } catch (err) {
        console.error('[manualverify] Role/nickname error:', err.message);
      }

      notifyVerified({ first_name: user.first_name, last_name: user.last_name, callsign: user.callsign, ifc_username: user.ifc_username, discord_username: discordUser.username }).catch(() => {});
      console.log(`[manualverify] ${interaction.user.username} verified ${user.first_name} ${user.last_name} (${ifcUsername}) → ${discordUser.username}`);

      await interaction.editReply({
        content: `✅ **${user.first_name} ${(user.last_name || '').charAt(0).toUpperCase()}.** (${ifcUsername}) has been verified and linked to <@${discordUser.id}>.\nCallsign: **${user.callsign}**`,
      });

    } catch (err) {
      console.error('[manualverify] Error:', err);
      await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
  },
};
