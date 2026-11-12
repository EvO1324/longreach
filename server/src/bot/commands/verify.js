/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const brand = require('../../config/brand');
const { getAdminClient } = require('../../config/pocketbase');
const { notifyVerified } = require('../../routes/discord');
const { syncRoleBadgesForPilot } = require('../../services/badges');

const FRONTEND_URL             = brand.frontendUrl;
const DISCORD_VERIFIED_ROLE_ID = process.env.DISCORD_VERIFIED_ROLE_ID;
const DISCORD_GUILD_ID         = process.env.DISCORD_GUILD_ID;
const UNVERIFIED_ROLE_ID       = process.env.DISCORD_UNVERIFIED_ROLE_ID || '1478636096735936512';
const IFATC_ROLE_ID            = process.env.DISCORD_IFATC_ROLE_ID || null;
const IFAET_ROLE_ID            = process.env.DISCORD_IFAET_ROLE_ID || null;
const IF_BASE                  = 'https://api.infiniteflight.com/public/v2';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription(`Verify your ${brand.shortName} crew centre account`.slice(0, 100))
    .addStringOption(opt =>
      opt.setName('ifc_username')
         .setDescription('Your Infinite Flight Community (IFC) username')
         .setRequired(true)
    ),

  async execute(interaction) {
    const ifcUsername = interaction.options.getString('ifc_username').trim().replace(/["'\\]/g, '');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const pb = await getAdminClient();

      let user;
      try {
        user = await pb.collection('users').getFirstListItem(
          `ifc_username = "${ifcUsername}" && status = "pending"`,
          { requestKey: null }
        );
      } catch {
        let existing;
        try {
          existing = await pb.collection('users').getFirstListItem(
            `ifc_username = "${ifcUsername}" && status = "approved"`,
            { requestKey: null }
          );
        } catch { existing = null; }

        if (existing) {
          return interaction.editReply({ content: '✅ Your account is already verified! Head to the crew centre to log in.' });
        }
        return interaction.editReply({
          content: `❌ No pending account found for IFC username **${ifcUsername}**.\nMake sure you've signed up at ${FRONTEND_URL}/signup first, and that your IFC username matches exactly.`,
        });
      }

      // Approve via direct REST to bypass collection rules
      const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
      const patchRes = await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({
          status:             'approved',
          recruitment_status: 'approved',
          discord_id:         interaction.user.id,
          discord_username:   interaction.user.username,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('[verify] Failed to approve user:', JSON.stringify(err));
        throw new Error('Failed to update user record');
      }

      // Assign Discord roles + nickname via REST API
      const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
      const discordApi = `https://discord.com/api/v10`;
      const headers = { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };

      const discordReq = (method, path, body) => fetch(`${discordApi}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      }).then(r => r.status === 204 ? null : r.json());

      let roleWarning = null;
      try {
        // Assign verified role
        if (DISCORD_VERIFIED_ROLE_ID) {
          await discordReq('PUT', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${DISCORD_VERIFIED_ROLE_ID}`);
          console.log(`[verify] Assigned verified role to ${interaction.user.username}`);
        }

        // Remove unverified role
        await discordReq('DELETE', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${UNVERIFIED_ROLE_ID}`)
          .catch(() => {});
        console.log(`[verify] Removed unverified role from ${interaction.user.username}`);

        // Assign starter rank role
        const ranks = await pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null });
        const starterRank = ranks[0];
        if (starterRank) {
          await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
            body: JSON.stringify({ rank: starterRank.id }),
          });
          if (starterRank.discord_role_id) {
            await discordReq('PUT', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${starterRank.discord_role_id}`);
            console.log(`[verify] Assigned starter rank role: ${starterRank.name}`);
          }
        }

        // Set nickname via REST
        const rawCallsign       = user.callsign || '';
        const num               = brand.callsign.number(rawCallsign);
        const formattedCallsign = num ? brand.callsign.short(num) : rawCallsign;
        const lastInitial       = (user.last_name || '').charAt(0).toUpperCase();
        const nickname          = `${user.first_name} ${lastInitial} - ${formattedCallsign}`;
        await discordReq('PATCH', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}`, { nick: nickname })
          .catch(err => console.warn(`[verify] Could not set nickname:`, err.message));
        console.log(`[verify] Nickname set: ${nickname}`);

        // Assign IFATC/IFAET Discord roles based on IF roles
        try {
          const ifRes = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discourseNames: [user.ifc_username] }),
          });
          const ifData = await ifRes.json();
          const ifRoles = ifData.result?.[0]?.roles || [];
          // Same roles drive the crew centre's IF role badges (IFATC, IFAET, …).
          if (ifData.result?.[0]) await syncRoleBadgesForPilot(pb, user.id, ifRoles);

          if (IFATC_ROLE_ID && ifRoles.includes(64)) {
            await discordReq('PUT', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${IFATC_ROLE_ID}`);
            console.log(`[verify] Assigned IFATC role to ${interaction.user.username}`);
          } else if (IFATC_ROLE_ID) {
            await discordReq('DELETE', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${IFATC_ROLE_ID}`).catch(() => {});
          }

          if (IFAET_ROLE_ID && ifRoles.includes(68)) {
            await discordReq('PUT', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${IFAET_ROLE_ID}`);
            console.log(`[verify] Assigned IFAET role to ${interaction.user.username}`);
          } else if (IFAET_ROLE_ID) {
            await discordReq('DELETE', `/guilds/${DISCORD_GUILD_ID}/members/${interaction.user.id}/roles/${IFAET_ROLE_ID}`).catch(() => {});
          }
        } catch (err) {
          console.warn(`[verify] Could not assign IF roles:`, err.message);
        }

      } catch (err) {
        console.error('[verify] Could not assign Discord roles/nickname:', err.message, err.code);
        roleWarning = '\n\n⚠️ Your account is verified but Discord roles could not be assigned automatically. Please ask an admin to run the rank sync or assign your roles manually.';
      }

      await interaction.editReply({
        content: `🎉 Welcome aboard, **${user.first_name}**! Your account is now verified.\nCallsign: **${user.callsign}**\nHead to ${FRONTEND_URL} to log in and start flying!${roleWarning || ''}`,
      });

      notifyVerified({ first_name: user.first_name, last_name: user.last_name, callsign: user.callsign, ifc_username: user.ifc_username, discord_username: interaction.user.username }).catch(() => {});
      console.log(`[verify] Verified ${user.first_name} ${user.last_name} (${ifcUsername})`);

    } catch (err) {
      console.error('[verify] Error:', err);
      await interaction.editReply({ content: '❌ Something went wrong. Please try again or contact an admin.' });
    }
  },
};
