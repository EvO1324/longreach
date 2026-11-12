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
const { formatHours } = require('../utils');
const { countedLegs } = require('../../routes/ifLive');
const { LIVE_COLOURS, getLivePilot, shortName, orgFilter } = require('../liveUtils');

const MEDALS = ['🥇', '🥈', '🥉'];
const TOP_N = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('liveleaderboard')
    .setDescription('Top Live Mode pilots')
    .addStringOption(opt =>
      opt.setName('by')
        .setDescription('Rank by hours or flights (default: hours)')
        .addChoices(
          { name: 'Hours', value: 'hours' },
          { name: 'Flights', value: 'flights' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const pilot = await getLivePilot(interaction);
      if (!pilot) return;

      const by = interaction.options.getString('by') || 'hours';
      const pb = await getAdminClient();
      const bids = await pb.collection('if_live_bids').getFullList({
        filter: `id != ""${orgFilter()}`,
        expand: 'pilot',
        requestKey: null,
      });

      const byPilot = new Map();
      for (const bid of bids) {
        const legs = countedLegs(bid);
        if (!legs.length) continue;
        if (!byPilot.has(bid.pilot)) byPilot.set(bid.pilot, { pilot: bid.expand?.pilot, flights: 0, hours: 0 });
        const entry = byPilot.get(bid.pilot);
        for (const leg of legs) {
          entry.flights++;
          entry.hours += leg.pirepFlightTime || 0;
        }
      }

      const ranked = [...byPilot.values()].sort((a, b) =>
        by === 'flights' ? (b.flights - a.flights) || (b.hours - a.hours) : (b.hours - a.hours) || (b.flights - a.flights));

      if (!ranked.length) {
        return interaction.editReply({ content: 'No Live flights have been logged yet.' });
      }

      const lines = ranked.slice(0, TOP_N).map((e, i) => {
        const medal = MEDALS[i] || `**${i + 1}.**`;
        const callsign = e.pilot?.callsign || '—';
        return `${medal} **${shortName(e.pilot)}** (${callsign}) — ${formatHours(e.hours)}, ${e.flights} ${e.flights === 1 ? 'flight' : 'flights'}`;
      });

      // Show the caller's own spot if they're outside the top 10
      const myIndex = ranked.findIndex(e => e.pilot?.id === pilot.id);
      if (myIndex >= TOP_N) {
        const me = ranked[myIndex];
        lines.push('', `**${myIndex + 1}.** **${shortName(pilot)}** (you) — ${formatHours(me.hours)}, ${me.flights} ${me.flights === 1 ? 'flight' : 'flights'}`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`Live Mode Leaderboard — by ${by === 'flights' ? 'Flights' : 'Hours'}`)
        .setColor(LIVE_COLOURS.gold)
        .setDescription(lines.join('\n'))
        .setFooter({ text: brand.shortName })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[liveleaderboard] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch the Live leaderboard. Please try again.' });
    }
  },
};
