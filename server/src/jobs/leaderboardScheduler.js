/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');
const { escFilterValue } = require('../utils/pbFilter');

let _client = null; // Discord client, set by scheduleLeaderboardPost

const getEnv = () => ({
  CHANNEL_ID: process.env.DISCORD_LEADERBOARD_CHANNEL_ID,
  GUILD_ID:   process.env.DISCORD_GUILD_ID,
});

function setClient(client) { }

async function getPostConfig() {
  try {
    const pb = await getAdminClient();
    const records = await pb.collection('settings').getFullList({ requestKey: null });
    const map = Object.fromEntries(records.map(r => [r.key, r.value]));
    const [h, m] = (map.leaderboard_post_time || '05:00').split(':');
    return {
      hour:    parseInt(h, 10) || 5,
      minute:  parseInt(m, 10) || 0,
      weekday: parseInt(map.leaderboard_post_day ?? '1', 10), // 0=Sun, 1=Mon ...
    };
  } catch {
    return { hour: 5, minute: 0, weekday: 1 };
  }
}

async function getMsUntilNextPost() {
  const { hour, minute, weekday } = await getPostConfig();
  const now    = new Date();
  const sydNow = new Date(now.toLocaleString('en-US', { timeZone: brand.timezone }));
  const sydDay = sydNow.getDay();
  const sydH   = sydNow.getHours();
  const sydM   = sydNow.getMinutes();

  let daysUntil = (weekday - sydDay + 7) % 7;
  if (daysUntil === 0 && (sydH > hour || (sydH === hour && sydM > minute))) {
    daysUntil = 7;
  }

  const target = new Date(sydNow);
  target.setDate(sydNow.getDate() + daysUntil);
  target.setHours(hour, minute, 0, 0);

  const offset = now.getTime() - sydNow.getTime();
  return Math.max((target.getTime() + offset) - now.getTime(), 0);
}

async function runLeaderboardPost() {
  const { CHANNEL_ID, GUILD_ID } = getEnv();
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  console.log(`[leaderboard-scheduler] runLeaderboardPost() — CHANNEL_ID: ${CHANNEL_ID || 'NOT SET'}`);

  if (!CHANNEL_ID) {
    console.warn('[leaderboard-scheduler] DISCORD_LEADERBOARD_CHANNEL_ID not set — skipping.');
    return;
  }
  if (!DISCORD_BOT_TOKEN) {
    console.warn('[leaderboard-scheduler] DISCORD_BOT_TOKEN not set — skipping.');
    return;
  }

  try {

    const pb = await getAdminClient();

    // 7 days ago in ISO format
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');

    const [recentFlights, ranks] = await Promise.all([
      pb.collection('flights').getFullList({
        filter: `status = "approved" && date >= "${escFilterValue(since)}"`,
        requestKey: null,
      }),
      pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null }),
    ]);

    if (!recentFlights.length) {
      console.log('[leaderboard-scheduler] No flights in last 7 days — skipping post');
      return;
    }

    // Aggregate hours per user
    const userHours = {};
    for (const f of recentFlights) {
      userHours[f.user] = (userHours[f.user] || 0) + (f.flight_time || 0);
    }

    // Sort and take top 5
    const top5Ids = Object.entries(userHours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, hours]) => ({ id, hours }));

    // Fetch user records for top 5
    const userRecords = await Promise.all(
      top5Ids.map(({ id }) => pb.collection('users').getOne(id, { requestKey: null }).catch(() => null))
    );

    const pilots = top5Ids
      .map(({ id, hours }, i) => ({ user: userRecords[i], hours }))
      .filter(p => p.user);

    if (!pilots.length) return;

    const getRankName = (hours) => {
      const earned = ranks.filter(r => hours >= r.hours_required);
      return earned.length ? earned[earned.length - 1].name : 'New Pilot';
    };

    const formatHours = (h) => {
      const hrs = Math.floor(h || 0);
      const min = Math.round(((h || 0) % 1) * 60);
      return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
    };

    const positions = ['1st', '2nd', '3rd', '4th', '5th'];

    const rows = pilots.map(({ user: p, hours }, i) =>
      `**${positions[i]}** — ${p.first_name} ${p.last_name} (${p.callsign}) · ${formatHours(hours)} · ${getRankName(p.total_hours)}`
    ).join('\n');

    const now = new Date();
    const weekStr = now.toLocaleDateString('en-AU', {
      timeZone: brand.timezone,
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const embed = {
      title: 'Weekly Leaderboard',
      description: `Top 5 pilots by flight hours over the past 7 days\n\n${rows}`,
      color: brand.embedColor('accent'),
      footer: { text: brand.footer(brand.frontendUrl.replace(/^https?:\/\//, '')) },
      timestamp: new Date().toISOString(),
    };

    const postRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!postRes.ok) {
      const err = await postRes.json().catch(() => ({}));
      throw new Error(`Discord API error ${postRes.status}: ${JSON.stringify(err)}`);
    }

    console.log('[leaderboard-scheduler] Posted weekly leaderboard');

  } catch (err) {
    console.error('[leaderboard-scheduler] Failed:', err.message);
  }
}

// lastFired is stored in PocketBase so multiple fly instances share the same lock
async function getLastFired() {
  try {
    const pb  = await getAdminClient();
    const rec = await pb.collection('settings').getFirstListItem('key = "leaderboard_last_fired"', { requestKey: null });
    return rec.value || '';
  } catch { return ''; }
}

async function setLastFired(dateStr) {
  try {
    const pb = await getAdminClient();
    let existing;
    try {
      existing = await pb.collection('settings').getFirstListItem('key = "leaderboard_last_fired"', { requestKey: null });
    } catch { existing = null; }
    if (existing) {
      await pb.collection('settings').update(existing.id, { value: dateStr }, { requestKey: null });
    } else {
      await pb.collection('settings').create({ key: 'leaderboard_last_fired', value: dateStr }, { requestKey: null });
    }
  } catch (err) {
    console.error('[leaderboard-scheduler] failed to set lastFired:', err.message);
  }
}

// Poll every minute; fire when Sydney day+time matches config.
async function scheduleLeaderboardPost(client) {
  _client = client;
  console.log('[leaderboard-scheduler] Started — polling every 60s');

  setInterval(async () => {
    try {
      const { hour, minute, weekday } = await getPostConfig();
      const sydNow  = new Date(new Date().toLocaleString('en-US', { timeZone: brand.timezone }));
      const sydDay  = sydNow.getDay();
      const sydH    = sydNow.getHours();
      const sydM    = sydNow.getMinutes();
      const dateStr = sydNow.toDateString();
      const DAYS    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

      const withinWindow = sydDay === weekday && sydH === hour && sydM >= minute && sydM <= minute + 1;
      if (withinWindow) {
        const lastFired = await getLastFired();
        console.log(`[leaderboard-scheduler] poll — Sydney: ${DAYS[sydDay]} ${String(sydH).padStart(2,'0')}:${String(sydM).padStart(2,'0')} | target: ${DAYS[weekday]} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} | lastFired: ${lastFired || 'never'}`);
        if (lastFired !== dateStr) {
          await setLastFired(dateStr); // claim the lock before posting so other instances see it
          await runLeaderboardPost();
        }
      }
    } catch (err) {
      console.error('[leaderboard-scheduler] poll error:', err.message);
    }
  }, 60 * 1000);
}

module.exports = { scheduleLeaderboardPost, runLeaderboardPost, setClient };
