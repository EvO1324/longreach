/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Tickets: set up the Discord ticket panel, read tickets, and reply,
// claim or close them from the crew centre

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin, requireStaff } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { guildInfo, discord, hasMessageContent } = require('../utils/discordGuild');
const tickets = require('../services/tickets');

const router = express.Router();

router.get('/config', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const [config, guild, messageContent] = await Promise.all([tickets.load(pb), guildInfo(), hasMessageContent()]);
    res.json({ config, discord: guild, messageContent, guildId: process.env.DISCORD_GUILD_ID || null });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load ticket settings' });
  }
});

router.put('/config', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const current = await tickets.load(pb);
    const { config, error } = tickets.clean(req.body, current);
    if (error) return res.status(400).json({ error });
    await tickets.save(pb, config);
    logAction(req.user, 'tickets.configured', { id: tickets.KEY, name: 'Tickets' });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t save ticket settings' });
  }
});

// Posts the panel, or edits the one already posted in that channel
router.post('/panel', requireAdmin, async (req, res) => {
  if (!process.env.DISCORD_BOT_TOKEN) return res.status(400).json({ error: 'The bot token isn\'t set.' });
  try {
    const pb = await getAdminClient();
    const config = await tickets.load(pb);
    if (!config.panel_channel_id) return res.status(400).json({ error: 'Choose the channel for the panel first, and save.' });
    const everyTopicHasOne = config.categories.length && config.categories.every(c => c.category_id);
    if (!config.category_id && !everyTopicHasOne) return res.status(400).json({ error: 'Choose the category for ticket channels first, and save.' });
    const body = tickets.panelMessage(config);

    let r = null;
    const same = config.panel_message_id && config.panel_message_channel_id === config.panel_channel_id;
    if (same) {
      r = await discord('PATCH', `/channels/${config.panel_channel_id}/messages/${config.panel_message_id}`, body);
      if (r.status === 404) r = null; // deleted in Discord: post a new one
    }
    let updated = !!r;
    if (!r) {
      r = await discord('POST', `/channels/${config.panel_channel_id}/messages`, body);
      updated = false;
    }
    if (!r.ok) {
      const why = r.status === 403 ? 'The bot can\'t post in that channel. Give it View Channel, Send Messages and Embed Links there.' : `Discord answered ${r.status}.`;
      return res.status(400).json({ error: why });
    }
    await tickets.save(pb, { ...config, panel_message_id: r.data.id, panel_message_channel_id: config.panel_channel_id });
    logAction(req.user, updated ? 'tickets.panel_updated' : 'tickets.panel_posted', { id: r.data.id, name: 'Ticket panel' });
    res.json({ ok: true, updated, url: `https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${config.panel_channel_id}/${r.data.id}` });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t post the panel' });
  }
});

router.get('/', requireStaff, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : null;
    const list = await pb.collection('tickets').getList(1, 50, {
      sort: '-number',
      filter: status ? `status = "${status}"` : '',
      fields: 'id,number,channel_id,user_discord_id,user_discord_name,user_id,status,created,closed_at,closed_by,category,claimed_by',
      requestKey: null,
    });
    const open = await pb.collection('tickets').getList(1, 1, { filter: 'status = "open"', fields: 'id', requestKey: null });
    res.json({ tickets: list.items, open: open.totalItems, guild: process.env.DISCORD_GUILD_ID || null });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load tickets' });
  }
});

// A closed ticket's saved transcript, or an open one's messages read live
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const t = await pb.collection('tickets').getOne(req.params.id, { requestKey: null });
    let transcript = [];
    let live = false;
    if (t.status === 'open' && process.env.DISCORD_BOT_TOKEN) {
      transcript = await tickets.fetchTranscript(discord, t.channel_id, 200).catch(() => []);
      live = true;
    } else {
      try { transcript = JSON.parse(t.transcript || '[]'); } catch { transcript = []; }
    }
    res.json({ ticket: { ...t, transcript, live } });
  } catch (err) {
    res.status(404).json({ error: 'No such ticket' });
  }
});

async function openTicket(pb, id, res) {
  if (!process.env.DISCORD_BOT_TOKEN) { res.status(400).json({ error: 'The bot token isn\'t set.' }); return null; }
  const t = await pb.collection('tickets').getOne(id, { requestKey: null }).catch(() => null);
  if (!t) { res.status(404).json({ error: 'No such ticket' }); return null; }
  if (t.status !== 'open') { res.status(400).json({ error: 'This ticket is closed.' }); return null; }
  return t;
}

async function staffName(pb, user) {
  const u = await pb.collection('users').getOne(user.id, { fields: 'first_name,last_name,callsign', requestKey: null }).catch(() => null);
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.callsign || user.callsign || 'Staff';
}

const gone = r => r.status === 404 ? 'That ticket channel no longer exists in Discord.' : r.status === 403 ? 'The bot can\'t post in that channel.' : `Discord answered ${r.status}.`;

router.post('/:id/reply', requireStaff, async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Write something first' });
    if (body.length > 4000) return res.status(400).json({ error: 'Keep it under 4000 characters' });
    const pb = await getAdminClient();
    const t = await openTicket(pb, req.params.id, res);
    if (!t) return;
    const config = await tickets.load(pb);
    const name = await staffName(pb, req.user);
    const r = await discord('POST', `/channels/${t.channel_id}/messages`, tickets.replyMessage(config, { name, body }));
    if (!r.ok) return res.status(400).json({ error: gone(r) });
    res.json({ message: tickets.transcriptEntry(r.data) });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t send the reply' });
  }
});

router.post('/:id/claim', requireStaff, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const t = await openTicket(pb, req.params.id, res);
    if (!t) return;
    if (t.claimed_by) return res.status(400).json({ error: `${t.claimed_by} has already claimed this ticket.` });
    const config = await tickets.load(pb);
    const name = await staffName(pb, req.user);
    const r = await discord('POST', `/channels/${t.channel_id}/messages`, { content: `🙋 **${name}** has claimed this ticket.`, allowed_mentions: { parse: [] } });
    if (!r.ok) return res.status(400).json({ error: gone(r) });
    const updated = await pb.collection('tickets').update(t.id, { claimed_by: name, claimed_by_id: '', claimed_at: new Date().toISOString() });
    // swap the Claim button on the welcome message for "Claimed by"
    const first = await discord('GET', `/channels/${t.channel_id}/messages?after=0&limit=1`);
    const welcome = first.ok && Array.isArray(first.data) ? first.data[0] : null;
    if (welcome?.components?.length) {
      discord('PATCH', `/channels/${t.channel_id}/messages/${welcome.id}`, { components: tickets.ticketButtons(config, name) }).catch(() => {});
    }
    logAction(req.user, 'tickets.claimed', { id: t.id, name: `Ticket #${String(t.number).padStart(4, '0')}` });
    res.json({ ticket: { id: updated.id, claimed_by: updated.claimed_by } });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t claim the ticket' });
  }
});

router.post('/:id/close', requireStaff, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const t = await openTicket(pb, req.params.id, res);
    if (!t) return;
    const config = await tickets.load(pb);
    const name = await staffName(pb, req.user);
    const transcript = await tickets.fetchTranscript(discord, t.channel_id).catch(() => []);
    await pb.collection('tickets').update(t.id, {
      status: 'closed', closed_at: new Date().toISOString(), closed_by: name, transcript: JSON.stringify(transcript),
    });
    if (config.log_channel_id) {
      discord('POST', `/channels/${config.log_channel_id}/messages`, {
        embeds: [tickets.logEmbed(config, t, { closedBy: name, messages: transcript.filter(m => !m.bot).length })],
        allowed_mentions: { parse: [] },
      }).catch(() => {});
    }
    await discord('POST', `/channels/${t.channel_id}/messages`, { content: `🔒 Ticket closed by ${name}. This channel will be deleted in a few seconds.`, allowed_mentions: { parse: [] } }).catch(() => {});
    setTimeout(() => discord('DELETE', `/channels/${t.channel_id}`).catch(() => {}), 5000);
    logAction(req.user, 'tickets.closed', { id: t.id, name: `Ticket #${String(t.number).padStart(4, '0')}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t close the ticket' });
  }
});

module.exports = router;
