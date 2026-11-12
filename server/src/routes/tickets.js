/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Tickets: set up the Discord ticket panel and read past tickets

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
    if (!config.category_id) return res.status(400).json({ error: 'Choose the category for ticket channels first, and save.' });
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
      fields: 'id,number,channel_id,user_discord_id,user_discord_name,user_id,status,created,closed_at,closed_by',
      requestKey: null,
    });
    const open = await pb.collection('tickets').getList(1, 1, { filter: 'status = "open"', fields: 'id', requestKey: null });
    res.json({ tickets: list.items, open: open.totalItems, guild: process.env.DISCORD_GUILD_ID || null });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load tickets' });
  }
});

router.get('/:id', requireStaff, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const t = await pb.collection('tickets').getOne(req.params.id, { requestKey: null });
    let transcript = [];
    try { transcript = JSON.parse(t.transcript || '[]'); } catch { transcript = []; }
    res.json({ ticket: { ...t, transcript } });
  } catch (err) {
    res.status(404).json({ error: 'No such ticket' });
  }
});

module.exports = router;
