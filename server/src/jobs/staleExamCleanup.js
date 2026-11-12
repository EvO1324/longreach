/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');
const { logAction } = require('../utils/audit');
const { deletePilotFully } = require('../routes/pilots');
const { escFilterValue } = require('../utils/pbFilter');

const STALE_DAYS   = 30;
const WEBHOOK_URL  = process.env.DISCORD_WEBHOOK_REGISTRATIONS;

async function runStaleExamCleanup({ dryRun = false } = {}) {
  const label = dryRun ? '[stale-exam-cleanup:dry-run]' : '[stale-exam-cleanup]';
  try {
    const pb = await getAdminClient();
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const stale = await pb.collection('users').getFullList({
      filter: `recruitment_status = "exam_sent" && exam_attempts = 0 && exam_token_created != "" && exam_token_created <= "${escFilterValue(cutoff.toISOString())}"`,
      fields: 'id,first_name,last_name,callsign,exam_token_created',
      requestKey: null,
    });

    if (!stale.length) {
      console.log(`${label} nothing to clean up`);
      return { deleted: 0 };
    }

    console.log(`${label} ${stale.length} application(s) exceeded ${STALE_DAYS} days with an unfinished exam`);

    const deletedNames = [];
    for (const p of stale) {
      const name = `${p.first_name} ${p.last_name}`;
      const daysStale = Math.floor((Date.now() - new Date(p.exam_token_created).getTime()) / 86400000);

      if (dryRun) {
        deletedNames.push(`${name} (would delete, ${daysStale}d stale)`);
        continue;
      }

      try {
        await deletePilotFully(pb, p.id);
        await logAction(null, 'staff_app.auto_expired', { id: p.id, name }, {
          reason: `Exam link sent but never completed — ${daysStale} days stale (auto-expiry threshold: ${STALE_DAYS} days)`,
        });
        deletedNames.push(name);
      } catch (err) {
        console.warn(`${label} failed to delete ${p.id} (${name}):`, err.message);
      }
    }

    if (!dryRun && deletedNames.length && WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              color: brand.embedColor('primary'),
              title: 'Stale applications auto-removed',
              description: `${deletedNames.length} application${deletedNames.length !== 1 ? 's' : ''} deleted — exam link sent but never completed within ${STALE_DAYS} days:\n${deletedNames.map(n => `• ${n}`).join('\n')}`,
              footer: { text: brand.footer('Recruitment') },
              timestamp: new Date().toISOString(),
            }],
          }),
        });
      } catch (err) {
        console.warn(`${label} webhook failed:`, err.message);
      }
    }

    return { deleted: deletedNames.length, names: deletedNames };
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return { deleted: 0, error: err.message };
  }
}

function scheduleStaleExamCleanup() {
  console.log('[stale-exam-cleanup] scheduler registered — checks daily');

  const msUntil4amSydney = () => {
    const now = new Date();
    const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: brand.timezone }));
    const next = new Date(sydneyNow);
    next.setHours(4, 0, 0, 0);
    if (next <= sydneyNow) next.setDate(next.getDate() + 1);
    return next.getTime() - sydneyNow.getTime();
  };

  const run = () => {
    scheduleStaleExamCleanup._lastRun = new Date().toISOString();
    scheduleStaleExamCleanup._nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    runStaleExamCleanup();
  };

  const delay = msUntil4amSydney();
  scheduleStaleExamCleanup._nextRun = new Date(Date.now() + delay).toISOString();
  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, delay);
}

module.exports = { scheduleStaleExamCleanup, runStaleExamCleanup };
