/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient }   = require('../config/pocketbase');
const brand = require('../config/brand');
const { escFilterValue } = require('../utils/pbFilter');

const { syncLegacySettings, postToDiscord, slotsToSchedule, fmtWeekLabel } = require('../routes/rotw');
const { notifyAll }        = require('../routes/push');

function getMsUntilNextMonday0100UTC() {
  const now     = new Date();
  const day     = now.getUTCDay();    // 0=Sun, 1=Mon ... 6=Sat
  const hour    = now.getUTCHours();
  const minute  = now.getUTCMinutes();

  // Days until next Monday
  let daysUntil = (8 - day) % 7 || 7;
  if (day === 1 && hour < 1) daysUntil = 0;

  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysUntil);
  target.setUTCHours(1, 0, 0, 0);

  return Math.max(target.getTime() - now.getTime(), 0);
}

async function runRotwPost() {
  const pb         = await getAdminClient();
  const todayStr   = new Date().toISOString().slice(0, 10);

  console.log(`[rotw-scheduler] Running at 01:00 UTC — looking for week starting ${todayStr}`);

  let week;
  try {
    week = await pb.collection('rotw_weeks').getFirstListItem(`week_start = "${escFilterValue(todayStr)}"`, { requestKey: null });
  } catch {
    console.log(`[rotw-scheduler] No week for ${todayStr} — skipping`);
    return;
  }

  if (week.posted) {
    console.log(`[rotw-scheduler] Week ${todayStr} already posted — skipping`);
    return;
  }

  const weekLabel = fmtWeekLabel(week.week_start);

  // Sync to legacy settings keys (so /rotw slash command still works)
  await syncLegacySettings(pb, week.id, week.week_start);

  // Mark as posted
  await pb.collection('rotw_weeks').update(week.id, {
    posted:    true,
    posted_at: new Date().toISOString(),
  });

  // Push notification
  try {
    await notifyAll({
      title: '✈️ Routes of the Week',
      body:  `New routes are live for ${weekLabel}. Check them out!`,
      url:   '/rotw',
      icon:  brand.appIcon,
    });
  } catch (err) {
    console.error('[rotw-scheduler] Push failed:', err.message);
  }

  // Discord post
  try {
    await postToDiscord(pb, week.id, weekLabel);
  } catch (err) {
    console.error('[rotw-scheduler] Discord failed:', err.message);
  }

  console.log(`[rotw-scheduler] Week ${todayStr} published`);
}

function scheduleRotwPoster() {
  const ms = getMsUntilNextMonday0100UTC();
  scheduleRotwPoster._nextRun = new Date(Date.now() + ms).toISOString();
  console.log(`[rotw-scheduler] Next Monday 01:00 UTC in ${(ms / 3600000).toFixed(1)}h`);

  setTimeout(async () => {
    scheduleRotwPoster._lastRun = new Date().toISOString();
    try { await runRotwPost(); } catch (err) { console.error('[rotw-scheduler] run failed:', err); }
    setInterval(async () => {
      scheduleRotwPoster._lastRun = new Date().toISOString();
      scheduleRotwPoster._nextRun = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      try { await runRotwPost(); } catch (err) { console.error('[rotw-scheduler] run failed:', err); }
    }, 7 * 24 * 60 * 60 * 1000);
  }, ms);
}

module.exports = { scheduleRotwPoster, runRotwPost };
