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

const IF_BASE = 'https://api.infiniteflight.com/public/v2';
// Flights flying the VA's callsign (va.config.json callsign.format)
const AVG_REGEX = new RegExp(brand.callsign.regexSource || '^$', 'i');

async function ifGet(path) {
  const res  = await fetch(`${IF_BASE}${path}?apikey=${process.env.IF_API_KEY}`);
  const data = await res.json();
  if (data.errorCode !== 0) throw new Error(`IF API error ${data.errorCode} on ${path}`);
  return data.result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('liveflights')
    .setDescription(`Show active ${brand.shortName} flights on IF Expert Server`.slice(0, 100)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const [sessions, pb] = await Promise.all([
        ifGet('/sessions'),
        getAdminClient(),
      ]);

      const expert = sessions.find(s => s.name === 'Expert');
      if (!expert) {
        console.error('[liveflights] Sessions:', JSON.stringify(sessions.map(s => s.name)));
        return interaction.editReply({ content: '❌ Expert Server not found. Check logs.' });
      }

      // Fetch flights + our fleet lookup in parallel
      const [flights, fleetItems] = await Promise.all([
        ifGet(`/sessions/${expert.id}/flights`),
        pb.collection('fleet').getFullList({ fields: 'aircraft_id,livery_id,name,livery_name', requestKey: null }),
      ]);

      const liveryMap   = {};
      const aircraftMap = {};
      for (const item of fleetItems) {
        if (item.livery_id)   liveryMap[item.livery_id]     = item.livery_name || item.name;
        if (item.aircraft_id) aircraftMap[item.aircraft_id] = item.name?.split(' - ')[0] || item.name;
      }

      const avgFlights = flights.filter(f => f.callsign && AVG_REGEX.test(f.callsign));

      if (!avgFlights.length) {
        return interaction.editReply({ content: `No ${brand.shortName} pilots are currently airborne on Expert Server.` });
      }

      // Sort by callsign number
      avgFlights.sort((a, b) => {
        const numA = parseInt(a.callsign.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.callsign.match(/\d+/)?.[0] || 0);
        return numA - numB;
      });

      // Fetch flight plans to get real dep/arr from first/last waypoint
      const planResults = await Promise.allSettled(
        avgFlights.slice(0, 20).map(f =>
          fetch(`${IF_BASE}/sessions/${expert.id}/flights/${f.flightId}/flightplan?apikey=${process.env.IF_API_KEY}`)
            .then(r => r.json())
            .then(d => ({ flightId: f.flightId, plan: d.errorCode === 0 ? d.result : null }))
            .catch(() => ({ flightId: f.flightId, plan: null }))
        )
      );

      const planMap = {};
      for (const r of planResults) {
        if (r.status === 'fulfilled') planMap[r.value.flightId] = r.value.plan;
      }

      const formatAlt   = (ft) => ft != null ? `${Math.round(ft).toLocaleString()} ft` : '—';
      const formatSpeed = (kt) => kt != null ? `${Math.round(kt)} kts` : '—';

      const lines = avgFlights.slice(0, 20).map(f => {
        const aircraftName = f.aircraftId ? aircraftMap[f.aircraftId] : null;
        const liveryName   = f.liveryId   ? liveryMap[f.liveryId]     : null;
        const acLine       = aircraftName || liveryName || '—';

        // Get dep/arr from flight plan waypoints
        const items = planMap[f.flightId]?.flightPlanItems || [];
        const dep   = (items.length >= 1 ? items[0].name : null) || '—';
        const arr   = (items.length >= 2 ? items[items.length - 1].name : null) || '—';

        const alt = formatAlt(f.altitude);
        const spd = formatSpeed(f.speed);
        const pilot = f.username ? ` (${f.username})` : '';

        return [
          `**${f.callsign}**${pilot}`,
          `Route: ${dep} → ${arr}`,
          `Aircraft: ${acLine}`,
          `Altitude: ${alt}   Speed: ${spd}`,
        ].join('\n');
      });

      // Split into chunks of 10 so description stays under Discord's 4096 char limit
      const chunkSize  = 10;
      const chunks     = [];
      for (let i = 0; i < lines.length; i += chunkSize) chunks.push(lines.slice(i, i + chunkSize));

      const embeds = chunks.map((chunk, idx) => {
        const builder = new EmbedBuilder()
          .setColor(brand.embedColor('primary'))
          .setDescription(chunk.join('\n\n'));
        if (idx === 0) builder.setTitle(`${brand.abbreviation} Live Flights — ${avgFlights.length} airborne`);
        if (idx === chunks.length - 1) builder.setFooter({ text: `Expert Server · ${expert.userCount} pilots online` }).setTimestamp();
        return builder;
      });

      await interaction.editReply({ embeds });

    } catch (err) {
      console.error('[liveflights] Error:', err);
      await interaction.editReply({ content: `❌ Failed to fetch live flights: ${err.message}` });
    }
  },
};
