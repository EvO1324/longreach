/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient }          = require('../config/pocketbase');
const brand = require('../config/brand');
const { escFilterValue } = require('../utils/pbFilter');

const { postChallengeToDiscord }  = require('../routes/challenges');
const { notifyAll }               = require('../routes/push');

async function postCloseSummaryToDiscord(challenge, stats) {
  const CHANNEL_ID = process.env.DISCORD_CHALLENGES_CHANNEL_ID;
  const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
  if (!CHANNEL_ID || !BOT_TOKEN) return;

  const topThree = stats.topEntries.slice(0, 3);
  const podium = topThree.map((e, i) =>
    `> ${['🥇', '🥈', '🥉'][i]} **${e.name}** (${e.callsign}) — ${e.total_flight_time.toFixed(1)}h`
  ).join('\n');

  const content = [
    `## ✅ Challenge Closed — ${challenge.name}`,
    ``,
    `📊 **${stats.totalEnrolled}** pilots enrolled · **${stats.totalCompleted}** completed · **${stats.totalHours.toFixed(1)}h** total hours flown`,
    ``,
    topThree.length > 0 ? `🏆 **Final standings**\n${podium}` : '',
    ``,
    `Thanks to everyone who participated!`,
  ].filter(l => l !== null).join('\n');

  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn(`[challengeReminder] close summary Discord post failed: ${JSON.stringify(err)}`);
  } else {
    console.log(`[challengeReminder] Posted close summary for "${challenge.name}"`);
  }
}

async function runChallengeReminder() {
  const pb = await getAdminClient();
  const todayStr    = new Date().toISOString().slice(0, 10);
  const tomorrow    = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // 1. 24hr reminders
  let remindChallenges = [];
  try {
    remindChallenges = await pb.collection('challenges').getFullList({
      filter: `status = "active" && start_date = "${escFilterValue(tomorrowStr)}" && reminded_at = ""`,
      requestKey: null,
    });
  } catch { /* ignore */ }

  for (const challenge of remindChallenges) {
    try {
      const legs = await pb.collection('challenge_legs').getFullList({
        filter: `challenge = "${escFilterValue(challenge.id)}"`, sort: 'order', requestKey: null,
      });
      await postChallengeToDiscord(challenge, legs, true);
      notifyAll({
        title: '✈️ Challenge starts tomorrow',
        body: `${challenge.name} begins tomorrow — enroll now!`,
        url: '/challenges',
        icon: brand.appIcon,
      }).catch(() => {});
      await pb.collection('challenges').update(challenge.id, { reminded_at: new Date().toISOString() });
      console.log(`[challengeReminder] Sent 24hr reminder for "${challenge.name}"`);
    } catch (err) {
      console.error(`[challengeReminder] Reminder failed for ${challenge.id}:`, err.message);
    }
  }

  const nowUTC = new Date();
  const isAfter0600 = nowUTC.getUTCHours() >= 6;

  let expiredChallenges = [];
  if (isAfter0600) {
    try {
      expiredChallenges = await pb.collection('challenges').getFullList({
        filter: `status = "active" && end_date = "${escFilterValue(todayStr)}"`,
        requestKey: null,
      });
    } catch { /* ignore */ }
  }

  for (const challenge of expiredChallenges) {
    try {
      // Gather summary stats
      const entries = await pb.collection('challenge_entries').getFullList({
        filter: `challenge = "${escFilterValue(challenge.id)}"`,
        fields: 'id,status,total_flight_time,user',
        requestKey: null,
      });

      const totalEnrolled  = entries.length;
      const totalCompleted = entries.filter(e => e.status === 'completed').length;
      const totalHours     = entries.reduce((sum, e) => sum + (e.total_flight_time || 0), 0);

      // Fetch top 3 completed entries sorted by completed_at
      const completedEntries = await pb.collection('challenge_entries').getFullList({
        filter: `challenge = "${escFilterValue(challenge.id)}" && status = "completed"`,
        sort: 'completed_at',
        fields: 'id,user,total_flight_time',
        requestKey: null,
      });

      const topEntries = await Promise.all(completedEntries.slice(0, 3).map(async e => {
        try {
          const u = await pb.collection('users').getOne(e.user, { fields: 'first_name,last_name,callsign', requestKey: null });
          return { ...e, name: `${u.first_name} ${u.last_name || ''}`.trim(), callsign: u.callsign };
        } catch { return { ...e, name: 'Unknown', callsign: '—' }; }
      }));

      // Auto-close
      await pb.collection('challenges').update(challenge.id, { status: 'closed' });
      console.log(`[challengeReminder] Auto-closed "${challenge.name}"`);

      // Post summary to Discord
      await postCloseSummaryToDiscord(challenge, { totalEnrolled, totalCompleted, totalHours, topEntries });

      // Push notification to all
      notifyAll({
        title: `Challenge Closed — ${challenge.name}`,
        body: `${totalCompleted}/${totalEnrolled} pilots completed it. Check the final standings!`,
        url: `/challenges/${challenge.id}`,
        icon: brand.appIcon,
      }).catch(() => {});

    } catch (err) {
      console.error(`[challengeReminder] Auto-close failed for ${challenge.id}:`, err.message);
    }
  }
}

function scheduleChallengeReminder() {
  const MS_PER_HOUR = 60 * 60 * 1000;
  const run = async () => {
    try { await runChallengeReminder(); } catch (err) { console.error('[challengeReminder]', err.message); }
    setTimeout(run, MS_PER_HOUR);
  };
  setTimeout(run, 5 * 60 * 1000);
  console.log('[challengeReminder] Scheduled — checks hourly for reminders and auto-close');
}

module.exports = { scheduleChallengeReminder, runChallengeReminder, postCloseSummaryToDiscord };
