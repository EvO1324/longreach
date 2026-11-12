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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FRONTEND_URL = brand.frontendUrl;

function fmtWeekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const end = new Date(d); end.setDate(d.getDate() + 6);
  const fmt = dt => dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(d)} – ${fmt(end)}`;
}

function parseAircraftShort(raw) {
  if (!raw) return null;
  try {
    const str = Array.isArray(raw) ? raw[0] : (typeof raw === 'string' && raw.startsWith('[') ? JSON.parse(raw)[0] : raw);
    const match = String(str).match(/\b([AB]\d{3}[A-Z]?|E\d{3}|CRJ\d{3}|ATR\d{2}|Q\d{3}|TBM\d{3})\b/i);
    return match ? match[1].toUpperCase() : String(str).split(' - ')[0].trim();
  } catch { return String(raw); }
}

function fmtMins(mins) {
  if (!mins) return null;
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rotw')
    .setDescription(`View ${brand.shortName}'s routes of the week schedule`.slice(0, 100)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const pb = await getAdminClient();

      // Fetch all weeks, sorted oldest to newest
      const weeks = await pb.collection('rotw_weeks').getFullList({
        sort: 'week_start',
        requestKey: null,
      });

      if (!weeks.length) {
        return interaction.editReply({ content: '✈️ No routes have been scheduled yet. Check back soon!' });
      }

      // Fetch all slots for all weeks in one query
      const weekIds = weeks.map(w => w.id);
      const filterStr = weekIds.map(id => `week = "${id}"`).join(' || ');
      const slots = await pb.collection('rotw_slots').getFullList({
        filter: filterStr,
        sort: 'day,sort_order',
        expand: 'route,multiplier',
        requestKey: null,
      });

      // Group slots by week id
      const slotsByWeek = {};
      for (const slot of slots) {
        if (!slotsByWeek[slot.week]) slotsByWeek[slot.week] = [];
        slotsByWeek[slot.week].push(slot);
      }

      const fields = [];

      for (const week of weeks) {
        const weekSlots = slotsByWeek[week.id] || [];
        if (!weekSlots.length) continue;

        const label = fmtWeekLabel(week.week_start);
        const header = week.posted ? `${label}  (active)` : label;

        // Group by day
        const byDay = {};
        for (const slot of weekSlots) {
          if (!byDay[slot.day]) byDay[slot.day] = [];
          byDay[slot.day].push(slot);
        }

        const lines = [];
        for (const day of DAYS) {
          if (!byDay[day]?.length) continue;
          lines.push(`**${day}**`);
          for (const slot of byDay[day]) {
            const r = slot.expand?.route;
            if (!r) continue;
            const ac = parseAircraftShort(r.aircraft);
            const dur = fmtMins(r.duration_minutes || r.duration);
            const mult = slot.expand?.multiplier;
            const parts = [
              `\`${r.flight_number}\``,
              `${r.departure_icao} → ${r.arrival_icao}`,
              ac,
              dur,
              mult ? `×${mult.value}` : null,
            ].filter(Boolean);
            lines.push(parts.join('  ·  '));
          }
        }

        if (!lines.length) continue;

        fields.push({
          name: header,
          value: lines.join('\n'),
          inline: false,
        });
      }

      if (!fields.length) {
        return interaction.editReply({ content: '✈️ No routes have been added to the schedule yet.' });
      }

      const embed = new EmbedBuilder()
        .setTitle('Routes of the Week')
        .setDescription(`[View full schedule](${FRONTEND_URL}/rotw)`)
        .setColor(brand.embedColor('primary'))
        .addFields(fields)
        .setFooter({ text: brand.name })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[rotw command] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch routes. Please try again.' });
    }
  },
};
