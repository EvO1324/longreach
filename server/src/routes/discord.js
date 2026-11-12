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
const { bookingPass, landedCard } = require('../services/boardingPass');
const { replacePromptWithImage } = require('../services/landingPrompt');

const WEBHOOKS = {
  registrations: process.env.DISCORD_WEBHOOK_REGISTRATIONS,
  pireps:        process.env.DISCORD_WEBHOOK_PIREPS,
  pilots:        process.env.DISCORD_WEBHOOK_PILOTS,
  activity:      process.env.DISCORD_WEBHOOK_ACTIVITY,
  admin:         process.env.DISCORD_WEBHOOK_ADMIN,
  iflive:        process.env.DISCORD_WEBHOOK_IFLIVE,
};

const RECRUITMENT_ROLE_ID = process.env.DISCORD_RECRUITMENT_ROLE_ID || '1483667249356079170';

const COLOURS = {
  green:  brand.embedColor('primary'),
  gold:   brand.embedColor('accent'),
  blue:   0x1976d2,
  orange: 0xe65100,
  red:    0xc62828,
  grey:   0x757575,
};

async function send(webhookUrl, payload) {
  if (!webhookUrl) {
    console.warn('[discord] webhook skipped — URL not set. Payload title:', payload?.embeds?.[0]?.title || payload?.content);
    return;
  }
  console.log('[discord] sending webhook:', payload?.embeds?.[0]?.title || payload?.content, '→', webhookUrl.slice(0, 60) + '...');
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[discord] webhook failed ${res.status}: ${text}`);
    } else {
      console.log('[discord] webhook sent OK:', payload?.embeds?.[0]?.title);
    }
  } catch (err) {
    console.warn('[discord] webhook error:', err.message);
  }
}

async function sendWithImage(webhookUrl, payload, { name, buffer }) {
  if (!webhookUrl) {
    console.warn('[discord] webhook skipped — URL not set. Image:', name);
    return true; // nothing to fall back to either
  }
  try {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ ...payload, attachments: [{ id: 0, filename: name }] }));
    form.append('files[0]', new Blob([buffer], { type: 'image/png' }), name);
    const res = await fetch(webhookUrl, { method: 'POST', body: form });
    if (res.ok) return true;
    console.warn(`[discord] image webhook failed ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.warn('[discord] image webhook error:', err.message);
  }
  return false;
}

async function sendImageOnly(webhookUrl, draw, name, fallback) {
  const buffer = await draw().catch(err => { console.warn(`[discord] ${name}:`, err.message); return null; });
  if (buffer) await sendWithImage(webhookUrl, { allowed_mentions: { parse: [] } }, { name, buffer }).then(ok => ok || send(webhookUrl, fallback));
  else await send(webhookUrl, fallback);
}

// #registrations

async function notifyRegistration({ first_name, last_name, callsign, ifc_username, if_user_id }) {
  await send(WEBHOOKS.registrations, {
    content: `<@&${RECRUITMENT_ROLE_ID}> New pilot application`,
    embeds: [{
      title: 'New Pilot Application',
      color: COLOURS.blue,
      fields: [
        { name: 'Name',      value: `${first_name} ${last_name}`,                    inline: true },
        { name: 'Callsign',  value: callsign || '—',                                 inline: true },
        { name: 'IFC',       value: ifc_username ? `@${ifc_username}` : '—',        inline: true },
        { name: 'IF Linked', value: if_user_id ? '✅ Yes' : '❌ No',                 inline: true },
      ],
      footer: { text: brand.footer('Pending admin review') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyExamResult({ first_name, last_name, callsign, ifc_username, score, passed }) {
  await send(WEBHOOKS.registrations, {
    ...(passed ? { content: `<@&${RECRUITMENT_ROLE_ID}> Exam passed — ready for review` } : {}),
    embeds: [{
      title: passed ? 'Exam Passed' : 'Exam Failed',
      color: passed ? COLOURS.green : COLOURS.red,
      fields: [
        { name: 'Name',     value: `${first_name} ${last_name}`,                    inline: true },
        { name: 'Callsign', value: callsign || '—',                                 inline: true },
        { name: 'Score',    value: `${score}%`,                                     inline: true },
        { name: 'IFC',      value: ifc_username ? `@${ifc_username}` : '—',        inline: true },
        { name: 'Result',   value: passed
            ? '✅ Passed — awaiting Discord verification'
            : '❌ Failed — will need to re-sit',                                     inline: false },
      ],
      footer: { text: brand.footer('Recruitment') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyVerified({ first_name, last_name, callsign, ifc_username, discord_username }) {
  await send(WEBHOOKS.registrations, {
    embeds: [{
      title: 'Pilot Verified & Activated',
      color: COLOURS.green,
      fields: [
        { name: 'Name',     value: `${first_name} ${last_name}`,                    inline: true },
        { name: 'Callsign', value: callsign || '—',                                 inline: true },
        { name: 'Discord',  value: discord_username ? `@${discord_username}` : '—', inline: true },
        { name: 'IFC',      value: ifc_username ? `@${ifc_username}` : '—',        inline: true },
      ],
      footer: { text: brand.footer('Account activated') },
      timestamp: new Date().toISOString(),
    }],
  });
}

const shortPilot = p => (p ? `${p.first_name || 'A pilot'}${p.last_name ? ` ${p.last_name.charAt(0).toUpperCase()}.` : ''}` : 'A pilot');
const mentionOf = p => (p?.discord_id ? `<@${p.discord_id}>` : shortPilot(p));
const mentionsFor = p => (p?.discord_id ? { users: [String(p.discord_id)] } : { parse: [] });
const zulu = d => { const t = new Date(d); return `${String(t.getUTCHours()).padStart(2, '0')}${String(t.getUTCMinutes()).padStart(2, '0')}Z`; };
const zuluDay = d => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} ${zulu(d)}`;
const stamp = (d, style = 't') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${style}>`;
const isToday = d => new Date(d).toDateString() === new Date().toDateString();
const hoursText = h => { const mins = Math.round((Number(h) || 0) * 60); return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`; };
function styled(status, headline, ...details) {
  return [`**${status}**  ${headline}`, ...details.filter(Boolean).map(d => `-# ${d}`)].join('\n');
}

async function notifyPirepFiled({ pilot, flight, auto_approved, checks = [] }) {
  const durationH = Math.floor(flight.flight_time || 0);
  const durationM = Math.round(((flight.flight_time || 0) - durationH) * 60);
  const pilotName = pilot ? `${pilot.first_name} ${(pilot.last_name || '').charAt(0).toUpperCase()}.` : 'Unknown';

  // Live flights carry the tail as well: "Boeing 737-800 - Qantas (IF-RUIA)"
  const aircraftText = flight.aircraft
    ? `${flight.aircraft}${flight.registration && flight.registration !== flight.aircraft ? ` (${flight.registration})` : ''}`
    : '—';

  // Look up aircraft image from fleet
  let aircraftImageUrl = null;
  if (flight.aircraft) {
    try {
      const pb = await getAdminClient();
      const matches = await pb.collection('fleet').getFullList({
        filter: `name = "${escFilterValue(flight.aircraft)}"`,
        fields: 'image_url',
        requestKey: null,
      });
      aircraftImageUrl = matches[0]?.image_url || null;
    } catch {}
  }
  // Pilot-facing webhook (clean, no status info)
  if (WEBHOOKS.pilots) {
    await send(WEBHOOKS.pilots, {
      embeds: [{
        title: 'PIREP Filed',
        color: COLOURS.green,
        fields: [
          { name: 'Pilot',    value: pilotName,                                             inline: true },
          { name: 'Callsign', value: pilot?.callsign || '—',                                inline: true },
          { name: 'Flight',   value: flight.flight_number || '—',                           inline: true },
          { name: 'Route',    value: `${flight.departure_icao} → ${flight.arrival_icao}`,   inline: true },
          { name: 'Aircraft', value: aircraftText,                                       inline: true },
          { name: 'Duration', value: `${durationH}h ${durationM}m`,                        inline: true },
        ],
        ...(aircraftImageUrl ? { image: { url: aircraftImageUrl } } : {}),
        footer: { text: brand.shortName },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  // Staff-facing webhook (full detail including failed checks)
  const failedChecks = checks.filter(c => c.passed === false);
  const failDetail = failedChecks.map(c => `**${c.label}**${c.detail ? `: ${c.detail}` : ''}`).join('\n');

  await send(WEBHOOKS.pireps, {
    embeds: [{
      title: auto_approved ? 'PIREP Filed & Auto-Approved' : 'PIREP Filed — Pending Review',
      color: auto_approved ? COLOURS.green : COLOURS.gold,
      fields: [
        { name: 'Pilot',    value: pilotName,                                             inline: true },
        { name: 'Callsign', value: pilot?.callsign || '—',                                inline: true },
        { name: 'Flight',   value: flight.flight_number || '—',                           inline: true },
        { name: 'Route',    value: `${flight.departure_icao} → ${flight.arrival_icao}`,   inline: true },
        { name: 'Aircraft', value: aircraftText,                                       inline: true },
        { name: 'Duration', value: `${durationH}h ${durationM}m`,                        inline: true },
        ...(auto_approved ? [{ name: 'Verification', value: '🛡️ Verified via IF logbook', inline: false }] : []),
        ...(!auto_approved && failedChecks.length ? [{ name: '❌ Failed Checks', value: failDetail, inline: false }] : []),
      ],
      footer: { text: brand.footer(auto_approved ? 'Auto-approved' : 'Awaiting admin review') },
      timestamp: new Date().toISOString(),
    }],
  });
}

// City name for an ICAO, minus any "(Mascot)"-style suffix; falls back to the ICAO.
function cityName(icao) {
  const city = lookupAirport(icao)?.city;
  return city ? city.replace(/\s*\(.*\)\s*$/, '') : icao;
}

const START_WINDOW_MS = 4 * 60 * 60 * 1000;
async function notifyBookingCreated({ pilot, aircraftRegistration, aircraftTypeId, legs }) {
  const legText = (legs || []).map(l => `${l.flightNumber}, ${cityName(l.originIcao)} to ${cityName(l.destIcao)}`);
  const flights = legText.length > 1
    ? `${legText.slice(0, -1).join('; ')} and ${legText[legText.length - 1]}`
    : legText[0] || 'a flight';
  const first = (legs || [])[0];
  let when = null;
  if (first?.departureUtc) {
    const startBy = new Date(first.departureUtc).getTime() + START_WINDOW_MS;
    when = `Off blocks ${stamp(first.departureUtc, isToday(first.departureUtc) ? 't' : 'f')}. Start by ${stamp(startBy)} or the booking is cancelled.`;
  } else if (first?.holdStartUtc) {
    const start = new Date(first.holdStartUtc).getTime();
    when = start > Date.now() + 60 * 1000
      ? `Free for them from ${stamp(start)} (${stamp(start, 'R')}), then 4 hours to start or the booking is cancelled.`
      : `Start by ${stamp(start + START_WINDOW_MS)} (${stamp(start + START_WINDOW_MS, 'R')}) or the booking is cancelled.`;
  }
  // The image alone; this text only if it can't be drawn
  await sendImageOnly(WEBHOOKS.iflive, () => bookingPass({ pilot, aircraftRegistration, aircraftTypeId, legs }), 'booked.png', {
    content: styled('BOOKED', `${mentionOf(pilot)} has **${aircraftRegistration || 'an aircraft'}** for ${flights}`, when),
    allowed_mentions: mentionsFor(pilot),
  });
}

async function notifyBidTimeWarning({ pilot, leg, hoursLeft, aircraftRegistration, startByUtc }) {
  const status = `${hoursLeft} HOUR${hoursLeft === 1 ? '' : 'S'} LEFT`;
  await send(WEBHOOKS.iflive, {
    content: styled(status, `${mentionOf(pilot)} start ${leg.flightNumber || 'your flight'} on **${aircraftRegistration || 'your aircraft'}** by ${stamp(startByUtc)} (${stamp(startByUtc, 'R')})`,
      `${cityName(leg.originIcao)} to ${cityName(leg.destIcao)}. You're not on the Expert Server in it yet. If you haven't started by then, the booking is cancelled.`),
    allowed_mentions: mentionsFor(pilot),
  });
}

async function notifyBookingDropped({ pilot, leg, aircraftRegistration }) {
  await send(WEBHOOKS.iflive, {
    content: styled('CANCELLED', `${mentionOf(pilot)} your booking on **${aircraftRegistration || 'the aircraft'}** was cancelled`,
      `${leg.flightNumber || 'The flight'} ${cityName(leg.originIcao)} to ${cityName(leg.destIcao)} wasn't started within 4 hours. The aircraft is back in the fleet.`),
    allowed_mentions: mentionsFor(pilot),
  });
}

async function notifyBookingNeedsStaff({ pilot, aircraftRegistration, legs, error }) {
  const first = (legs || [])[0];
  const who = pilot?.callsign || [pilot?.first_name, pilot?.last_name].filter(Boolean).join(' ') || 'A pilot';
  const route = first ? `${first.flightNumber || ''} ${cityName(first.originIcao)} to ${cityName(first.destIcao)}`.trim() : 'a flight';
  await send(WEBHOOKS.iflive, {
    content: styled('NEEDS STAFF', `${who}'s booking on **${aircraftRegistration || 'an aircraft'}** for ${route} is pending`,
      `The Infinite Flight schedule couldn't be created${error ? `: ${String(error).slice(0, 200)}` : ''}. Fix it from Live Mode, Admin.`),
    allowed_mentions: { parse: [] },
  });
}

async function notifyLegAbandoned({ pilot, leg, aircraftRegistration }) {
  await send(WEBHOOKS.iflive, {
    content: styled('ABANDONED', `${mentionOf(pilot)} your flight on **${aircraftRegistration || 'the aircraft'}** was closed`,
      `${leg.flightNumber || 'The flight'} ${cityName(leg.originIcao)} to ${cityName(leg.destIcao)} started but never landed, so it won't count. Ask staff if this is wrong.`),
    allowed_mentions: mentionsFor(pilot),
  });
}

async function notifyLegExpired({ pilot, leg, aircraftRegistration }) {
  await send(WEBHOOKS.iflive, {
    content: styled('EXPIRED', `${mentionOf(pilot)} your booking on **${aircraftRegistration || 'the aircraft'}** ran out of time`,
      `${leg.flightNumber || 'The flight'} ${cityName(leg.originIcao)} to ${cityName(leg.destIcao)} wasn't landed and filed by ${stamp(leg.deadlineUtc)}. The aircraft is back in the fleet for anyone to book. If you did land, ask staff.`),
    allowed_mentions: mentionsFor(pilot),
  });
}

async function notifyAircraftLanded({ pilot, leg, aircraftRegistration, aircraftTypeId, availableToBook, nextLeg, flightTimeHours, landingStats, fuelUsedKg }) {
  const after = availableToBook
    ? 'Now free to book.'
    : nextLeg ? `Booked next for ${nextLeg.flightNumber} to ${cityName(nextLeg.destIcao)}.` : 'Already booked for its next flight.';
  const draw = () => landedCard({ pilot, leg, aircraftRegistration, aircraftTypeId, flightTimeHours, landingStats, fuelUsedKg, availableToBook, nextLeg });
  if (leg.landedPromptMessageId) {
    try {
      await replacePromptWithImage({ channelId: leg.landedPromptChannelId, messageId: leg.landedPromptMessageId }, { name: 'landed.png', buffer: await draw() });
      return;
    } catch (err) {
      console.warn('[discord] landing prompt swap failed, posting instead:', err.message);
    }
  }
  await sendImageOnly(WEBHOOKS.iflive, draw, 'landed.png', {
    content: styled('LANDED', `${mentionOf(pilot)} brought **${aircraftRegistration || 'the aircraft'}** into ${cityName(leg.destIcao)}`,
      `${leg.flightNumber || 'Flight'} from ${cityName(leg.originIcao)}${flightTimeHours ? ` in ${hoursText(flightTimeHours)}` : ''}. ${after}`),
    allowed_mentions: mentionsFor(pilot),
  });
}

// #activity

async function notifyActivityWarnings(warned, threshold, warnDay) {
  if (!warned.length) return;
  await send(WEBHOOKS.activity, {
    embeds: [{
      title: 'Activity Warning',
      color: COLOURS.gold,
      description: `The following pilots have been inactive for **${warnDay}+ days** and will be suspended in ${threshold - warnDay} days unless they file an approved PIREP.`,
      fields: warned.map(p => ({
        name:  `${p.name}${p.callsign ? ` (${p.callsign})` : ''}`,
        value: `${p.discordMention} — Last flight: **${p.lastFlightStr}**${p.daysInactive != null ? ` (${p.daysInactive} days ago)` : ''}`,
        inline: false,
      })),
      footer: { text: brand.footer('Activity System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyActivityFinalWarning(pilots) {
  if (!pilots.length) return;
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: '⚠️ Final Activity Warning — 24h Until Archive',
      color: COLOURS.orange,
      description: 'The following pilots have been sent a final warning and will be archived tomorrow unless they file a PIREP or request LOA.',
      fields: pilots.map(p => ({
        name:  `${p.name}${p.callsign ? ` (${p.callsign})` : ''}`,
        value: `${p.discordMention} — Last flight: **${p.lastFlightStr}**${p.daysInactive != null ? ` (${p.daysInactive} days ago)` : ''}`,
        inline: false,
      })),
      footer: { text: brand.footer('Activity System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyActivitySuspensions(suspended, suspendDay) {
  if (!suspended.length) return;
  const mentions = suspended.map(p => p.discordMention).join(' ');
  await send(WEBHOOKS.activity, {
    content: mentions,
    embeds: [{
      title: 'Pilots Archived — Inactivity',
      color: COLOURS.red,
      description: `The following pilots have been automatically archived after **${suspendDay} days** of inactivity.`,
      fields: suspended.map(p => ({
        name:  `${p.name}${p.callsign ? ` (${p.callsign})` : ''}`,
        value: `${p.discordMention} — Last flight: **${p.lastFlightStr}**${p.daysInactive != null ? ` (${p.daysInactive} days ago)` : ''}`,
        inline: false,
      })),
      footer: { text: brand.footer('Activity System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyLeaveRequest({ pilot_name, callsign, start_date, end_date, reason }) {
  const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
  const fmt  = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  await send(WEBHOOKS.activity, {
    embeds: [{
      title: 'Leave Request Submitted',
      color: COLOURS.blue,
      fields: [
        { name: 'Pilot',    value: pilot_name,             inline: true },
        { name: 'Callsign', value: callsign || '—',        inline: true },
        { name: 'Dates',    value: `${fmt(start_date)} → ${fmt(end_date)} (${days} day${days !== 1 ? 's' : ''})`, inline: false },
        { name: 'Reason',   value: reason,                 inline: false },
      ],
      footer: { text: brand.footer('Awaiting admin review') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyLeaveReviewed({ pilot_name, callsign, start_date, end_date, status, admin_note }) {
  const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  await send(WEBHOOKS.activity, {
    embeds: [{
      title: status === 'approved' ? 'Leave Approved' : 'Leave Denied',
      color: status === 'approved' ? COLOURS.green : COLOURS.red,
      fields: [
        { name: 'Pilot',    value: pilot_name,                    inline: true },
        { name: 'Callsign', value: callsign || '—',               inline: true },
        { name: 'Dates',    value: `${fmt(start_date)} → ${fmt(end_date)}`, inline: false },
        ...(admin_note ? [{ name: 'Admin Note', value: admin_note, inline: false }] : []),
      ],
      footer: { text: brand.footer('Leave System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

// #admin

async function notifyPilotKicked({ name, callsign, daysInactive, lastFlightStr, discordMention }) {
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: 'Pilot Kicked — Inactivity',
      color: COLOURS.red,
      fields: [
        { name: 'Pilot',       value: `${name}${callsign ? ` (${callsign})` : ''}`, inline: true },
        { name: 'Discord',     value: discordMention,                                inline: true },
        { name: 'Last Flight', value: lastFlightStr || 'Never',                      inline: true },
        { name: 'Days Inactive', value: daysInactive != null ? `${daysInactive} days` : '—', inline: true },
        { name: 'Action',      value: 'Kicked from Discord server',                  inline: true },
      ],
      footer: { text: brand.footer('Activity System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyActivitySummary({ warned, suspended, skipped, threshold, dryRun }) {
  if (dryRun) return;
  const color = suspended > 0 ? COLOURS.red : warned > 0 ? COLOURS.gold : COLOURS.green;
  const lines = [];
  if (warned)    lines.push(`${warned} pilot(s) warned`);
  if (suspended) lines.push(`${suspended} pilot(s) archived`);
  if (!warned && !suspended) lines.push('No action required — all pilots active');
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: 'Activity Check — Complete',
      color,
      description: lines.join('\n'),
      fields: [
        { name: 'Warned',    value: String(warned),    inline: true },
        { name: 'Archived',  value: String(suspended), inline: true },
        { name: 'Skipped',   value: String(skipped),   inline: true },
        { name: 'Threshold', value: `${threshold} days`, inline: true },
      ],
      footer: { text: brand.footer('Activity Check') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyRankSync({ synced, errors }) {
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: 'Rank Role Sync — Complete',
      color: errors > 0 ? COLOURS.orange : COLOURS.green,
      fields: [
        { name: 'Synced', value: String(synced), inline: true },
        { name: 'Errors', value: String(errors), inline: true },
      ],
      footer: { text: brand.footer('Rank Sync') },
      timestamp: new Date().toISOString(),
    }],
  });
}

// Staff applications (kept on registrations channel)
async function notifyStaffApplication({ name, ifc_username, discord_username, position_title, linked_callsign, linked_hours }) {
  await send(WEBHOOKS.registrations, {
    embeds: [{
      title: 'New Staff Application',
      color: COLOURS.green,
      fields: [
        { name: 'Name',      value: name,                   inline: true },
        { name: 'IFC',       value: `@${ifc_username}`,     inline: true },
        { name: 'Discord',   value: `@${discord_username}`, inline: true },
        { name: 'Position',  value: position_title,         inline: true },
        { name: `${brand.abbreviation} Member`, value: linked_callsign
            ? `✅ Yes — ${linked_callsign} (${linked_hours != null ? Math.floor(linked_hours) + 'h' : '?'})`
            : '❌ Not a current member',                     inline: true },
      ],
      footer: { text: brand.footer('Staff Applications') },
      timestamp: new Date().toISOString(),
    }],
  });
}

// #admin system notifications

async function notifyRouteRequest({ flight_number, departure_icao, arrival_icao, aircraft, notes, pilot_name }) {
  return send(WEBHOOKS.admin, {
    embeds: [{
      title: '✈️ New Route Request',
      color: brand.embedColor('primary'),
      fields: [
        { name: 'Flight',   value: flight_number,                          inline: true },
        { name: 'Route',    value: `${departure_icao} → ${arrival_icao}`, inline: true },
        { name: 'Aircraft', value: aircraft,                               inline: true },
        ...(notes ? [{ name: 'Notes', value: notes }] : []),
        { name: 'Submitted by', value: pilot_name || 'Unknown' },
      ],
      footer: { text: 'Review in Admin → Network → Routes' },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyServerStart({ port, env, version }) {
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: '🟢 API Server Online',
      color: COLOURS.green,
      fields: [
        { name: 'Environment', value: env || 'production',  inline: true },
        { name: 'Port',        value: String(port),         inline: true },
        { name: 'Version',     value: version || '—',       inline: true },
      ],
      footer: { text: brand.footer('System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyBotOnline({ tag }) {
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: '🤖 Discord Bot Online',
      color: COLOURS.green,
      fields: [
        { name: 'Bot', value: tag, inline: true },
      ],
      footer: { text: brand.footer('System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyPocketBaseError({ error }) {
  await send(WEBHOOKS.admin, {
    embeds: [{
      title: '🔴 PocketBase Connection Error',
      color: COLOURS.red,
      description: error,
      footer: { text: brand.footer('System') },
      timestamp: new Date().toISOString(),
    }],
  });
}

async function notifyEarlyRelease({ nextPilot, landedPilot, aircraftRegistration, landedAt, nextLeg, waitedUntil, reason = 'landed' }) {
  const what = reason === 'dropped' ? `${shortPilot(landedPilot)}'s booking before yours was cancelled` : `${shortPilot(landedPilot)} landed`;
  const detail = nextLeg.departureUtc
    ? `${what} ahead of your ${nextLeg.flightNumber} at ${stamp(nextLeg.departureUtc)}. Change the time on the Fly page to go sooner.`
    : `${what}, so you don't need to wait until ${stamp(waitedUntil)}. You can fly ${nextLeg.flightNumber} now.`;
  await send(WEBHOOKS.iflive, {
    content: styled('FREE EARLY', `${mentionOf(nextPilot)} **${aircraftRegistration || 'Your aircraft'}** is ready for you in ${cityName(landedAt)}`, detail),
    allowed_mentions: mentionsFor(nextPilot),
  });
}

module.exports = {
  notifyEarlyRelease,
  notifyBookingDropped,
  notifyRegistration,
  notifyExamResult,
  notifyVerified,
  notifyPirepFiled,
  notifyBookingCreated,
  notifyBookingNeedsStaff,
  notifyLegAbandoned,
  notifyLegExpired,
  notifyBidTimeWarning,
  notifyAircraftLanded,
  notifyActivityWarnings,
  notifyActivityFinalWarning,
  notifyActivitySuspensions,
  notifyPilotKicked,
  notifyLeaveRequest,
  notifyLeaveReviewed,
  notifyActivitySummary,
  notifyRankSync,
  notifyStaffApplication,
  notifyRouteRequest,
  notifyServerStart,
  notifyBotOnline,
  notifyPocketBaseError,
};
