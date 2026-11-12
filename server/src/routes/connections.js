/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Connections: Discord roles, channels and webhooks, and a few other
// settings, changed after install. See config/runtime.js.

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const runtime = require('../config/runtime');
const { guildInfo } = require('../utils/discordGuild');

const router = express.Router();
router.use(requireAdmin);

const SNOWFLAKE = /^\d{17,20}$/;
const WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

// under pm2 (Fly) a process that exits is started again with the new settings
const canRestart = () => process.env.pm_id !== undefined;

function check(field, value) {
  if (value === '') return null;
  if (field.kind === 'webhook') return WEBHOOK.test(value) ? null : 'isn\'t a Discord webhook URL';
  if (field.kind === 'role' || field.kind === 'channel' || field.key === 'DISCORD_GUILD_ID') return SNOWFLAKE.test(value) ? null : 'should be a Discord ID (17 to 20 digits)';
  if (field.key === 'DISCORD_DEV_IDS') return value.split(',').every(v => SNOWFLAKE.test(v.trim())) ? null : 'should be Discord user IDs separated by commas';
  if (field.key.endsWith('_REPO')) return REPO.test(value) ? null : 'should look like owner/name';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { values } = await runtime.readStored(pb);
    const groups = runtime.GROUPS.map(g => ({
      ...g,
      fields: g.fields.map(f => {
        const saved = f.key in values;
        const value = saved ? values[f.key] : (process.env[f.key] || '');
        const source = saved ? 'saved' : value ? 'env' : 'none';
        return f.secret
          ? { ...f, set: !!value, source }
          : { ...f, value, source };
      }),
    }));
    res.json({ groups, canRestart: canRestart() });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load the settings' });
  }
});

// Saves the changed values. A secret that isn't sent is left as it is.
router.post('/', async (req, res) => {
  const incoming = req.body?.values || {};
  const changes = {};
  const errors = [];
  for (const [key, raw] of Object.entries(incoming)) {
    const field = runtime.FIELDS.find(f => f.key === key);
    if (!field || raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    const problem = check(field, value);
    if (problem) errors.push(`${field.label} ${problem}`);
    else changes[key] = value;
  }
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  if (!Object.keys(changes).length) return res.json({ ok: true, saved: 0 });

  try {
    const pb = await getAdminClient();
    const { records } = await runtime.readStored(pb);
    const byKey = new Map(records.map(r => [r.key, r]));
    const upsert = async (key, value) => {
      const r = byKey.get(key);
      if (r) await pb.collection('settings').update(r.id, { value });
      else await pb.collection('settings').create({ key, value });
    };
    for (const [key, value] of Object.entries(changes)) {
      await upsert(runtime.PREFIX + key, value);
      process.env[key] = value;
    }
    await upsert(runtime.VERSION_KEY, String(Date.now()));

    const secret = new Set(runtime.FIELDS.filter(f => f.secret).map(f => f.key));
    logAction(req.user, 'connections.updated', { id: 'connections', name: 'Connections' }, {
      changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, secret.has(k) ? (v ? 'changed' : 'cleared') : v || 'cleared'])),
    });

    const restarting = canRestart();
    res.json({ ok: true, saved: Object.keys(changes).length, restarting });
    if (restarting) {
      console.log('[config] Settings changed in Admin › Connections, restarting');
      setTimeout(() => process.exit(0), 500);
    }
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t save the settings' });
  }
});

// The server's roles and text channels, for the pickers
router.get('/discord', async (req, res) => {
  res.json(await guildInfo(req.query.guild || process.env.DISCORD_GUILD_ID));
});

// Reads a webhook's details (posts nothing). Tests the typed URL, or the saved one.
router.post('/test-webhook', async (req, res) => {
  const field = runtime.FIELDS.find(f => f.key === req.body?.key && f.kind === 'webhook');
  if (!field) return res.status(400).json({ error: 'Unknown webhook' });
  const url = String(req.body.value || process.env[field.key] || '').trim();
  if (!url) return res.json({ ok: false, error: 'Not set' });
  if (!WEBHOOK.test(url)) return res.json({ ok: false, error: 'That isn\'t a Discord webhook URL' });
  try {
    const r = await fetch(url);
    if (!r.ok) return res.json({ ok: false, error: 'Discord doesn\'t know that webhook' });
    const d = await r.json();
    let channel = null;
    const token = process.env.DISCORD_BOT_TOKEN;
    if (token) {
      const c = await fetch(`https://discord.com/api/v10/channels/${d.channel_id}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
      if (c?.ok) channel = (await c.json()).name;
    }
    res.json({ ok: true, name: d.name, channel });
  } catch {
    res.json({ ok: false, error: 'Couldn\'t reach Discord' });
  }
});

module.exports = router;
