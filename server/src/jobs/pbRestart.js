/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const brand = require('../config/brand');

const getEnv = () => ({
  FLY_API_TOKEN: process.env.FLY_API_TOKEN,
  PB_APP_NAME:   process.env.POCKETBASE_APP_NAME || '',
  WEBHOOK_ADMIN: process.env.DISCORD_WEBHOOK_ADMIN,
});

async function notifyRestart(success, detail = '', machineId = null) {
  const { WEBHOOK_ADMIN } = getEnv();
  if (!WEBHOOK_ADMIN) {
    console.warn('[pb-restart] DISCORD_WEBHOOK_ADMIN not set — skipping notification');
    return;
  }
  const { PB_APP_NAME } = getEnv();
  const sydneyTime = new Date().toLocaleString('en-AU', {
    timeZone: brand.timezone,
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const fields = [
    { name: 'App', value: PB_APP_NAME, inline: true },
    { name: 'Time (Sydney)', value: sydneyTime, inline: true },
    ...(machineId ? [{ name: 'Machine ID', value: `\`${machineId}\``, inline: true }] : []),
    ...((!success && detail) ? [{ name: 'Error', value: `\`\`\`${detail.slice(0, 500)}\`\`\`` }] : []),
  ];
  try {
    await fetch(WEBHOOK_ADMIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: success ? '✅ PocketBase Restarted' : '❌ PocketBase Restart Failed',
          color: success ? brand.embedColor('primary') : 0xc62828,
          description: success
            ? 'Daily scheduled restart completed successfully.'
            : 'Scheduled restart failed — manual intervention may be required.',
          fields,
          footer: { text: brand.footer('Infrastructure') },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    console.log('[pb-restart] discord notification sent');
  } catch (e) {
    console.warn('[pb-restart] webhook notify failed:', e.message);
  }
}

function msUntil3amSydney() {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: brand.timezone }));
  const next3am = new Date(sydneyNow);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= sydneyNow) next3am.setDate(next3am.getDate() + 1);
  const offsetMs = now.getTime() - sydneyNow.getTime();
  return Math.max(next3am.getTime() + offsetMs - now.getTime(), 60 * 1000);
}

async function restartPocketBase() {
  const { FLY_API_TOKEN, PB_APP_NAME } = getEnv();

  if (!FLY_API_TOKEN || !PB_APP_NAME) {
    console.log('[pb-restart] FLY_API_TOKEN or POCKETBASE_APP_NAME not set — skipping restart');
    return;
  }

  try {
    console.log('[pb-restart] fetching machines for', PB_APP_NAME);
    const listRes = await fetch(`https://api.machines.dev/v1/apps/${PB_APP_NAME}/machines`, {
      headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
    });

    if (!listRes.ok) {
      const err = await listRes.text();
      console.error('[pb-restart] failed to list machines:', listRes.status, err);
      await notifyRestart(false, `Failed to list machines — HTTP ${listRes.status}: ${err}`);
      return;
    }

    const machines = await listRes.json();
    if (!machines?.length) {
      console.warn('[pb-restart] no machines found for', PB_APP_NAME);
      await notifyRestart(false, `No machines found for app "${PB_APP_NAME}"`);
      return;
    }

    const machine = machines[0];
    console.log(`[pb-restart] restarting machine ${machine.id}...`);

    const restartRes = await fetch(`https://api.machines.dev/v1/apps/${PB_APP_NAME}/machines/${machine.id}/restart`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
    });

    if (restartRes.ok) {
      console.log(`[pb-restart] machine ${machine.id} restarted successfully`);
      await notifyRestart(true, '', machine.id);
    } else {
      const err = await restartRes.text();
      console.error('[pb-restart] restart failed:', restartRes.status, err);
      await notifyRestart(false, `HTTP ${restartRes.status}: ${err}`, machine.id);
    }
  } catch (err) {
    console.error('[pb-restart] error:', err.message);
    await notifyRestart(false, err.message);
  }
}

function schedulePbRestart() {
  function scheduleNext() {
    const ms = msUntil3amSydney();
    schedulePbRestart._nextRun = new Date(Date.now() + ms).toISOString();
    console.log(`[pb-restart] next restart in ${(ms / 3600000).toFixed(1)}h (3am Sydney)`);
    setTimeout(async () => {
      schedulePbRestart._lastRun = new Date().toISOString();
      try { await restartPocketBase(); }
      catch (err) { console.error('[pb-restart] scheduled run failed:', err.message); }
      scheduleNext();
    }, ms);
  }

  console.log('[pb-restart] scheduler registered — restarts PocketBase at 3am Sydney time');
  scheduleNext();
}

module.exports = { schedulePbRestart, restartPocketBase };
