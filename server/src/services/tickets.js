/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Support tickets (the "tickets" plugin). Staff set everything up in
// Admin › Tickets: a panel message with an "Open a ticket" button, the
// category new ticket channels go in, which staff roles can see them, and what
// the messages say. The bot (bot/tickets.js) handles the buttons.

const brand = require('../config/brand');

const KEY = 'tickets_config';
const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4 };

const DEFAULTS = {
  panel_channel_id: '',
  category_id: '',
  staff_role_ids: [],
  log_channel_id: '',
  ping_staff: true,
  one_open_per_user: true,
  name_prefix: 'ticket',
  panel: {
    title: 'Need a hand?',
    description: 'Open a ticket and a member of our staff team will help you in a private channel.',
    button_label: 'Open a ticket',
    button_emoji: '🎫',
    button_style: 'primary',
    color: brand.colors?.primary || '#1f5f8b',
  },
  welcome: {
    title: 'Ticket #{number}',
    message: 'Hi {user}, thanks for getting in touch. Tell us what you need and a member of staff will be with you soon.',
    close_label: 'Close ticket',
  },
  // set when the panel is posted
  panel_message_id: '',
  panel_message_channel_id: '',
};

const SNOWFLAKE = /^\d{17,20}$/;
const HEX = /^#?[0-9a-f]{6}$/i;

function merge(saved) {
  const s = saved || {};
  return {
    ...DEFAULTS, ...s,
    staff_role_ids: Array.isArray(s.staff_role_ids) ? s.staff_role_ids : DEFAULTS.staff_role_ids,
    panel: { ...DEFAULTS.panel, ...(s.panel || {}) },
    welcome: { ...DEFAULTS.welcome, ...(s.welcome || {}) },
  };
}

async function load(pb) {
  const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  let saved = null;
  try { saved = r?.value ? JSON.parse(r.value) : null; } catch { saved = null; }
  return merge(saved);
}

async function save(pb, config) {
  const value = JSON.stringify(config);
  const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  if (r) await pb.collection('settings').update(r.id, { value });
  else await pb.collection('settings').create({ key: KEY, value });
  return config;
}

// Checks and tidies what the admin page sends. Returns { config } or { error }.
function clean(input, current) {
  const i = input || {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const id = (v, label) => {
    const s = str(v, 25);
    if (s && !SNOWFLAKE.test(s)) throw new Error(`${label} should be a Discord ID`);
    return s;
  };
  try {
    const roles = (Array.isArray(i.staff_role_ids) ? i.staff_role_ids : []).map(r => id(r, 'Staff role')).filter(Boolean);
    const color = str(i.panel?.color, 7);
    if (color && !HEX.test(color)) throw new Error('The panel colour should look like #1f5f8b');
    const style = str(i.panel?.button_style, 10) || 'primary';
    if (!BUTTON_STYLES[style]) throw new Error('Unknown button colour');
    const prefix = str(i.name_prefix, 20).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'ticket';
    const config = merge({
      ...current,
      panel_channel_id: id(i.panel_channel_id, 'Panel channel'),
      category_id: id(i.category_id, 'Ticket category'),
      log_channel_id: id(i.log_channel_id, 'Log channel'),
      staff_role_ids: [...new Set(roles)].slice(0, 10),
      ping_staff: i.ping_staff !== false,
      one_open_per_user: i.one_open_per_user !== false,
      name_prefix: prefix,
      panel: {
        title: str(i.panel?.title, 256),
        description: str(i.panel?.description, 4000),
        button_label: str(i.panel?.button_label, 80) || DEFAULTS.panel.button_label,
        button_emoji: str(i.panel?.button_emoji, 8),
        button_style: style,
        color: color ? (color.startsWith('#') ? color : `#${color}`) : DEFAULTS.panel.color,
      },
      welcome: {
        title: str(i.welcome?.title, 256),
        message: str(i.welcome?.message, 4000) || DEFAULTS.welcome.message,
        close_label: str(i.welcome?.close_label, 80) || DEFAULTS.welcome.close_label,
      },
    });
    if (!config.panel.title && !config.panel.description) throw new Error('Give the panel a title or a description');
    return { config };
  } catch (err) {
    return { error: err.message };
  }
}

const colorInt = hex => parseInt(String(hex || '').replace('#', ''), 16) || 0;

// {user}, {name} and {number} in the welcome message
function fill(text, { userId, name, number }) {
  return String(text || '')
    .replace(/\{user\}/g, userId ? `<@${userId}>` : name || '')
    .replace(/\{name\}/g, name || '')
    .replace(/\{number\}/g, String(number).padStart(4, '0'));
}

// The message with the "Open a ticket" button (Discord API shape)
function panelMessage(config) {
  const p = config.panel;
  const button = { type: 2, style: BUTTON_STYLES[p.button_style] || 1, label: p.button_label, custom_id: 'ticket:open' };
  if (p.button_emoji) button.emoji = { name: p.button_emoji };
  const embed = { color: colorInt(p.color) };
  if (p.title) embed.title = p.title;
  if (p.description) embed.description = p.description;
  return { embeds: [embed], components: [{ type: 1, components: [button] }] };
}

// The first message in a new ticket channel
function welcomeMessage(config, { userId, name, number }) {
  const w = config.welcome;
  const mentions = [`<@${userId}>`, ...(config.ping_staff ? config.staff_role_ids.map(r => `<@&${r}>`) : [])];
  const embed = { color: colorInt(config.panel.color), description: fill(w.message, { userId, name, number }) };
  if (w.title) embed.title = fill(w.title, { userId, name, number });
  return {
    content: mentions.join(' '),
    embeds: [embed],
    components: [{ type: 1, components: [{ type: 2, style: 4, label: w.close_label, custom_id: 'ticket:close', emoji: { name: '🔒' } }] }],
    allowed_mentions: { users: [userId], roles: config.ping_staff ? config.staff_role_ids : [] },
  };
}

function channelName(config, number, username) {
  const who = String(username || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return [config.name_prefix || 'ticket', String(number).padStart(4, '0'), who].filter(Boolean).join('-');
}

module.exports = { KEY, DEFAULTS, BUTTON_STYLES, load, save, clean, merge, fill, panelMessage, welcomeMessage, channelName };
