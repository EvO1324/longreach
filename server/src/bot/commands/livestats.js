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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livestats')
    .setDescription('Your Live Mode flights and hours'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const pilot = await getLivePilot(interaction);
      if (!pilot) return;

      const pb = await getAdminClient();
      // Every bid, so the leaderboard position comes from the same pass
      const bids = await pb.collection('if_live_bids').getFullList({
        filter: `id != ""${orgFilter()}`,
        fields: 'pilot,status,legs',
        requestKey: null,
      });

      const hoursByPilot = new Map();
      let flights = 0, hours = 0, active = 0, pending = 0;
      for (const bid of bids) {
        const legs = countedLegs(bid);
        const legHours = legs.reduce((sum, l) => sum + (l.pirepFlightTime || 0), 0);
        if (legs.length) hoursByPilot.set(bid.pilot, (hoursByPilot.get(bid.pilot) || 0) + legHours);
        if (bid.pilot !== pilot.id) continue;
        flights += legs.length;
        hours += legHours;
        if (bid.status === 'active') active++;
        if (bid.status === 'pending') pending++;
      }

      const ranked = [...hoursByPilot.entries()].sort((a, b) => b[1] - a[1]);
      const position = ranked.findIndex(([id]) => id === pilot.id) + 1;

      const embed = new EmbedBuilder()
        .setTitle(`${shortName(pilot)}'s Live Mode stats`)
        .setColor(LIVE_COLOURS.green)
        .addFields(
          { name: 'Live flights', value: String(flights), inline: true },
          { name: 'Live hours', value: formatHours(hours), inline: true },
          { name: 'Leaderboard', value: position ? `#${position} of ${ranked.length}` : 'Not ranked yet', inline: true },
          { name: 'Active bookings', value: String(active), inline: true },
          { name: 'Pending bookings', value: String(pending), inline: true },
        )
        .setFooter({ text: brand.shortName })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[livestats] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch your Live stats. Please try again.' });
    }
  },
};
