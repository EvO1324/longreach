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

const RECRUITMENT_ROLE_ID = process.env.DISCORD_RECRUITMENT_ROLE_ID || null;
const RECRUITMENT_WEBHOOK = process.env.DISCORD_WEBHOOK_REGISTRATIONS;
const STALE_HOURS         = 24;
const REPING_COOLDOWN_MS  = 12 * 60 * 60 * 1000; // 12 hours between pings

async function runRecruitmentReminder() {
  if (!RECRUITMENT_WEBHOOK) return;

  try {
    const pb  = await getAdminClient();
    const now = new Date();
    const cutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);

    // Find pilots in early recruitment stages with no action since cutoff
    const stale = await pb.collection('users').getFullList({
      filter: `(recruitment_status = "applied" || recruitment_status = "exam_sent") && updated <= "${escFilterValue(cutoff.toISOString())}"`,
      fields: 'id,first_name,last_name,callsign,recruitment_status,updated',
      requestKey: null,
    });

    if (!stale.length) return;

    // Cooldown check via PocketBase so it survives deploys/restarts
    try {
      const setting = await pb.collection('settings').getFirstListItem('key = "recruitment_reminder_last_ping"', { requestKey: null });
      const lastPing = new Date(setting.value);
      if ((now - lastPing) < REPING_COOLDOWN_MS) {
        console.log(`[recruitment-reminder] ${stale.length} stale application(s) but cooldown active — skipping`);
        return;
      }
    } catch {}

    console.log(`[recruitment-reminder] ${stale.length} stale application(s) — pinging recruitment team`);

    const lines = stale.map(p => {
      const hrs = Math.floor((now - new Date(p.updated)) / 3600000);
      const stage = p.recruitment_status === 'applied' ? 'Applied' : 'Exam Sent';
      return `• **${p.first_name} ${p.last_name}** (${p.callsign || '—'}) — ${stage} · ${hrs}h ago`;
    });

    await fetch(RECRUITMENT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${RECRUITMENT_ROLE_ID ? `<@&${RECRUITMENT_ROLE_ID}> ` : ''}${stale.length} application${stale.length !== 1 ? 's' : ''} need${stale.length === 1 ? 's' : ''} attention (24h+ with no action):`,
        embeds: [{
          color: brand.embedColor('accent'),
          description: lines.join('\n'),
          footer: { text: brand.footer('Recruitment Reminder') },
          timestamp: now.toISOString(),
        }],
      }),
    });

    // Save last ping time to PocketBase so it persists across restarts
    try {
      const existing = await pb.collection('settings').getFirstListItem('key = "recruitment_reminder_last_ping"', { requestKey: null }).catch(() => null);
      if (existing) {
        await pb.collection('settings').update(existing.id, { value: now.toISOString() });
      } else {
        await pb.collection('settings').create({ key: 'recruitment_reminder_last_ping', value: now.toISOString() });
      }
    } catch (saveErr) {
      console.warn('[recruitment-reminder] failed to save last ping time:', saveErr.message);
    }
  } catch (err) {
    console.error('[recruitment-reminder] error:', err.message);
  }
}

function scheduleRecruitmentReminder() {
  console.log('[recruitment-reminder] scheduler registered — checks every hour');
  scheduleRecruitmentReminder._nextRun = new Date(Date.now() + 30000).toISOString();
  setTimeout(() => {
    scheduleRecruitmentReminder._lastRun = new Date().toISOString();
    scheduleRecruitmentReminder._nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    runRecruitmentReminder();
    setInterval(() => {
      scheduleRecruitmentReminder._lastRun = new Date().toISOString();
      scheduleRecruitmentReminder._nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      runRecruitmentReminder();
    }, 60 * 60 * 1000);
  }, 30000);
}

module.exports = { scheduleRecruitmentReminder, runRecruitmentReminder };
