/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { lookupAirport } = require('../utils/airports');

const API = 'https://discord.com/api/v10';
const BUTTON_PREFIX = 'livefile';

const buttonId = (bidId, legIndex) => `${BUTTON_PREFIX}:${bidId}:${legIndex}`;
function parseButtonId(customId) {
  const [prefix, bidId, legIndex] = String(customId).split(':');
  return prefix === BUTTON_PREFIX && bidId ? { bidId, legIndex: Number(legIndex) } : null;
}

function cityName(icao) {
  const city = lookupAirport(icao)?.city;
  return city ? city.replace(/\s*\(.*\)\s*$/, '') : icao;
}

async function discord(method, path, { json, form } = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  if (!res.ok) throw new Error(`Discord ${method} ${path.split('?')[0]} said ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

let channelPromise = null;
function channelId() {
  if (process.env.DISCORD_IFLIVE_CHANNEL_ID) return Promise.resolve(process.env.DISCORD_IFLIVE_CHANNEL_ID);
  // A webhook URL answers a plain GET with its channel; no auth needed
  channelPromise ||= (async () => {
    const hook = process.env.DISCORD_WEBHOOK_IFLIVE;
    if (!hook) throw new Error('DISCORD_WEBHOOK_IFLIVE is not set');
    const res = await fetch(hook);
    if (!res.ok) throw new Error(`Couldn't read the Live ops webhook (${res.status})`);
    return (await res.json()).channel_id;
  })().catch(err => { channelPromise = null; throw err; });
  return channelPromise;
}

async function postLandingPrompt({ pilot, bid, legIndex }) {
  const leg = bid.legs[legIndex];
  const who = pilot?.discord_id ? `<@${pilot.discord_id}>` : (pilot?.first_name || 'A pilot');
  const channel = await channelId();
  const message = await discord('POST', `/channels/${channel}/messages`, {
    json: {
      content: [
        `**LANDED**  ${who} you're down at **${leg.destIcao}** in **${bid.aircraft_registration || 'your aircraft'}**`,
        `-# ${leg.flightNumber || 'Your flight'} from ${cityName(leg.originIcao)}. Once you're at the gate, press File PIREP, or file it from the crew centre.`,
      ].join('\n'),
      components: [{ type: 1, components: [{ type: 2, style: 3, label: 'File PIREP', custom_id: buttonId(bid.id, legIndex) }] }],
      allowed_mentions: pilot?.discord_id ? { users: [String(pilot.discord_id)] } : { parse: [] },
    },
  });
  return { channelId: channel, messageId: message.id };
}

/** Replaces the prompt with just the image: no text, no button. */
async function replacePromptWithImage({ channelId: channel, messageId }, { name, buffer }) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: '', components: [], attachments: [{ id: 0, filename: name }], allowed_mentions: { parse: [] } }));
  form.append('files[0]', new Blob([buffer], { type: 'image/png' }), name);
  await discord('PATCH', `/channels/${channel}/messages/${messageId}`, { form });
}

const EXTEND_PREFIX = 'liveextend';
const extendButtonId = (bidId, legIndex) => `${EXTEND_PREFIX}:${bidId}:${legIndex}`;
function parseExtendId(customId) {
  const [prefix, bidId, legIndex] = String(customId).split(':');
  return prefix === EXTEND_PREFIX && bidId ? { bidId, legIndex: Number(legIndex) } : null;
}
const stamp = (d, style = 't') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${style}>`;

function landingWarningMessage({ pilot, bid, legIndex, blocker, extendMax = 3 }) {
  const leg = bid.legs[legIndex];
  const who = pilot?.discord_id ? `<@${pilot.discord_id}>` : (pilot?.first_name || 'A pilot');
  const left = extendMax - (leg.extensions || 0);
  return {
    content: [
      `**1 HOUR LEFT TO LAND**  ${who} land and file ${leg.flightNumber ? `**${leg.flightNumber}** ` : ''}on **${bid.aircraft_registration || 'your aircraft'}** by ${stamp(leg.deadlineUtc)} (${stamp(leg.deadlineUtc, 'R')})`,
      `-# ${cityName(leg.originIcao)} to ${cityName(leg.destIcao)}. If it isn't filed by then, the booking is closed and the aircraft goes back in the fleet.`,
      blocker
        ? `-# ${blocker}.`
        : `-# Running late? Extend adds an hour to your booking (${left} left).`,
    ].join('\n'),
    components: blocker ? [] : [{ type: 1, components: [{ type: 2, style: 2, label: 'Extend 1 hour', custom_id: extendButtonId(bid.id, legIndex) }] }],
    allowed_mentions: pilot?.discord_id ? { users: [String(pilot.discord_id)] } : { parse: [] },
  };
}

async function postLandingWarning(args) {
  const channel = await channelId();
  const message = await discord('POST', `/channels/${channel}/messages`, { json: landingWarningMessage(args) });
  return { channelId: channel, messageId: message.id };
}

// After an extend: the warning loses its button and says the new deadline
function extendedMessage({ bid, legIndex }) {
  const leg = bid.legs[legIndex];
  return {
    content: [
      `**EXTENDED**  ${leg.flightNumber ? `**${leg.flightNumber}** ` : ''}on **${bid.aircraft_registration || 'the aircraft'}** now has until ${stamp(leg.deadlineUtc)} (${stamp(leg.deadlineUtc, 'R')})`,
      `-# ${cityName(leg.originIcao)} to ${cityName(leg.destIcao)}. Extended ${leg.extensions} time${leg.extensions === 1 ? '' : 's'}.`,
    ].join('\n'),
    components: [],
    allowed_mentions: { parse: [] },
  };
}

async function markWarningExtended({ channelId: channel, messageId }, args) {
  await discord('PATCH', `/channels/${channel}/messages/${messageId}`, { json: extendedMessage(args) });
}

module.exports = {
  postLandingPrompt, replacePromptWithImage, parseButtonId,
  postLandingWarning, landingWarningMessage, markWarningExtended, extendedMessage, parseExtendId,
};
