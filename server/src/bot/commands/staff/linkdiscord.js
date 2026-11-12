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

const DISCORD_VERIFIED_ROLE_ID = process.env.DISCORD_VERIFIED_ROLE_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkdiscord')
    .setDescription('[Staff] Link a Discord account to a pilot\'s crew centre account')
    .addStringOption(opt =>
      opt.setName('ifc_username')
         .setDescription('The pilot\'s IFC username')
         .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('discord_user')
         .setDescription('The Discord account to link')
         .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    if (!isStaff(interaction.member)) {
      return interaction.editReply({ content: '❌ You don\'t have permission to use this command.' });
    }

    const ifcUsername  = interaction.options.getString('ifc_username').trim().replace(/["'\\]/g, '');
    const discordUser  = interaction.options.getUser('discord_user');

    try {
      const user = await getUserByIfc(ifcUsername);
      if (!user) {
        return interaction.editReply({ content: `❌ No crew centre account found for IFC username **${ifcUsername}**.` });
      }

      const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
      const { getAdminClient } = require('../../../config/pocketbase');
      const pb = await getAdminClient();

      const patchRes = await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({
          discord_id:       discordUser.id,
          discord_username: discordUser.username,
        }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('[linkdiscord] PB patch failed:', JSON.stringify(err));
        return interaction.editReply({ content: '❌ Failed to update the user record.' });
      }

      // Assign verified role, nickname, and starter rank
      try {
        const member = await interaction.guild.members.fetch(discordUser.id);
        if (DISCORD_VERIFIED_ROLE_ID && !member.roles.cache.has(DISCORD_VERIFIED_ROLE_ID)) {
          await member.roles.add(DISCORD_VERIFIED_ROLE_ID);
        }
        // Update nickname
        const rawCallsign = user.callsign || '';
        const num = brand.callsign.number(rawCallsign);
        const formattedCallsign = num ? brand.callsign.short(num) : rawCallsign;
        const lastInitial = (user.last_name || '').charAt(0).toUpperCase();
        await member.setNickname(`${user.first_name} ${lastInitial} - ${formattedCallsign}`);

        // Assign starter rank and its Discord role if not already set
        const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
        const ranks = await pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null });
        const starterRank = ranks[0];
        if (starterRank && !user.rank) {
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
        console.error('[linkdiscord] Role/nickname error:', err.message);
      }

      console.log(`[linkdiscord] ${interaction.user.username} linked Discord @${discordUser.username} to ${user.first_name} ${user.last_name} (${ifcUsername})`);

      await interaction.editReply({
        content: `✅ <@${discordUser.id}> has been linked to **${user.first_name} ${(user.last_name || '').charAt(0).toUpperCase()}.** (IFC: @${ifcUsername}).`,
      });

    } catch (err) {
      console.error('[linkdiscord] Error:', err);
      await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
  },
};
