/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');
const { getUserByDiscordId } = require('../utils');
const { getAdminClient } = require('../../config/pocketbase');

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

const GRADE_COLORS = {
  1: 0x909090,
  2: 0x1976d2,
  3: brand.embedColor('primary'),
  4: brand.embedColor('accent'),
  5: 0xc62828,
};

function fmtMins(mins) {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ifstats')
    .setDescription('View Infinite Flight stats for a pilot')
    .addUserOption(opt =>
      opt.setName('pilot')
         .setDescription('Tag a Discord user (leave blank for yourself)')
         .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('ifc')
         .setDescription('IFC username to look up directly')
         .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      let ifcUsername = interaction.options.getString('ifc');
      const discordTarget = interaction.options.getUser('pilot') || (!ifcUsername ? interaction.user : null);

      // Resolve IFC username from Discord user if needed
      if (!ifcUsername && discordTarget) {
        const pb   = await getAdminClient();
        const ccUser = await getUserByDiscordId(discordTarget.id);
        if (!ccUser) {
          const isSelf = discordTarget.id === interaction.user.id;
          return interaction.editReply({
            content: isSelf
              ? '❌ Your Discord account isn\'t linked to a crew centre account. Run `/verify` first.'
              : '❌ That user doesn\'t have a linked crew centre account.',
          });
        }
        ifcUsername = ccUser.ifc_username;
        if (!ifcUsername) {
          return interaction.editReply({ content: '❌ That pilot doesn\'t have an IFC username set.' });
        }
      }

      // Fetch IF stats by IFC username
      const res  = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discourseNames: [ifcUsername] }),
      });
      const data = await res.json();

      if (data.errorCode !== 0 || !data.result?.length) {
        return interaction.editReply({ content: `❌ No Infinite Flight account found for IFC username **${ifcUsername}**.` });
      }

      const s = data.result[0];
      const grade = s.grade ?? 1;

      const embed = new EmbedBuilder()
        .setTitle(`${s.discourseUsername || ifcUsername} — IF Stats`)
        .setColor(GRADE_COLORS[grade] || 0x909090)
        .addFields(
          { name: 'Grade',        value: `Grade ${grade}`,                               inline: true },
          { name: 'Flight Time',  value: fmtMins(s.flightTime),                          inline: true },
          { name: 'Flights',      value: (s.onlineFlights ?? 0).toLocaleString(),        inline: true },
          { name: 'Landings',     value: (s.landingCount ?? 0).toLocaleString(),         inline: true },
          { name: 'XP',           value: (s.xp ?? 0).toLocaleString(),                  inline: true },
          { name: 'Violations',   value: String(s.violations ?? 0),                     inline: true },
        )
        .setFooter({ text: 'Infinite Flight · Live data' })
        .setTimestamp();

      if (s.virtualOrganization) {
        embed.setDescription(`Virtual Org: ${s.virtualOrganization}`);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[ifstats] Error:', err);
      await interaction.editReply({ content: `❌ Failed to fetch IF stats: ${err.message}` });
    }
  },
};
