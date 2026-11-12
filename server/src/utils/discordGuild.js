/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// The Discord server's roles, text channels and categories, for the pickers
// in Admin › Connections and Admin › Tickets. Uses the bot token.

const SNOWFLAKE = /^\d{17,20}$/;

async function guildInfo(guildId = process.env.DISCORD_GUILD_ID) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = String(guildId || '').trim();
  if (!token) return { ok: false, error: 'The bot token isn\'t set, so roles and channels can\'t be listed.' };
  if (!SNOWFLAKE.test(guild)) return { ok: false, error: 'Set the server ID first (Admin › Connections).' };
  try {
    const call = p => fetch(`https://discord.com/api/v10${p}`, { headers: { Authorization: `Bot ${token}` } });
    const [r, c] = await Promise.all([call(`/guilds/${guild}/roles`), call(`/guilds/${guild}/channels`)]);
    if (r.status === 403 || r.status === 404) return { ok: false, error: 'The bot isn\'t in that server.' };
    if (!r.ok || !c.ok) return { ok: false, error: `Discord answered ${r.ok ? c.status : r.status}.` };
    const roles = (await r.json())
      .filter(x => !x.managed && x.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(x => ({ id: x.id, name: x.name }));
    const all = await c.json();
    const cats = new Map(all.filter(x => x.type === 4).map(x => [x.id, x.name]));
    const channels = all
      .filter(x => x.type === 0 || x.type === 5)
      .sort((a, b) => (cats.get(a.parent_id) || '').localeCompare(cats.get(b.parent_id) || '') || a.position - b.position)
      .map(x => ({ id: x.id, name: x.name, category: cats.get(x.parent_id) || null }));
    const categories = all.filter(x => x.type === 4).sort((a, b) => a.position - b.position).map(x => ({ id: x.id, name: x.name }));
    return { ok: true, roles, channels, categories };
  } catch {
    return { ok: false, error: 'Couldn\'t reach Discord.' };
  }
}

// Calls the Discord API as the bot
async function discord(method, path, body) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// Whether "Message Content Intent" is switched on for the bot in the Discord
// developer portal. Without it the bot can't read what people write, so ticket
// transcripts only keep who said something and when.
async function hasMessageContent() {
  if (!process.env.DISCORD_BOT_TOKEN) return false;
  try {
    const r = await discord('GET', '/applications/@me');
    const flags = r.ok ? Number(r.data.flags || 0) : 0;
    return Boolean(flags & ((1 << 18) | (1 << 19)));
  } catch {
    return false;
  }
}

module.exports = { guildInfo, discord, hasMessageContent, SNOWFLAKE };
