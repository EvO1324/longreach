/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');
const { getUserByDiscordId, formatHours, getRankForHours } = require('../utils');
const { getAdminClient } = require('../../config/pocketbase');

const FRONTEND_URL = brand.frontendUrl;

async function findUserBySearch(query) {
  const pb = await getAdminClient();
  const q  = query.replace(/['"\\]/g, '').trim();

  const num = brand.callsign.number(q);
  const callsignVariants = num ? [q, brand.callsign.format(num)] : [q];

  for (const variant of callsignVariants) {
    try {
      return await pb.collection('users').getFirstListItem(
        `callsign = "${variant}" && status = "approved"`, { requestKey: null }
      );
    } catch {}
  }

  // Name search
  try {
    const results = await pb.collection('users').getList(1, 5, {
      filter: `(first_name ~ "${q}" || last_name ~ "${q}") && status = "approved"`,
      requestKey: null,
    });
    if (results.items.length === 1) return results.items[0];
    if (results.items.length > 1) return { multiple: results.items };
  } catch {}

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View crew centre stats for a pilot')
    .addUserOption(opt =>
      opt.setName('pilot')
         .setDescription('Tag a Discord user')
         .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('search')
         .setDescription(`Search by callsign (${brand.callsign.short(1)}) or name`.slice(0, 100))
         .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      let user = null;
      const discordTarget = interaction.options.getUser('pilot');
      const searchQuery   = interaction.options.getString('search');

      if (discordTarget) {
        user = await getUserByDiscordId(discordTarget.id);
        if (!user) return interaction.editReply({ content: `❌ ${discordTarget.username} doesn't have a linked crew centre account.` });
      } else if (searchQuery) {
        const result = await findUserBySearch(searchQuery);
        if (!result) return interaction.editReply({ content: `❌ No pilot found matching **${searchQuery}**.` });
        if (result.multiple) {
          const names = result.multiple.map(u => `${u.first_name} ${(u.last_name || '').charAt(0).toUpperCase()}. (${u.callsign})`).join('\n');
          return interaction.editReply({ content: `Multiple pilots matched — be more specific:\n${names}` });
        }
        user = result;
      } else {
        user = await getUserByDiscordId(interaction.user.id);
        if (!user) return interaction.editReply({ content: '❌ Your Discord isn\'t linked. Run `/verify` first.' });
      }

      const pb = await getAdminClient();
      const [rank, recentFlights] = await Promise.all([
        getRankForHours(user.total_hours || 0),
        pb.collection('flights').getList(1, 5, {
          filter: pb.filter('user = {:id} && status = "approved"', { id: user.id }),
          sort: '-date',
          requestKey: null,
        }),
      ]);

      const embed = new EmbedBuilder()
        .setTitle(`${user.first_name} ${(user.last_name || '').charAt(0).toUpperCase()}.`)
        .setColor(brand.embedColor('primary'))
        .addFields(
          { name: 'Callsign',      value: user.callsign || '—',              inline: true },
          { name: 'Rank',          value: rank?.name || 'New Pilot',          inline: true },
          { name: 'Total Hours',   value: formatHours(user.total_hours || 0), inline: true },
          { name: 'Total Flights', value: `${user.total_flights || 0}`,       inline: true },
          { name: 'IFC',           value: user.ifc_username ? `@${user.ifc_username}` : '—', inline: true },
          { name: 'Status',        value: user.status === 'approved' ? 'Active' : user.status, inline: true },
        )
        .setFooter({ text: `${brand.shortName} · ${FRONTEND_URL}` })
        .setTimestamp();

      if (recentFlights.items.length > 0) {
        const list = recentFlights.items
          .map(f => `\`${f.flight_number || '—'}\` ${f.departure_icao || '?'} → ${f.arrival_icao || '?'} (${formatHours(f.flight_time)})`)
          .join('\n');
        embed.addFields({ name: 'Recent Flights', value: list });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[stats] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch stats.' });
    }
  },
};
