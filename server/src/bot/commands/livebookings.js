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
const { FRONTEND_URL, LIVE_COLOURS, getLivePilot, shortName, discordTime } = require('../liveUtils');

const MAX_SHOWN = 10;

function routeLine(legs) {
  const chains = [];
  for (const leg of legs) {
    const last = chains[chains.length - 1];
    if (last && last[last.length - 1] === leg.originIcao) last.push(leg.destIcao);
    else chains.push([leg.originIcao, leg.destIcao]);
  }
  return chains.map(c => c.join(' → ')).join(', ');
}

function legLine(leg) {
  const when = leg.departureUtc ? discordTime(leg.departureUtc, 'f') : 'No set time';
  let state = '';
  if (leg.pirepId) state = ' - filed';
  else if (leg.expired) state = ' — expired';
  return `**${leg.flightNumber || 'Leg'}** ${leg.originIcao} → ${leg.destIcao}, ${when}${state}`;
}

function buildEmbed(bid, pilot, imageUrl) {
  const legs = bid.legs || [];
  const flightNumbers = [...new Set(legs.map(l => l.flightNumber).filter(Boolean))].join('/');
  const nextLeg = legs.find(l => !l.pirepId && !l.expired);
  const isActive = bid.status === 'active';

  const embed = new EmbedBuilder()
    .setTitle(`${flightNumbers || 'Booking'} ${bid.aircraft_registration || ''}`.trim())
    .setColor(isActive ? LIVE_COLOURS.green : LIVE_COLOURS.gold)
    .setDescription(`## ${routeLine(legs) || 'No legs'}`)
    .addFields({ name: 'Status', value: isActive ? 'Active' : 'Pending approval', inline: true });

  if (nextLeg) {
    const due = nextLeg.deadlineUtc || nextLeg.departureUtc;
    embed.addFields({ name: 'Next deadline', value: due ? discordTime(due, 'R') : 'No set time', inline: true });
  }

  const crewNames = [shortName(pilot), ...(bid.crew || []).map(c => c.name).filter(Boolean)];
  embed.addFields({ name: 'Crew', value: crewNames.join(', '), inline: true });

  if (legs.length > 1) {
    embed.addFields({ name: 'Legs', value: legs.map(legLine).join('\n').slice(0, 1024) });
  } else if (legs[0]?.departureUtc) {
    embed.addFields({ name: 'Departure', value: discordTime(legs[0].departureUtc, 'f') });
  }

  if (imageUrl) embed.setThumbnail(imageUrl);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livebookings')
    .setDescription('Your pending and active Live Mode bookings'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const pilot = await getLivePilot(interaction);
      if (!pilot) return;

      const pb = await getAdminClient();
      const [bids, images] = await Promise.all([
        pb.collection('if_live_bids').getFullList({
          filter: `pilot = "${escFilterValue(pilot.id)}" && (status = "pending" || status = "active")`,
          sort: '-created',
          requestKey: null,
        }),
        pb.collection('if_live_fleet_images').getFullList({ requestKey: null }).catch(() => []),
      ]);

      if (!bids.length) {
        return interaction.editReply({
          content: `You have no pending or active Live bookings. Book one at ${FRONTEND_URL}/if-live`,
        });
      }

      const imageByType = Object.fromEntries(images.map(r => [r.aircraft_type_id, r.image_url]));
      const embeds = bids.slice(0, MAX_SHOWN).map(b => buildEmbed(b, pilot, imageByType[b.aircraft_type_id]));
      embeds[embeds.length - 1].setFooter({ text: brand.shortName }).setTimestamp();

      const extra = bids.length - MAX_SHOWN;
      await interaction.editReply({
        content: extra > 0 ? `Showing ${MAX_SHOWN} of ${bids.length} bookings. See the rest at ${FRONTEND_URL}/if-live` : undefined,
        embeds,
      });
    } catch (err) {
      console.error('[livebookings] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch your Live bookings. Please try again.' });
    }
  },
};
