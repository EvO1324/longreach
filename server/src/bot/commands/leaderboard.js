/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');
const { getAdminClient } = require('../../config/pocketbase');
const { escFilterValue } = require('../../utils/pbFilter');

const { formatHours, getRanks } = require('../utils');

const MEDALS = ['🥇', '🥈', '🥉'];

const WINDOWS = [
  { name: 'All Time',  value: 'all'  },
  { name: 'This Year', value: 'year' },
  { name: 'Last 30d',  value: '30d'  },
  { name: 'Last 7d',   value: '7d'   },
];

function getFromDate(window) {
  if (window === 'all') return null;
  const d = new Date();
  if (window === 'year') return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
  if (window === '30d')  { d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
  if (window === '7d')   { d.setDate(d.getDate() - 7);  return d.toISOString().slice(0, 10); }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription(`Top ${brand.shortName} pilots by flight hours`.slice(0, 100))
    .addStringOption(opt =>
      opt.setName('period')
        .setDescription('Time window (default: All Time)')
        .setRequired(false)
        .addChoices(...WINDOWS)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const period  = interaction.options.getString('period') || 'all';
      const fromDate = getFromDate(period);
      const windowLabel = WINDOWS.find(w => w.value === period)?.name || 'All Time';

      const pb = await getAdminClient();

      let lines;

      if (period === 'all') {
        const [pilots, ranks] = await Promise.all([
          pb.collection('users').getList(1, 10, {
            filter: 'status = "approved"',
            sort: '-total_hours',
            requestKey: null,
          }),
          getRanks(),
        ]);

        if (!pilots.items.length) return interaction.editReply({ content: 'No pilots found.' });

        const getRankName = hours => {
          const earned = ranks.filter(r => hours >= r.hours_required);
          return earned.length ? earned[earned.length - 1].name : 'New Pilot';
        };

        lines = pilots.items.map((p, i) => {
          const medal = MEDALS[i] || `**${i + 1}.**`;
          const name  = `${p.first_name} ${(p.last_name || '').charAt(0).toUpperCase()}.`;
          return `${medal} **${name}** (${p.callsign || '—'}) — ${formatHours(p.total_hours)} · ${getRankName(p.total_hours || 0)}`;
        });

      } else {
        // Time window: aggregate from flights collection
        const flights = await pb.collection('flights').getFullList({
          filter: `status = "approved" && date >= "${escFilterValue(fromDate)}"`,
          fields: 'user,flight_time',
          requestKey: null,
        });

        if (!flights.length) {
          return interaction.editReply({ content: `No flights found in the last ${windowLabel.toLowerCase()}.` });
        }

        // Aggregate hours per user
        const userHours = {};
        flights.forEach(f => {
          userHours[f.user] = (userHours[f.user] || 0) + (f.flight_time || 0);
        });

        // Sort and take top 10
        const top10 = Object.entries(userHours)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        // Fetch user details for those IDs
        const userIds = top10.map(([id]) => id);
        const filter  = userIds.map(id => `id = "${id}"`).join(' || ');
        const [users, ranks] = await Promise.all([
          pb.collection('users').getFullList({ filter, fields: 'id,first_name,last_name,callsign,total_hours', requestKey: null }),
          getRanks(),
        ]);

        const userMap = Object.fromEntries(users.map(u => [u.id, u]));

        const getRankName = hours => {
          const earned = ranks.filter(r => hours >= r.hours_required);
          return earned.length ? earned[earned.length - 1].name : 'New Pilot';
        };

        lines = top10.map(([userId, hours], i) => {
          const p     = userMap[userId];
          if (!p) return null;
          const medal = MEDALS[i] || `**${i + 1}.**`;
          const name  = `${p.first_name} ${(p.last_name || '').charAt(0).toUpperCase()}.`;
          const rank  = getRankName(p.total_hours || 0);
          return `${medal} **${name}** (${p.callsign || '—'}) — ${formatHours(hours)} · ${rank}`;
        }).filter(Boolean);

        if (!lines.length) return interaction.editReply({ content: 'No pilots found for this period.' });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${brand.shortName} Leaderboard — ${windowLabel}`)
        .setColor(brand.embedColor('accent'))
        .setDescription(lines.join('\n'))
        .setFooter({ text: brand.shortName })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[leaderboard] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch leaderboard. Please try again.' });
    }
  },
};
