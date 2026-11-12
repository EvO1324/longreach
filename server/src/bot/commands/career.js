/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');
const { getUserByDiscordId, formatHours } = require('../utils');
const { getAdminClient } = require('../../config/pocketbase');
const { escFilterValue } = require('../../utils/pbFilter');

const FRONTEND_URL = brand.frontendUrl;

const HUB_NAMES = Object.fromEntries(brand.hubs.map(h => [h.icao.toUpperCase(), h.name || h.icao.toUpperCase()]));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('career')
    .setDescription('View your Career Mode status'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const user = await getUserByDiscordId(interaction.user.id);

      if (!user) {
        return interaction.editReply({
          content: `❌ Your Discord isn't linked to a crew centre account. Run \`/verify\` first.`,
        });
      }

      if (!user.career_active) {
        return interaction.editReply({
          content: `✈️ You're not enrolled in Career Mode yet.\n🔗 **Enrol here:** ${FRONTEND_URL}/career`,
        });
      }

      const pb = await getAdminClient();

      // Get available routes from current position
      const allRoutes = await pb.collection('routes').getFullList({
        filter: `active = true && departure_icao = "${escFilterValue(user.career_current_icao?.toUpperCase())}"`,
        fields: 'aircraft,flight_number,arrival_icao,duration_min',
        requestKey: null,
      }).catch(() => []);

      const matchingRoutes = allRoutes.filter(r => {
        try {
          const arr = typeof r.aircraft === 'string' ? JSON.parse(r.aircraft) : r.aircraft;
          const list = Array.isArray(arr) ? arr : [arr];
          return list.some(a => (typeof a === 'string' ? a : a?.name) === user.career_aircraft);
        } catch { return false; }
      });

      // Ferry status
      const lastFerry = user.career_last_ferry_at ? new Date(user.career_last_ferry_at) : null;
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const canFerry = !lastFerry || lastFerry < oneWeekAgo;

      const hubName = HUB_NAMES[user.career_hub] || user.career_hub || '—';
      const hoursDisplay = formatHours(user.career_total_hours || 0);

      const embed = new EmbedBuilder()
        .setTitle(`${user.first_name}'s Career Mode`)
        .setColor(brand.embedColor('primary'))
        .addFields(
          { name: '✈️ Aircraft',         value: user.career_aircraft || '—',                    inline: true },
          { name: '🏠 Home Hub',          value: `${user.career_hub} — ${hubName}`,              inline: true },
          { name: '📍 Current Position',  value: user.career_current_icao || '—',                inline: true },
          { name: '🛫 Career Flights',    value: `${user.career_total_flights || 0}`,            inline: true },
          { name: '⏱️ Career Hours',      value: hoursDisplay,                                   inline: true },
          { name: '⛽ Ferry Available',   value: canFerry ? 'Yes' : 'No (once per week)',         inline: true },
        )
        .setFooter({ text: `${brand.shortName} · ${FRONTEND_URL}/career` })
        .setTimestamp();

      if (matchingRoutes.length > 0) {
        const routeList = matchingRoutes.slice(0, 5)
          .map(r => {
            const dur = r.duration_min ? `${Math.floor(r.duration_min / 60)}h ${r.duration_min % 60}m` : '';
            return `\`${r.flight_number}\` → **${r.arrival_icao}**${dur ? ` · ${dur}` : ''}`;
          })
          .join('\n');
        const extra = matchingRoutes.length > 5 ? `\n*+${matchingRoutes.length - 5} more*` : '';
        embed.addFields({ name: `🗺️ Routes from ${user.career_current_icao} (${matchingRoutes.length})`, value: routeList + extra });
      } else {
        embed.addFields({ name: `🗺️ Routes from ${user.career_current_icao}`, value: '*No routes available — consider a ferry flight*' });
      }

      embed.addFields({ name: '\u200b', value: `[Open Career Mode](${FRONTEND_URL}/career)` });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[career] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch career status.' });
    }
  },
};
