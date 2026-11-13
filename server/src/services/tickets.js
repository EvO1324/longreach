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
const CC_FOOTER = 'Sent from the crew centre';
const MAX_CATEGORIES = 10;
const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4 };

const DEFAULTS = {
  panel_channel_id: '',
  category_id: '',
  staff_role_ids: [],
  log_channel_id: '',
  ping_staff: true,
  one_open_per_user: true,
  claim: true,
  // Topics on the panel. Two or more show as a dropdown; each can have its own
  // staff roles and Discord category (blank = the ones above).
  //   { id, label, emoji, description, staff_role_ids, category_id }
  categories: [],
  name_prefix: 'ticket',
  panel: {
    title: 'Need a hand?',
    description: 'Open a ticket and a member of our staff team will help you in a private channel.',
    button_label: 'Open a ticket',
    button_emoji: '🎫',
    button_style: 'primary',
    color: brand.colors?.primary || '#1f5f8b',
    select_placeholder: 'What do you need help with?',
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
    categories: Array.isArray(s.categories) ? s.categories : DEFAULTS.categories,
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
    const cats = (Array.isArray(i.categories) ? i.categories : []).slice(0, MAX_CATEGORIES + 1);
    if (cats.length > MAX_CATEGORIES) throw new Error(`Up to ${MAX_CATEGORIES} categories`);
    const seen = new Set();
    const categories = cats.map((c, n) => {
      const label = str(c?.label, 80);
      if (!label) throw new Error(`Category ${n + 1} needs a name`);
      let cid = str(c?.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, '') || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `topic-${n + 1}`;
      while (seen.has(cid)) cid = `${cid}-${n + 1}`;
      seen.add(cid);
      const roleIds = (Array.isArray(c?.staff_role_ids) ? c.staff_role_ids : []).map(r => id(r, `${label}: staff role`)).filter(Boolean);
      return {
        id: cid, label,
        emoji: str(c?.emoji, 8),
        description: str(c?.description, 100),
        staff_role_ids: [...new Set(roleIds)].slice(0, 10),
        category_id: id(c?.category_id, `${label}: Discord category`),
      };
    });
    const prefix = str(i.name_prefix, 20).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'ticket';
    const config = merge({
      ...current,
      panel_channel_id: id(i.panel_channel_id, 'Panel channel'),
      category_id: id(i.category_id, 'Ticket category'),
      log_channel_id: id(i.log_channel_id, 'Log channel'),
      staff_role_ids: [...new Set(roles)].slice(0, 10),
      ping_staff: i.ping_staff !== false,
      one_open_per_user: i.one_open_per_user !== false,
      claim: i.claim !== false,
      categories,
      name_prefix: prefix,
      panel: {
        title: str(i.panel?.title, 256),
        description: str(i.panel?.description, 4000),
        button_label: str(i.panel?.button_label, 80) || DEFAULTS.panel.button_label,
        button_emoji: str(i.panel?.button_emoji, 8),
        button_style: style,
        color: color ? (color.startsWith('#') ? color : `#${color}`) : DEFAULTS.panel.color,
        select_placeholder: str(i.panel?.select_placeholder, 150) || DEFAULTS.panel.select_placeholder,
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

// {user}, {name}, {number} and {category} in the welcome message
function fill(text, { userId, name, number, category }) {
  return String(text || '')
    .replace(/\{user\}/g, userId ? `<@${userId}>` : name || '')
    .replace(/\{name\}/g, name || '')
    .replace(/\{number\}/g, String(number).padStart(4, '0'))
    .replace(/\{category\}/g, category?.label || 'Support');
}

const categoryOf = (config, id) => (config.categories || []).find(c => c.id === id) || null;
// a category's own staff roles and Discord category, or the main ones
const rolesFor = (config, cat) => (cat?.staff_role_ids?.length ? cat.staff_role_ids : config.staff_role_ids) || [];
const parentFor = (config, cat) => cat?.category_id || config.category_id || '';
// the category a ticket record was opened under (stored by label)
const categoryOfTicket = (config, t) => (config.categories || []).find(c => c.label === t?.category) || null;

// The message with the "Open a ticket" button (Discord API shape)
// Two or more categories: a dropdown. One: the button opens that category.
function panelMessage(config) {
  const p = config.panel;
  const cats = config.categories || [];
  const embed = { color: colorInt(p.color) };
  if (p.title) embed.title = p.title;
  if (p.description) embed.description = p.description;
  if (cats.length >= 2) {
    const options = cats.map(c => {
      const o = { label: c.label, value: c.id };
      if (c.description) o.description = c.description;
      if (c.emoji) o.emoji = { name: c.emoji };
      return o;
    });
    return { embeds: [embed], components: [{ type: 1, components: [{ type: 3, custom_id: 'ticket:open:select', placeholder: p.select_placeholder, options }] }] };
  }
  const button = { type: 2, style: BUTTON_STYLES[p.button_style] || 1, label: p.button_label, custom_id: cats.length === 1 ? `ticket:open:${cats[0].id}` : 'ticket:open' };
  if (p.button_emoji) button.emoji = { name: p.button_emoji };
  return { embeds: [embed], components: [{ type: 1, components: [button] }] };
}

// Close (and Claim) under the welcome message. Once claimed, Claim shows who.
function ticketButtons(config, claimedBy) {
  const row = [{ type: 2, style: 4, label: config.welcome.close_label, custom_id: 'ticket:close', emoji: { name: '🔒' } }];
  if (config.claim) {
    row.push(claimedBy
      ? { type: 2, style: 2, label: `Claimed by ${claimedBy}`.slice(0, 80), custom_id: 'ticket:claim', disabled: true }
      : { type: 2, style: 1, label: 'Claim', custom_id: 'ticket:claim', emoji: { name: '🙋' } });
  }
  return [{ type: 1, components: row }];
}

// The first message in a new ticket channel
function welcomeMessage(config, { userId, name, number, category }) {
  const w = config.welcome;
  const roles = rolesFor(config, category);
  const mentions = [`<@${userId}>`, ...(config.ping_staff ? roles.map(r => `<@&${r}>`) : [])];
  const vars = { userId, name, number, category };
  const embed = { color: colorInt(config.panel.color), description: fill(w.message, vars) };
  if (w.title) embed.title = fill(w.title, vars);
  if (category) embed.footer = { text: category.label };
  return {
    content: mentions.join(' '),
    embeds: [embed],
    components: ticketButtons(config),
    allowed_mentions: { users: [userId], roles: config.ping_staff ? roles : [] },
  };
}

// A staff reply sent from Admin › Tickets
function replyMessage(config, { name, body }) {
  return {
    embeds: [{ author: { name: `${name} · Staff` }, description: String(body).slice(0, 4000), color: colorInt(config.panel.color), footer: { text: CC_FOOTER } }],
    allowed_mentions: { parse: [] },
  };
}

// Posted in the log channel when a ticket closes
function logEmbed(config, t, { closedBy, messages }) {
  const fields = [
    { name: 'Opened by', value: `<@${t.user_discord_id}>`, inline: true },
    { name: 'Closed by', value: closedBy, inline: true },
    { name: 'Messages', value: String(messages), inline: true },
  ];
  if (t.category) fields.push({ name: 'Category', value: t.category, inline: true });
  if (t.claimed_by) fields.push({ name: 'Claimed by', value: t.claimed_by, inline: true });
  return {
    title: `Ticket #${String(t.number).padStart(4, '0')} closed`,
    color: colorInt(config.panel.color),
    fields,
    footer: { text: 'The transcript is in Admin › Tickets' },
    timestamp: new Date().toISOString(),
  };
}

// One transcript line. Takes a discord.js message or a Discord API one. A
// reply sent from the crew centre is shown under the staff member's name.
function transcriptEntry(m) {
  const embeds = m.embeds || [];
  const author = m.author || {};
  const fromCC = author.bot && embeds[0]?.footer?.text === CC_FOOTER;
  const name = fromCC
    ? String(embeds[0].author?.name || 'Staff').replace(/ · Staff$/, '')
    : m.member?.displayName || m.member?.nick || author.globalName || author.global_name || author.username || 'Unknown';
  const attachments = m.attachments?.values ? [...m.attachments.values()] : (m.attachments || []);
  return {
    at: m.createdAt ? m.createdAt.toISOString() : m.timestamp,
    author: name,
    author_id: author.id,
    bot: !!author.bot && !fromCC,
    staff: fromCC || undefined,
    content: fromCC ? (embeds[0].description || '') : (m.content || ''),
    embeds: fromCC ? [] : embeds.map(e => [e.title, e.description].filter(Boolean).join('\n')).filter(Boolean),
    attachments: attachments.map(a => a.url),
  };
}

// Up to 500 messages through the Discord API, oldest first
async function fetchTranscript(discord, channelId, max = 500) {
  const out = [];
  let before;
  while (out.length < max) {
    const r = await discord('GET', `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    if (!r.ok || !Array.isArray(r.data) || !r.data.length) break;
    out.push(...r.data);
    before = r.data[r.data.length - 1].id;
    if (r.data.length < 100) break;
  }
  return out.reverse().map(transcriptEntry);
}

function channelName(config, number, username) {
  const who = String(username || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return [config.name_prefix || 'ticket', String(number).padStart(4, '0'), who].filter(Boolean).join('-');
}

module.exports = {
  KEY, DEFAULTS, BUTTON_STYLES, CC_FOOTER, load, save, clean, merge, fill,
  categoryOf, categoryOfTicket, rolesFor, parentFor,
  panelMessage, welcomeMessage, ticketButtons, replyMessage, logEmbed, transcriptEntry, fetchTranscript, channelName,
};
