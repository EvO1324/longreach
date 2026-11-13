/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const tickets = require('./tickets');

const ROLE = '111111111111111111';
const CHAN = '222222222222222222';
const CAT = '333333333333333333';

test('clean accepts a full set-up and tidies it', () => {
  const { config, error } = tickets.clean({
    panel_channel_id: CHAN, category_id: CAT, staff_role_ids: [ROLE, ROLE], name_prefix: 'Help Desk!',
    panel: { title: 'Support', description: 'Ask us', button_label: 'Open', button_style: 'success', color: 'ff0000' },
    welcome: { title: 'Ticket #{number}', message: 'Hi {user}' },
    ping_staff: false,
  }, tickets.merge({}));
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(config.staff_role_ids, [ROLE]);
  assert.strictEqual(config.name_prefix, 'help-desk');
  assert.strictEqual(config.panel.color, '#ff0000');
  assert.strictEqual(config.ping_staff, false);
  assert.strictEqual(config.welcome.close_label, 'Close ticket');
});

test('clean refuses bad IDs, colours and an empty panel', () => {
  assert.match(tickets.clean({ category_id: 'abc', panel: { title: 'x' } }, {}).error, /Ticket category/);
  assert.match(tickets.clean({ panel: { title: 'x', color: 'blue' } }, {}).error, /colour/);
  assert.match(tickets.clean({ panel: { title: '', description: '' } }, {}).error, /title or a description/);
});

test('panel and welcome messages are what Discord expects', () => {
  const config = tickets.merge({ staff_role_ids: [ROLE], panel: { title: 'Help', description: 'd', button_label: 'Open', button_emoji: '🎫', button_style: 'danger', color: '#00ff00' } });
  const panel = tickets.panelMessage(config);
  assert.strictEqual(panel.embeds[0].color, 0x00ff00);
  assert.deepStrictEqual(panel.components[0].components[0], { type: 2, style: 4, label: 'Open', custom_id: 'ticket:open', emoji: { name: '🎫' } });

  const w = tickets.welcomeMessage(config, { userId: '9', name: 'Sam', number: 7 });
  assert.strictEqual(w.content, `<@9> <@&${ROLE}>`);
  assert.strictEqual(w.embeds[0].title, 'Ticket #0007');
  assert.match(w.embeds[0].description, /^Hi <@9>/);
  assert.strictEqual(w.components[0].components[0].custom_id, 'ticket:close');
  assert.deepStrictEqual(w.allowed_mentions, { users: ['9'], roles: [ROLE] });

  const quiet = tickets.welcomeMessage({ ...config, ping_staff: false }, { userId: '9', name: 'Sam', number: 7 });
  assert.strictEqual(quiet.content, '<@9>');
  assert.deepStrictEqual(quiet.allowed_mentions.roles, []);
  assert.strictEqual(tickets.channelName(config, 12, 'Sam_Flies.99'), 'ticket-0012-samflies99');
});

test('categories: tidied, a dropdown for two or more, a button for one', () => {
  const ROLE2 = '666666666666666666';
  const { config, error } = tickets.clean({
    category_id: CAT, staff_role_ids: [ROLE], panel: { title: 'Help' },
    categories: [
      { label: 'Recruitment', emoji: '✈️', staff_role_ids: [ROLE2] },
      { label: 'PIREP query', description: 'Questions about a PIREP', category_id: CHAN },
      { label: 'Recruitment' },
    ],
  }, tickets.merge({}));
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(config.categories.map(c => c.id), ['recruitment', 'pirep-query', 'recruitment-3']);

  const menu = tickets.panelMessage(config).components[0].components[0];
  assert.strictEqual(menu.type, 3);
  assert.strictEqual(menu.custom_id, 'ticket:open:select');
  assert.deepStrictEqual(menu.options[0], { label: 'Recruitment', value: 'recruitment', emoji: { name: '✈️' } });
  assert.strictEqual(menu.options[1].description, 'Questions about a PIREP');

  const one = tickets.panelMessage({ ...config, categories: [config.categories[1]] }).components[0].components[0];
  assert.strictEqual(one.custom_id, 'ticket:open:pirep-query');

  // a category's own roles and Discord category, or the main ones
  const rec = tickets.categoryOf(config, 'recruitment');
  assert.deepStrictEqual(tickets.rolesFor(config, rec), [ROLE2]);
  assert.strictEqual(tickets.parentFor(config, rec), CAT);
  assert.strictEqual(tickets.parentFor(config, tickets.categoryOf(config, 'pirep-query')), CHAN);
  assert.deepStrictEqual(tickets.rolesFor(config, null), [ROLE]);

  const w = tickets.welcomeMessage({ ...config, welcome: { ...config.welcome, message: 'About {category}' } }, { userId: '9', name: 'Sam', number: 1, category: rec });
  assert.strictEqual(w.content, `<@9> <@&${ROLE2}>`);
  assert.strictEqual(w.embeds[0].description, 'About Recruitment');

  assert.match(tickets.clean({ panel: { title: 'x' }, categories: [{ label: '' }] }, {}).error, /needs a name/);
  assert.match(tickets.clean({ panel: { title: 'x' }, categories: Array.from({ length: 11 }, (_, n) => ({ label: `t${n}` })) }, {}).error, /Up to 10/);
});

test('claim button, staff replies and transcripts', () => {
  const config = tickets.merge({});
  assert.strictEqual(tickets.ticketButtons(config)[0].components[1].custom_id, 'ticket:claim');
  assert.strictEqual(tickets.ticketButtons(config, 'Sam')[0].components[1].label, 'Claimed by Sam');
  assert.strictEqual(tickets.ticketButtons(config, 'Sam')[0].components[1].disabled, true);
  assert.strictEqual(tickets.ticketButtons({ ...config, claim: false })[0].components.length, 1);

  // a reply sent from the crew centre reads as the staff member, not the bot
  const sent = tickets.replyMessage(config, { name: 'Alex', body: 'On it' });
  const fromCC = tickets.transcriptEntry({ id: '1', timestamp: '2026-01-01T00:00:00Z', author: { id: 'bot', username: 'Bot', bot: true }, content: '', embeds: sent.embeds, attachments: [] });
  assert.deepStrictEqual(fromCC, { at: '2026-01-01T00:00:00Z', author: 'Alex', author_id: 'bot', bot: false, staff: true, content: 'On it', embeds: [], attachments: [] });

  const pilot = tickets.transcriptEntry({ id: '2', timestamp: 't', author: { id: '9', username: 'sam', global_name: 'Sam' }, content: 'Hi', embeds: [], attachments: [{ url: 'u' }] });
  assert.strictEqual(pilot.author, 'Sam');
  assert.deepStrictEqual(pilot.attachments, ['u']);
});

test('fetchTranscript pages back through Discord, oldest first', async () => {
  const all = Array.from({ length: 150 }, (_, n) => ({ id: String(1000 + n), timestamp: `t${n}`, author: { id: '9', username: 's' }, content: `m${n}`, embeds: [], attachments: [] }));
  const calls = [];
  const discord = async (method, path) => {
    calls.push(path);
    const before = (path.match(/before=(\d+)/) || [])[1];
    const newest = all.filter(m => !before || Number(m.id) < Number(before)).reverse();
    return { ok: true, data: newest.slice(0, 100) };
  };
  const t = await tickets.fetchTranscript(discord, 'c');
  assert.strictEqual(t.length, 150);
  assert.strictEqual(t[0].content, 'm0');
  assert.strictEqual(t[149].content, 'm149');
  assert.strictEqual(calls.length, 2);
});

// The bot's buttons against a pretend Discord server and database
test('opening and closing a ticket', async () => {
  const rows = [];
  const settings = { key: 'tickets_config', id: 's1', value: JSON.stringify({ category_id: CAT, staff_role_ids: [ROLE, '444444444444444444'], log_channel_id: '' }) };
  const pb = {
    filter: (f, p) => f.replace(/\{:(\w+)\}/g, (_, k) => `"${p[k]}"`),
    collection(name) {
      const match = (filter) => (r) => filter.split('&&').every(part => {
        const m = part.trim().match(/^(\w+) = "(.*)"$/);
        return !m || String(r[m[1]]) === m[2];
      });
      return {
        getFirstListItem: async (filter) => {
          if (name === 'settings') return settings;
          if (name === 'users') throw new Error('404');
          const r = rows.find(match(filter));
          if (!r) throw new Error('404');
          return r;
        },
        getList: async () => ({ items: [...rows].sort((a, b) => b.number - a.number).slice(0, 1) }),
        create: async (d) => { const r = { id: `t${rows.length + 1}`, ...d }; rows.push(r); return r; },
        update: async (id, d) => Object.assign(rows.find(r => r.id === id), d),
      };
    },
  };
  // swap in the pretend database and plugins before loading the bot code
  const origLoad = Module._load;
  Module._load = function (req, parent, ...rest) {
    if (req === '../config/pocketbase') return { getAdminClient: async () => pb };
    if (req === '../config/plugins') return { isOn: () => true };
    return origLoad.call(this, req, parent, ...rest);
  };
  delete require.cache[require.resolve('../bot/tickets')];
  const bot = require('../bot/tickets');
  Module._load = origLoad;

  const made = [];
  const sent = [];
  let deleted = false;
  const channel = {
    id: '555555555555555555',
    send: async (m) => { sent.push(m); },
    delete: async () => { deleted = true; },
    messages: { fetch: async () => new Map() },
  };
  const guild = {
    roles: { everyone: { id: 'everyone' }, cache: new Map([[ROLE, {}]]) },
    channels: { create: async (opts) => { made.push(opts); return channel; }, fetch: async () => null },
  };
  const replies = [];
  const interaction = (customId, extra = {}) => ({
    customId, guild, user: { id: '9', username: 'Sam_Flies', globalName: 'Sam' }, member: { displayName: 'Sam' },
    client: { user: { id: 'bot' } }, channelId: channel.id, channel,
    reply: async (m) => replies.push(m), deferReply: async () => {}, editReply: async (m) => replies.push(m), update: async (m) => replies.push(m),
    ...extra,
  });

  await bot.handleTicketButton(interaction('ticket:open'));
  assert.strictEqual(made.length, 1);
  assert.strictEqual(made[0].name, 'ticket-0001-samflies');
  assert.strictEqual(made[0].parent, CAT);
  const ids = made[0].permissionOverwrites.map(o => o.id);
  assert.deepStrictEqual(ids, ['everyone', '9', ROLE, 'bot'], 'a staff role missing from the server is skipped');
  assert.strictEqual(rows[0].status, 'open');
  assert.ok(sent[0].allowedMentions && !sent[0].allowed_mentions);
  assert.match(replies.pop(), /Your ticket is open: <#555555555555555555>/);

  // a second press points them at the open ticket
  guild.channels.fetch = async () => channel;
  await bot.handleTicketButton(interaction('ticket:open'));
  assert.strictEqual(made.length, 1);
  assert.match(replies.pop(), /already have a ticket open/);

  await bot.handleTicketButton(interaction('ticket:close'));
  assert.strictEqual(replies.pop().components[0].components[0].custom_id, 'ticket:close:confirm');

  await bot.handleTicketButton(interaction('ticket:close:confirm'));
  assert.strictEqual(rows[0].status, 'closed');
  assert.strictEqual(rows[0].closed_by, 'Sam');
  assert.strictEqual(rows[0].transcript, '[]');
  assert.match(sent.pop(), /Ticket closed by Sam/);
  await new Promise(r => setTimeout(r, 5100));
  assert.ok(deleted, 'the channel is deleted after closing');
});
