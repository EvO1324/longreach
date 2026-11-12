/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

const FREQ_LABELS = {
  0: 'Ground',
  1: 'Tower',
  2: 'Unicom',
  3: 'Clearance',
  4: 'Approach',
  5: 'Departure',
  6: 'Centre',
  7: 'ATIS',
};

const FREQ_ORDER = [7, 3, 0, 1, 4, 5, 6];

async function ifGet(path) {
  const res  = await fetch(`${IF_BASE}${path}?apikey=${process.env.IF_API_KEY}`);
  const data = await res.json();
  if (data.errorCode !== 0) throw new Error(`IF API error ${data.errorCode} on ${path}`);
  return data.result;
}

async function getAtis(sessionId, icao) {
  try {
    const res  = await fetch(`${IF_BASE}/sessions/${sessionId}/airport/${icao}/atis?apikey=${process.env.IF_API_KEY}`);
    const data = await res.json();
    if (data.errorCode !== 0) return null;
    return data.result || null;
  } catch {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atc')
    .setDescription('Show active ATC on the Infinite Flight Expert Server')
    .addStringOption(opt =>
      opt.setName('airport')
         .setDescription('Filter by airport ICAO (e.g. YSSY)')
         .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const filter = interaction.options.getString('airport')?.toUpperCase().trim() || null;

    try {
      const sessions = await ifGet('/sessions');
      const expert   = sessions.find(s => s.name === 'Expert Server' || s.name === 'Expert');
      if (!expert) return interaction.editReply({ content: '❌ Expert Server not found.' });

      let facilities = await ifGet(`/sessions/${expert.id}/atc`);

      // Drop Unicom
      facilities = facilities.filter(f => f.type !== 2);

      if (filter) {
        facilities = facilities.filter(f => f.airportName?.toUpperCase() === filter);
      }

      if (!facilities.length) {
        const embed = new EmbedBuilder()
          .setTitle('ATC — Expert Server')
          .setDescription(filter
            ? `No active ATC at **${filter}** right now.`
            : 'No active ATC on the Expert Server right now.')
          .setColor(0x6b6b63)
          .setFooter({ text: 'Infinite Flight · Expert Server' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // Group by airport
      const byAirport = {};
      for (const f of facilities) {
        const icao = f.airportName?.toUpperCase() || '????';
        if (!byAirport[icao]) byAirport[icao] = { icao, freqs: [] };
        byAirport[icao].freqs.push(f);
      }

      // Sort freqs within each airport
      for (const ap of Object.values(byAirport)) {
        ap.freqs.sort((a, b) => {
          const ai = FREQ_ORDER.indexOf(a.type);
          const bi = FREQ_ORDER.indexOf(b.type);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      }

      const airports = Object.values(byAirport)
        .sort((a, b) => b.freqs.length - a.freqs.length)
        .slice(0, 20);

      // Fetch ATIS for airports that have an ATIS frequency, in parallel
      const atisAirports = airports.filter(ap => ap.freqs.some(f => f.type === 7));
      const atisResults  = await Promise.all(
        atisAirports.map(ap => getAtis(expert.id, ap.icao))
      );
      const atisMap = {};
      atisAirports.forEach((ap, i) => {
        if (atisResults[i]) atisMap[ap.icao] = atisResults[i];
      });

      const embed = new EmbedBuilder()
        .setTitle(`ATC Online — ${facilities.length} active ${facilities.length === 1 ? 'frequency' : 'frequencies'}`)
        .setColor(brand.embedColor('accent'))
        .setFooter({ text: 'Infinite Flight · Expert Server · Live data' })
        .setTimestamp();

      if (filter) embed.setDescription(`Showing results for **${filter}**`);

      for (const ap of airports) {
        const freqLines = ap.freqs.map(f => {
          const label = FREQ_LABELS[f.type] ?? `Type ${f.type}`;
          return f.username ? `${label} — ${f.username}` : label;
        }).join('\n');

        // Append ATIS text in small italic below if available
        let value = freqLines;
        if (atisMap[ap.icao]) {
          // Truncate to keep under Discord's 1024 char field limit
          const atisText = atisMap[ap.icao].slice(0, 500);
          value += `\n\n-# ${atisText}`;
        }

        embed.addFields({ name: ap.icao, value, inline: false });
      }

      if (Object.keys(byAirport).length > 20) {
        embed.addFields({
          name: `+${Object.keys(byAirport).length - 20} more`,
          value: `Use \`/atc airport:<ICAO>\` to filter.`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[atc] Error:', err);
      await interaction.editReply({ content: `❌ Failed to fetch ATC data: ${err.message}` });
    }
  },
};
