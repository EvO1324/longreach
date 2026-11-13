/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Ticket buttons. "Open a ticket" (or the topic dropdown) on the panel posted
// from Admin › Tickets makes a private channel for the member and the staff
// roles; "Claim" lets a staff member take it; "Close ticket" saves a
// transcript and deletes the channel.

const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getAdminClient } = require('../config/pocketbase');
const plugins = require('../config/plugins');
const tickets = require('../services/tickets');

const ephemeral = content => ({ content, flags: MessageFlags.Ephemeral });
const MEMBER_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
];

// discord.js wants allowedMentions where the Discord API says allowed_mentions
const toDiscordJs = ({ allowed_mentions, ...msg }) => ({ ...msg, ...(allowed_mentions ? { allowedMentions: allowed_mentions } : {}) });

async function openTicket(interaction, categoryId) {
  if (!plugins.isOn('tickets')) return interaction.reply(ephemeral('Tickets are switched off at the moment.'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pb = await getAdminClient();
  const config = await tickets.load(pb);
  const guild = interaction.guild;
  const category = categoryId ? tickets.categoryOf(config, categoryId) : null;
  if (categoryId && !category) return interaction.editReply('That topic isn\'t available any more. Please ask a member of staff.');
  const parent = tickets.parentFor(config, category);
  if (!guild || !parent) return interaction.editReply('Tickets aren\'t set up yet. Please ask a member of staff.');

  const user = interaction.user;
  if (config.one_open_per_user) {
    const existing = await pb.collection('tickets').getFirstListItem(
      pb.filter('status = "open" && user_discord_id = {:id}', { id: user.id }), { requestKey: null },
    ).catch(() => null);
    if (existing) {
      const still = await guild.channels.fetch(existing.channel_id).catch(() => null);
      if (still) return interaction.editReply(`You already have a ticket open: <#${existing.channel_id}>`);
      await pb.collection('tickets').update(existing.id, { status: 'closed', closed_at: new Date().toISOString(), closed_by: 'Channel deleted' });
    }
  }

  const last = await pb.collection('tickets').getList(1, 1, { sort: '-number', fields: 'number', requestKey: null });
  const number = (last.items[0]?.number || 0) + 1;
  const staffRoles = tickets.rolesFor(config, category).filter(id => guild.roles.cache.has(id));
  const name = interaction.member?.displayName || user.globalName || user.username;

  let channel;
  try {
    channel = await guild.channels.create({
      name: tickets.channelName(config, number, user.username),
      type: ChannelType.GuildText,
      parent,
      topic: `Ticket #${String(number).padStart(4, '0')} for ${name}${category ? ` · ${category.label}` : ''}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: MEMBER_PERMS },
        ...staffRoles.map(id => ({ id, allow: MEMBER_PERMS })),
        { id: interaction.client.user.id, allow: [...MEMBER_PERMS, PermissionFlagsBits.ManageChannels] },
      ],
    });
  } catch (err) {
    console.error('[tickets] create channel:', err.message);
    return interaction.editReply('I couldn\'t open a ticket channel. Please let a member of staff know (I need Manage Channels and Manage Roles).');
  }

  try {
    const pilot = await pb.collection('users').getFirstListItem(pb.filter('discord_id = {:id}', { id: user.id }), { fields: 'id', requestKey: null }).catch(() => null);
    await pb.collection('tickets').create({
      number, channel_id: channel.id, user_discord_id: user.id, user_discord_name: name,
      user_id: pilot?.id || '', status: 'open', category: category?.label || '',
    });
    await channel.send(toDiscordJs(tickets.welcomeMessage(config, { userId: user.id, name, number, category })));
  } catch (err) {
    console.error('[tickets] open:', err.message);
    await channel.delete().catch(() => {});
    return interaction.editReply('Something went wrong opening your ticket. Please try again.');
  }

  return interaction.editReply(`Your ticket is open: <#${channel.id}>`);
}

async function askToClose(interaction) {
  const pb = await getAdminClient();
  const t = await pb.collection('tickets').getFirstListItem(pb.filter('channel_id = {:id} && status = "open"', { id: interaction.channelId }), { requestKey: null }).catch(() => null);
  if (!t) return interaction.reply(ephemeral('This ticket is already closed.'));
  return interaction.reply({
    content: 'Close this ticket? The channel will be deleted and a transcript kept in the crew centre.',
    components: [{ type: 1, components: [{ type: 2, style: 4, label: 'Close ticket', custom_id: 'ticket:close:confirm' }] }],
    flags: MessageFlags.Ephemeral,
  });
}

// Up to 500 messages, oldest first
async function transcriptOf(channel) {
  const out = [];
  let before;
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    out.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return out.reverse().map(tickets.transcriptEntry);
}

async function closeTicket(interaction) {
  const pb = await getAdminClient();
  const t = await pb.collection('tickets').getFirstListItem(pb.filter('channel_id = {:id} && status = "open"', { id: interaction.channelId }), { requestKey: null }).catch(() => null);
  if (!t) return interaction.update({ content: 'This ticket is already closed.', components: [] });
  await interaction.update({ content: 'Closing…', components: [] });

  const channel = interaction.channel;
  const closer = interaction.member?.displayName || interaction.user.username;
  const transcript = await transcriptOf(channel);
  await pb.collection('tickets').update(t.id, {
    status: 'closed', closed_at: new Date().toISOString(), closed_by: closer, transcript: JSON.stringify(transcript),
  });

  const config = await tickets.load(pb);
  if (config.log_channel_id) {
    const log = await interaction.guild.channels.fetch(config.log_channel_id).catch(() => null);
    await log?.send({
      embeds: [tickets.logEmbed(config, t, { closedBy: `<@${interaction.user.id}>`, messages: transcript.filter(m => !m.bot).length })],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }

  await channel.send(`🔒 Ticket closed by ${closer}. This channel will be deleted in a few seconds.`).catch(() => {});
  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 5000);
}

// Staff only: anyone with one of the ticket's staff roles, or Manage Channels
async function claimTicket(interaction) {
  const pb = await getAdminClient();
  const t = await pb.collection('tickets').getFirstListItem(pb.filter('channel_id = {:id} && status = "open"', { id: interaction.channelId }), { requestKey: null }).catch(() => null);
  if (!t) return interaction.reply(ephemeral('This ticket is closed.'));
  const config = await tickets.load(pb);
  const roles = tickets.rolesFor(config, tickets.categoryOfTicket(config, t));
  const member = interaction.member;
  const isStaff = member?.permissions?.has?.(PermissionFlagsBits.ManageChannels) || roles.some(id => member?.roles?.cache?.has(id));
  if (!isStaff) return interaction.reply(ephemeral('Only staff can claim tickets.'));
  if (t.claimed_by) return interaction.reply(ephemeral(`${t.claimed_by} has already claimed this ticket.`));

  const name = member?.displayName || interaction.user.globalName || interaction.user.username;
  await pb.collection('tickets').update(t.id, { claimed_by: name, claimed_by_id: interaction.user.id, claimed_at: new Date().toISOString() });
  await interaction.update({ components: tickets.ticketButtons(config, name) });
  await interaction.channel.send({ content: `🙋 <@${interaction.user.id}> has claimed this ticket.`, allowedMentions: { parse: [] } }).catch(() => {});
}

// A ticket channel deleted by hand still counts as closed
async function onChannelDelete(channel) {
  try {
    const pb = await getAdminClient();
    const t = await pb.collection('tickets').getFirstListItem(pb.filter('channel_id = {:id} && status = "open"', { id: channel.id }), { requestKey: null }).catch(() => null);
    if (t) await pb.collection('tickets').update(t.id, { status: 'closed', closed_at: new Date().toISOString(), closed_by: 'Channel deleted' });
  } catch {}
}

async function handleTicketButton(interaction) {
  const id = interaction.customId;
  if (id === 'ticket:open') return openTicket(interaction);
  if (id === 'ticket:open:select') return openTicket(interaction, interaction.values?.[0]);
  if (id.startsWith('ticket:open:')) return openTicket(interaction, id.slice('ticket:open:'.length));
  if (id === 'ticket:claim') return claimTicket(interaction);
  if (id === 'ticket:close') return askToClose(interaction);
  if (id === 'ticket:close:confirm') return closeTicket(interaction);
}

module.exports = { handleTicketButton, onChannelDelete, transcriptOf };
