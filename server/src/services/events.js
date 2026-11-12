/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');
const { escFilterValue } = require('../utils/pbFilter');
const { lookupAirport } = require('../utils/airports');

const FRONTEND_URL = (brand.frontendUrl).replace(/\/$/, '');

const FILE_OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;
const FILE_CLOSES_AFTER_MS = 48 * 60 * 60 * 1000;
const DEFAULT_LENGTH_MS = 12 * 60 * 60 * 1000; // no end time set

const webhookUrl = () => process.env.DISCORD_WEBHOOK_EVENTS || process.env.DISCORD_WEBHOOK_ADMIN || null;

function eventEnd(ev) {
  const start = new Date(ev.start_at).getTime();
  return ev.end_at ? new Date(ev.end_at).getTime() : start + DEFAULT_LENGTH_MS;
}

function filingWindow(ev, now = Date.now()) {
  if (ev.status !== 'published') return { open: false, reason: 'This event isn\'t open.' };
  const opens = new Date(ev.start_at).getTime() - FILE_OPENS_BEFORE_MS;
  const closes = eventEnd(ev) + FILE_CLOSES_AFTER_MS;
  if (now < opens) return { open: false, reason: 'You can log this flight from 2 hours before the event starts.', opensAt: new Date(opens).toISOString() };
  if (now > closes) return { open: false, reason: 'Logging for this event has closed.' };
  return { open: true, opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString() };
}

const parseGates = g => (Array.isArray(g) ? g : (() => { try { return JSON.parse(g || '[]'); } catch { return []; } })())
  .map(x => String(x).trim()).filter(Boolean);

const pilotName = u => u ? [u.first_name, u.last_name ? `${u.last_name[0]}.` : null].filter(Boolean).join(' ') || u.callsign || 'Pilot' : 'Pilot';

function cityOf(icao) {
  const c = lookupAirport(icao)?.city;
  return c ? c.replace(/\s*\(.*\)\s*$/, '') : null;
}

async function registrationsFor(pb, eventId) {
  return pb.collection('event_registrations').getFullList({
    filter: `event = "${escFilterValue(eventId)}"`, sort: 'created', expand: 'user,user.rank', requestKey: null,
  });
}

// Discord

const zulu = iso => { const d = new Date(String(iso).replace(' ', 'T')); return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`; };

function discordPayload(ev, regs) {
  const start = Math.floor(new Date(ev.start_at).getTime() / 1000);
  const end = ev.end_at ? Math.floor(new Date(ev.end_at).getTime() / 1000) : null;
  const gates = parseGates(ev.gates);
  const byGate = new Map(regs.filter(r => r.gate).map(r => [r.gate, r]));
  const mention = r => r.expand?.user?.discord_id ? `<@${r.expand.user.discord_id}>` : `**${pilotName(r.expand?.user)}**`;

  const landed = r => (r.landed_at ? ` ✅ Landed ${zulu(r.landed_at)}` : '');
  const gateLines = gates.map(g => `\`${g}\` ${byGate.has(g) ? mention(byGate.get(g)) + landed(byGate.get(g)) : '*open*'}`);
  const noGate = regs.filter(r => !r.gate || !gates.includes(r.gate)).map(r => mention(r) + landed(r));
  // Embed fields cap at 1024 characters, so a long gate list spills over
  const gateFields = [];
  let chunk = [];
  for (const line of gateLines) {
    if ((chunk.join('\n') + '\n' + line).length > 1000) { gateFields.push(chunk); chunk = []; }
    chunk.push(line);
  }
  if (chunk.length) gateFields.push(chunk);

  const taken = gates.filter(g => byGate.has(g)).length;
  const landedCount = regs.filter(r => r.landed_at).length;
  const dep = cityOf(ev.departure_icao), arr = cityOf(ev.arrival_icao);
  const fields = [
    { name: 'When', value: end ? `<t:${start}:F> to <t:${end}:t>` : `<t:${start}:F> (<t:${start}:R>)`, inline: false },
    { name: 'Route', value: `${ev.flight_number ? `**${ev.flight_number}** · ` : ''}${ev.departure_icao}${dep ? ` (${dep})` : ''} → ${ev.arrival_icao}${arr ? ` (${arr})` : ''}`, inline: false },
    { name: 'Aircraft', value: ev.aircraft || 'Any', inline: true },
    ...(ev.multiplier > 1 ? [{ name: 'Multiplier', value: `×${ev.multiplier} hours`, inline: true }] : []),
    { name: 'Signed up', value: `${regs.length}${gates.length ? ` · ${taken}/${gates.length} gates taken` : ''}${landedCount ? ` · ${landedCount} landed` : ''}`, inline: true },
    ...gateFields.map((lines, i) => ({ name: i === 0 ? 'Gates' : 'Gates (cont.)', value: lines.join('\n'), inline: false })),
    ...(noGate.length ? [{ name: 'Also flying', value: noGate.join(', ').slice(0, 1024), inline: false }] : []),
  ];

  const body = String(ev.body || '').trim();
  return {
    allowed_mentions: { parse: [] }, // names show, nobody gets pinged by an edit
    embeds: [{
      title: ev.status === 'cancelled' ? `Cancelled: ${ev.title}` : ev.title,
      url: `${FRONTEND_URL}/events?id=${ev.id}`,
      description: (body.length > 600 ? `${body.slice(0, 597)}…` : body) + `\n\n[Register on the crew centre](${FRONTEND_URL}/events?id=${ev.id})`,
      color: ev.status === 'cancelled' ? 0x888888 : brand.embedColor('primary'),
      ...(ev.header_image ? { image: { url: ev.header_image } } : {}),
      fields,
      footer: { text: brand.footer('Events') },
    }],
  };
}

async function syncDiscord(ev, { pb } = {}) {
  const url = webhookUrl();
  if (!url || ev.status === 'draft') return null;
  try {
    pb = pb || await getAdminClient();
    const regs = await registrationsFor(pb, ev.id);
    const payload = JSON.stringify(discordPayload(ev, regs));
    if (ev.discord_message_id) {
      const res = await fetch(`${url}/messages/${ev.discord_message_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload });
      if (res.ok) return ev.discord_message_id;
      if (res.status !== 404) { console.warn('[events] Discord edit failed', res.status); return ev.discord_message_id; }
      // the message was deleted in Discord: post a fresh one below
    }
    if (ev.status !== 'published') return null; // don't post a new message for a cancelled event
    const res = await fetch(`${url}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    if (!res.ok) { console.warn('[events] Discord post failed', res.status); return null; }
    const msg = await res.json();
    await pb.collection('events').update(ev.id, { discord_message_id: msg.id }).catch(() => {});
    return msg.id;
  } catch (err) {
    console.warn('[events] Discord sync failed:', err.message);
    return null;
  }
}

async function deleteDiscordMessage(ev) {
  const url = webhookUrl();
  if (!url || !ev.discord_message_id) return;
  await fetch(`${url}/messages/${ev.discord_message_id}`, { method: 'DELETE' }).catch(() => {});
}

const sameIcao = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

function openEventsOnRoute(list, dep, arr, now = Date.now()) {
  return list.filter(ev => sameIcao(ev.departure_icao, dep) && sameIcao(ev.arrival_icao, arr) && filingWindow(ev, now).open);
}

async function isOpenEventRoute(pb, userId, dep, arr) {
  try {
    if (!userId || !dep || !arr) return false;
    const candidates = await pb.collection('events').getFullList({
      filter: `status = "published" && departure_icao = "${escFilterValue(String(dep).toUpperCase())}" && arrival_icao = "${escFilterValue(String(arr).toUpperCase())}"`,
      fields: 'id,status,start_at,end_at,departure_icao,arrival_icao', requestKey: null,
    });
    const open = openEventsOnRoute(candidates, dep, arr);
    if (!open.length) return false;
    const reg = await pb.collection('event_registrations').getFirstListItem(
      `user = "${escFilterValue(userId)}" && (${open.map(ev => `event = "${escFilterValue(ev.id)}"`).join(' || ')})`, { requestKey: null },
    ).catch(() => null);
    return !!reg;
  } catch {
    return false;
  }
}

module.exports = {
  filingWindow, eventEnd, parseGates, pilotName, registrationsFor, openEventsOnRoute, isOpenEventRoute,
  syncDiscord, deleteDiscordMessage, discordPayload,
};
