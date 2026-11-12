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
const { parseExtendId } = require('../services/landingPrompt');

const extending = new Set(); // bid:leg, so a double click doesn't extend twice

async function handleExtendButton(interaction) {
  const target = parseExtendId(interaction.customId);
  if (!target) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = content => interaction.editReply({ content });

  const key = `${target.bidId}:${target.legIndex}`;
  if (extending.has(key)) return reply('Already extending this one.');

  const pb = await getAdminClient();
  const bid = await pb.collection('if_live_bids').getOne(target.bidId, { expand: 'pilot', requestKey: null }).catch(() => null);
  if (!bid?.legs?.[target.legIndex]) return reply("Couldn't find that booking any more.");
  const isPilot = bid.expand?.pilot?.discord_id && String(bid.expand.pilot.discord_id) === interaction.user.id;
  if (!isPilot && !canUseStaffCommand(interaction)) return reply('Only the pilot on this booking can extend it.');

  extending.add(key);
  try {
    // Loaded here, not at the top: it pulls in the whole Live routes module
    const { extendLeg } = require('../routes/ifLive');
    const result = await extendLeg(pb, bid, target.legIndex);
    const at = new Date(result.leg.deadlineUtc);
    const z = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}Z`;
    return reply(`Extended. Land and file by ${z} (<t:${Math.floor(at.getTime() / 1000)}:R>). ${result.extensionsLeft} extension${result.extensionsLeft === 1 ? '' : 's'} left.`);
  } catch (err) {
    if (err.status === 409) return reply(`${err.message}.`);
    console.error(`[bot] Extend ${key}:`, err.message);
    return reply('Something went wrong extending that. Try the crew centre.');
  } finally {
    extending.delete(key);
  }
}

module.exports = { handleExtendButton };
