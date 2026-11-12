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
const { fleetStatus } = require('../../routes/ifLive');
const { LIVE_COLOURS, getLivePilot, shortName, zuluTime, orgFilter } = require('../liveUtils');

const FIELD_LIMIT = 1024;

function shortType(type) {
  if (!type) return '';
  return type
    .replace(/^(Airbus|Boeing|Embraer|Bombardier|De Havilland( Canada)?|ATR)\s+/i, '')
    .replace(/\s+NEO\b/i, 'neo')
    .replace(/^Dash 8-?/i, '')
    .trim();
}

const isOpen = leg => !leg.pirepId && !leg.expired;

function sectionFields(title, rows, shared = []) {
  if (!rows.length) return [{ name: title, value: '-# None' }];
  const widths = [...shared];
  for (const { cells } of rows) cells.forEach((c, i) => { widths[i] = Math.max(widths[i] || 0, c.length); });
  const indent = ' '.repeat(widths[0] + 3);
  const lines = rows.map(({ cells, more = [] }) => [
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join(' | '),
    ...more.filter(Boolean).map(m => indent + m),
  ].join('\n'));

  const fields = [];
  let chunk = [];
  let length = 0;
  const fence = 8; // ``` plus newlines, twice
  for (const text of lines) {
    if (chunk.length && length + text.length + 1 + fence > FIELD_LIMIT) {
      fields.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(text);
    length += text.length + 1;
  }
  fields.push(chunk);
  return fields.map((chunkLines, i) => ({
    name: i === 0 ? title : `${title} (continued)`,
    value: `\`\`\`\n${chunkLines.join('\n')}\n\`\`\``,
  }));
}

const place = icao => icao || 'Unknown';

function legTime(leg, dayStart, dayEnd) {
  if (!leg.departureUtc) return 'anytime';
  const dep = Date.parse(leg.departureUtc);
  if (dep >= dayStart && dep < dayEnd) return zuluTime(leg.departureUtc);
  const day = new Date(dep).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${zuluTime(leg.departureUtc)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('liveboard')
    .setDescription('The Live fleet right now: aircraft in use, booked and free'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const pilot = await getLivePilot(interaction);
      if (!pilot) return;

      const now = Date.now();
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const dayStartPb = dayStart.toISOString().replace('T', ' ');
      const orgId = (process.env.IF_LIVE_ORG_ID || '').split(',').map(s => s.trim()).find(Boolean);

      const pb = await getAdminClient();
      const [bids, fleet] = await Promise.all([
        pb.collection('if_live_bids').getFullList({
          filter: `(status = "active" || status = "pending" || (status = "completed" && updated >= "${dayStartPb}"))${orgFilter()}`,
          expand: 'pilot',
          requestKey: null,
        }),
        // the board still shows bookings if IF can't be reached
        orgId ? fleetStatus(orgId).catch(err => { console.warn('[liveboard] fleet:', err.message); return null; }) : null,
      ]);

      const bookingByAircraft = new Map();
      let filedToday = 0;
      for (const bid of bids) {
        for (const leg of bid.legs || []) {
          if (leg.pirepId && leg.loggedAt && Date.parse(leg.loggedAt) >= dayStart.getTime()) filedToday++;
        }
        if (bid.status === 'pending' || (bid.status === 'active' && (bid.legs || []).some(isOpen))) {
          bookingByAircraft.set(bid.aircraft_id, bid);
        }
      }

      // Without the fleet list, fall back to the booked aircraft alone
      const aircraft = fleet || [...bookingByAircraft.values()].map(b => ({
        id: b.aircraft_id, registration: b.aircraft_registration, type: null, currentIcao: null, live: null,
      }));

      const flying = [];
      const booked = [];
      const free = [];
      const unavailable = []; // blocked from booking by an admin
      for (const ac of aircraft) {
        const bid = bookingByAircraft.get(ac.id);
        const legs = (bid?.legs || []).filter(isOpen);
        const leg = legs.find(l => l.startedAt) || legs[0];
        const route = leg ? `${leg.originIcao}-${leg.destIcao}` : null;
        const who = bid ? shortName(bid.expand?.pilot) : null;
        const row = { reg: ac.registration || '', place: place(ac.currentIcao) };
        const cells = (...rest) => [row.reg || 'Unknown', shortType(ac.type) || '?', ...rest];

        if (bid && (leg?.startedAt || (ac.live && !ac.live.onGround))) {
          flying.push({ ...row, cells: cells(route || '?'), more: [who] });
        } else if (bid) {
          const time = leg ? legTime(leg, dayStart.getTime(), dayEnd) : null;
          const notes = [bid.status === 'pending' ? 'pending' : null, ac.live?.onGround ? 'at the gate' : null].filter(Boolean).join(', ');
          booked.push({ ...row, cells: cells(route || '?'), more: [[time, who].filter(Boolean).join(', '), notes] });
        } else if (ac.blocked) {
          unavailable.push({ ...row, cells: cells(row.place), more: [ac.blocked.reason || 'Not available to book'] });
        } else {
          // not booked: free, even if someone has it loaded on a server
          free.push({ ...row, cells: cells(row.place) });
        }
      }

      const byReg = (a, b) => a.reg.localeCompare(b.reg);
      // free ones by where they are, so it reads as "what's at Sydney"
      const byPlace = (a, b) => (a.place === 'Unknown') - (b.place === 'Unknown') || a.place.localeCompare(b.place) || byReg(a, b);
      const sections = [
        { title: 'Flying', rows: flying.sort(byReg) },
        { title: 'Booked', rows: booked.sort(byReg) },
        { title: 'Free', rows: free.sort(byPlace), show: !!fleet },
        { title: 'Unavailable', rows: unavailable.sort(byReg) },
      ].filter(sec => sec.rows.length || sec.show);

      // rego and type columns line up across every section
      const shared = [0, 1].map(i => Math.max(0, ...sections.flatMap(sec => sec.rows.map(r => r.cells[i].length))));

      const dateLabel = dayStart.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      const notes = [
        filedToday ? `${filedToday} ${filedToday === 1 ? 'leg' : 'legs'} filed today` : null,
        fleet ? null : "Couldn't reach Infinite Flight, so free aircraft aren't shown",
      ].filter(Boolean);

      const embed = new EmbedBuilder()
        .setTitle(`Live Board - ${dateLabel} (UTC)`)
        .setColor(LIVE_COLOURS.gold)
        .addFields(sections.flatMap(sec => sectionFields(`${sec.title} (${sec.rows.length})`, sec.rows, shared)).slice(0, 25))
        .setFooter({ text: brand.shortName })
        .setTimestamp();
      if (notes.length) embed.setDescription(`-# ${notes.join(' | ')}`);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[liveboard] Error:', err);
      await interaction.editReply({ content: "❌ Failed to fetch the Live board. Please try again." });
    }
  },
};
