/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { MessageFlags } = require('discord.js');
const { getAdminClient } = require('../config/pocketbase');
const { canUseStaffCommand } = require('./utils');
const { parseButtonId } = require('../services/landingPrompt');

const filing = new Set(); // bid:leg, so a double click doesn't file twice

const hoursText = h => { const mins = Math.round((Number(h) || 0) * 60); return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`; };

async function handleFileButton(interaction) {
  const target = parseButtonId(interaction.customId);
  if (!target) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = content => interaction.editReply({ content });

  const key = `${target.bidId}:${target.legIndex}`;
  if (filing.has(key)) return reply('Already filing this one, give it a moment.');

  const pb = await getAdminClient();
  const bid = await pb.collection('if_live_bids').getOne(target.bidId, { expand: 'pilot', requestKey: null }).catch(() => null);
  const leg = bid?.legs?.[target.legIndex];
  if (!leg) return reply("Couldn't find that booking any more.");

  const isPilot = bid.expand?.pilot?.discord_id && String(bid.expand.pilot.discord_id) === interaction.user.id;
  if (!isPilot && !canUseStaffCommand(interaction)) return reply('Only the pilot who flew this can file it.');
  if (leg.pirepId) return reply('This one has already been filed.');
  // Same rules as the crew centre's File button
  if (bid.status === 'denied' || bid.status === 'cancelled') return reply(`This booking was ${bid.status}, so it can't be filed.`);

  filing.add(key);
  try {
    const { attemptFilePirep } = require('../routes/ifLive');
    const result = await attemptFilePirep(pb, bid, target.legIndex, { pilot: bid.expand?.pilot });
    if (!result.matched) {
      return reply("Couldn't find this flight in your Infinite Flight logbook yet. Try again in a few minutes, or file it from the crew centre.");
    }
    return reply(`Filed. ${hoursText(result.flight.flight_time)} added to your logbook.`);
  } catch (err) {
    console.error(`[bot] File PIREP ${key}:`, err.message);
    return reply(err.status === 400 ? err.message : 'Something went wrong filing that. Try the crew centre.');
  } finally {
    filing.delete(key);
  }
}

module.exports = { handleFileButton };
