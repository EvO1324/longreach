/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient, adminPatch } = require('../config/pocketbase');
const brand = require('../config/brand');
const { escFilterValue } = require('../utils/pbFilter');
const {
  notifyActivityWarnings,
  notifyActivitySuspensions,
  notifyActivitySummary,
  notifyActivityFinalWarning,
  notifyPilotKicked,
} = require('../routes/discord');

const DEFAULT_DAYS = 30;

async function activitySettings(pb) {
  const read = async (key) => {
    const rec = await pb.collection('settings').getFirstListItem(`key = "${key}"`, { requestKey: null }).catch(() => null);
    return rec ? rec.value : null;
  };
  const [enabled, days, notice, finalWarning] = await Promise.all(
    ['activity_enabled', 'inactivity_days', 'activity_notice_days', 'activity_final_warning'].map(read),
  );
  const d = parseInt(days, 10) > 1 ? parseInt(days, 10) : DEFAULT_DAYS;
  const n = parseInt(notice, 10);
  return {
    enabled: enabled !== 'false',
    days: d,
    noticeDays: n >= 1 && n < d ? n : Math.min(7, d - 1),
    finalWarning: finalWarning !== 'false',
  };
}

const GUILD_ID           = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN          = process.env.DISCORD_BOT_TOKEN;
const WARNING_ROLE_ID    = process.env.DISCORD_ACTIVITY_WARNING_ROLE_ID;
const WARNING_CHANNEL_ID = process.env.DISCORD_ACTIVITY_WARNING_CHANNEL_ID;
const STAFF_ROLE_ID      = process.env.DISCORD_STAFF_ROLE_ID;

async function setLastRun(pb, when) {
  try {
    const existing = await pb.collection('settings').getFirstListItem('key = "activity_last_run"', { requestKey: null }).catch(() => null);
    if (existing) {
      await pb.collection('settings').update(existing.id, { value: when.toISOString() });
    } else {
      await pb.collection('settings').create({ key: 'activity_last_run', value: when.toISOString() });
    }
  } catch (err) {
    console.warn('[activity] failed to persist activity_last_run:', err.message);
  }
}

async function discordReq(method, path, body) {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`[activity] Discord ${method} ${path} → ${res.status}:`, err.message || '');
    }
    return res;
  } catch (e) {
    console.warn(`[activity] Discord request error:`, e.message);
    return null;
  }
}

async function assignRole(discordId, roleId) {
  if (!discordId || !roleId || !GUILD_ID) return;
  await discordReq('PUT', `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`);
}

async function removeRole(discordId, roleId) {
  if (!discordId || !roleId || !GUILD_ID) return;
  await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`);
}

async function getMemberRoles(discordId) {
  if (!discordId || !GUILD_ID) return [];
  const res = await discordReq('GET', `/guilds/${GUILD_ID}/members/${discordId}`);
  if (!res || !res.ok) return [];
  try { const d = await res.json(); return d.roles || []; } catch { return []; }
}

async function threadStillExists(threadId) {
  if (!threadId) return false;
  const res = await discordReq('GET', `/channels/${threadId}`);
  return !!(res && res.ok);
}

async function createActivityThread(pb, pilot, name) {
  if (!WARNING_CHANNEL_ID) return null;
  const res = await discordReq('POST', `/channels/${WARNING_CHANNEL_ID}/threads`, {
    name: name.slice(0, 100),
    auto_archive_duration: 10080,
    type: 11, // GUILD_PUBLIC_THREAD
  });
  if (!res || !res.ok) return null;

  let thread;
  try { thread = await res.json(); } catch { return null; }
  if (!thread?.id) return null;

  try {
    await adminPatch(pilot.id, { activity_thread_id: thread.id });
    pilot.activity_thread_id = thread.id;
  } catch (e) {
    console.warn('[activity] failed to save activity_thread_id:', e.message);
  }

  if (STAFF_ROLE_ID) {
    const mention = pilot.discord_id ? `<@${pilot.discord_id}>` : (pilot.callsign || `${pilot.first_name} ${pilot.last_name}`);
    await discordReq('POST', `/channels/${thread.id}/messages`, {
      content: `<@&${STAFF_ROLE_ID}> activity warning opened for ${mention}.`,
    });
  }

  return thread.id;
}

async function getOrCreateActivityThread(pb, pilot) {
  if (!WARNING_CHANNEL_ID || !BOT_TOKEN) return null;
  if (pilot.activity_thread_id && await threadStillExists(pilot.activity_thread_id)) {
    return pilot.activity_thread_id;
  }
  const name = `${pilot.callsign || `${pilot.first_name} ${pilot.last_name}` || 'Pilot'} - Activity Warning`;
  return createActivityThread(pb, pilot, name);
}

async function pingWarningChannel(pb, pilot, daysUntilSuspension, isFinal = false) {
  if (!pilot.discord_id) return;
  const threadId = await getOrCreateActivityThread(pb, pilot);
  if (!threadId) return;
  const mention = `<@${pilot.discord_id}>`;
  const loaUrl  = `${brand.frontendUrl}/leave`;
  const content = isFinal
    ? `⚠️ **Final Warning** ${mention} - your account will be **archived in less than 24 hours** due to inactivity. File a PIREP or [request a Leave of Absence](${loaUrl}) immediately to avoid this.`
    : `🕐 **Activity Warning** ${mention} - your account will be archived in **${daysUntilSuspension} day${daysUntilSuspension !== 1 ? 's' : ''}** unless you file an approved PIREP or [request a Leave of Absence](${loaUrl}).`;
  await discordReq('POST', `/channels/${threadId}/messages`, { content });
}

async function closeActivityThread(pilot, content) {
  if (!pilot.activity_thread_id) return;
  await discordReq('POST', `/channels/${pilot.activity_thread_id}/messages`, { content }).catch(() => {});
  await discordReq('PATCH', `/channels/${pilot.activity_thread_id}`, { archived: true, locked: true }).catch(() => {});
}

async function resolveActivityWarning(pilot) {
  if (pilot.discord_id && WARNING_ROLE_ID) {
    await removeRole(pilot.discord_id, WARNING_ROLE_ID).catch(() => {});
  }
  if (pilot.activity_thread_id) {
    await closeActivityThread(pilot, '✅ **Resolved** — a flight was filed, the account is active again. This case is now closed.');
  }
}

async function runForceTest({ userId, scenario }) {
  console.log(`[activity:force-test] scenario=${scenario} userId=${userId}`);
  const pb = await getAdminClient();
  let pilot;
  try {
    pilot = await pb.collection('users').getOne(userId, { requestKey: null });
  } catch {
    throw new Error(`User not found: ${userId}`);
  }

  const name           = `${pilot.first_name} ${pilot.last_name}`;
  const discordMention = pilot.discord_id ? `<@${pilot.discord_id}>` : name;

  if (scenario === 'warn') {
    console.log(`[activity:force-test] firing WARN for ${name}`);
    await assignRole(pilot.discord_id, WARNING_ROLE_ID);
    await new Promise(r => setTimeout(r, 1000));
    await pingWarningChannel(pb, pilot, 7, false);
    return { scenario: 'warn', name, discord_id: pilot.discord_id, message: `Warning role assigned and thread pinged for ${name}` };

  } else if (scenario === 'finalWarn') {
    console.log(`[activity:force-test] firing FINAL WARN for ${name}`);
    await pingWarningChannel(pb, pilot, 1, true);
    return { scenario: 'finalWarn', name, discord_id: pilot.discord_id, message: `Final warning thread ping sent for ${name}` };

  } else if (scenario === 'suspend') {
    console.log(`[activity:force-test] firing SUSPEND (kick) for ${name} — NOT modifying PocketBase`);
    if (pilot.discord_id && GUILD_ID) {
      await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}`);
    }
    await closeActivityThread(pilot, '🔒 **Force test** — this would normally close the case (account archived + removed from server). PocketBase was NOT modified.');
    await notifyPilotKicked({ name, callsign: pilot.callsign || null, daysInactive: null, lastFlightStr: 'Force test', discordMention }).catch(() => {});
    return { scenario: 'suspend', name, discord_id: pilot.discord_id, message: `Kicked from Discord: ${name} — PocketBase NOT modified` };

  } else {
    throw new Error(`Unknown scenario: ${scenario}. Use 'warn', 'finalWarn', or 'suspend'`);
  }
}

async function runActivityCheck({ dryRun = false, testUserId = null, forceTest = null } = {}) {
  if (forceTest) {
    return runForceTest(forceTest);
  }
  const label = dryRun ? '[activity:dry-run]' : '[activity]';
  console.log(`${label} starting...`);

  const pb = await getAdminClient();

  // The VA's rules, from Admin › Activity (settings collection)
  const rules = await activitySettings(pb);
  if (!rules.enabled && !testUserId && !forceTest) {
    console.log(`${label} switched off in Admin › Activity — nothing to do`);
    return { warned: [], finalWarned: [], suspended: [], skipped: [], disabled: true };
  }
  const threshold  = rules.days;
  const warnDay    = threshold - rules.noticeDays;
  const finalDay   = rules.finalWarning ? threshold - 1 : Infinity;
  const suspendDay = threshold;

  const now = new Date();
  const warnCutoff    = new Date(now); warnCutoff.setDate(now.getDate() - warnDay);
  const suspendCutoff = new Date(now); suspendCutoff.setDate(now.getDate() - suspendDay);

  console.log(`${label} threshold=${threshold}d | warn@${warnDay}d | final@${rules.finalWarning ? `${finalDay}d` : 'off'} | suspend@${suspendDay}d`);

  let pilots;
  if (testUserId) {
    try {
      const p = await pb.collection('users').getOne(testUserId, { requestKey: null });
      pilots = [p];
      console.log(`${label} test mode — user: ${p.first_name} ${p.last_name}`);
    } catch {
      throw new Error(`Test user not found: ${testUserId}`);
    }
  } else {
    pilots = await pb.collection('users').getFullList({
      filter: 'status = "approved"',
      fields: 'id,first_name,last_name,callsign,discord_id,discord_username,activity_warned_at,activity_thread_id,created,has_imported_history,status',
      requestKey: null,
    });
  }

  let onLeaveIds = new Set();
  try {
    const today = new Date().toISOString().split('T')[0];
    const leaveRecords = await pb.collection('leave_requests').getFullList({
      filter: `status = "approved" && start_date <= "${escFilterValue(today)}" && end_date >= "${escFilterValue(today)}"`,
      fields: 'user',
      requestKey: null,
    });
    onLeaveIds = new Set(leaveRecords.map(r => r.user));
    if (onLeaveIds.size > 0) console.log(`${label} ${onLeaveIds.size} pilot(s) on approved leave — exempt`);
  } catch (err) {
    console.warn(`${label} could not fetch leave records:`, err.message);
  }

  const warned = [], finalWarned = [], suspended = [], skipped = [];

  const lastFlightMap = {};
  if (!testUserId) {
    try {
      const cutoffDate = new Date(now);
      cutoffDate.setDate(now.getDate() - 730);
      const recentFlights = await pb.collection('flights').getFullList({
        filter: `status = "approved" && date >= "${escFilterValue(cutoffDate.toISOString().split('T')[0])}"`,
        fields: 'user,date',
        sort: '-date',
        requestKey: null,
      });
      // For each user, keep only the most recent flight date
      for (const f of recentFlights) {
        if (!lastFlightMap[f.user]) lastFlightMap[f.user] = new Date(f.date);
      }
      console.log(`${label} batched last flights — ${recentFlights.length} flights for ${Object.keys(lastFlightMap).length} pilots`);
    } catch (err) {
      console.warn(`${label} could not batch fetch flights:`, err.message);
    }
  }

  for (const pilot of pilots) {
    let lastFlightDate = null;
    if (testUserId) {
      // In test mode still query individually
      try {
        const res = await pb.collection('flights').getList(1, 1, {
          filter: `user = "${escFilterValue(pilot.id)}" && status = "approved"`,
          sort: '-date', fields: 'date', requestKey: null,
        });
        lastFlightDate = res.items[0]?.date ? new Date(res.items[0].date) : null;
      } catch (_) {}
    } else {
      lastFlightDate = lastFlightMap[pilot.id] || null;
    }

    const neverFlown             = !lastFlightDate;
    const effectiveLastActivity  = lastFlightDate || new Date(pilot.created);

    const name           = `${pilot.first_name} ${pilot.last_name}`;
    const callsign       = pilot.callsign || null;
    const discordMention = pilot.discord_id ? `<@${pilot.discord_id}>` : (pilot.discord_username ? `@${pilot.discord_username}` : name);
    const daysInactive   = Math.floor((now - effectiveLastActivity) / 86400000);
    const lastFlightStr  = neverFlown ? 'Never' : lastFlightDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

    if (!testUserId && onLeaveIds.has(pilot.id)) { skipped.push({ name, callsign, reason: 'on approved leave' }); continue; }
    const accountAgeDays = Math.floor((now - new Date(pilot.created)) / 86400000);
    if (!testUserId && accountAgeDays < threshold) { skipped.push({ name, callsign, reason: `account only ${accountAgeDays}d old` }); continue; }
    if (!testUserId && pilot.has_imported_history && accountAgeDays < threshold) { skipped.push({ name, callsign, reason: 'imported history — grace period active' }); continue; }

    const warnedAt      = pilot.activity_warned_at ? new Date(pilot.activity_warned_at) : null;
    const daysSinceWarn = warnedAt ? (now - warnedAt) / 86400000 : null;
    const daysToFinal    = finalDay - warnDay;
    const daysToSuspend  = suspendDay - warnDay;

    const warnIsStale = warnedAt && daysSinceWarn > daysToSuspend + 2;

    let shouldWarn = false, shouldFinalWarn = false, shouldSuspend = false;
    if (testUserId) {
      shouldWarn = true;
    } else if (!warnedAt || warnIsStale) {
      shouldWarn = effectiveLastActivity < warnCutoff;
    } else if (daysSinceWarn >= daysToSuspend) {
      shouldSuspend = true;
    } else if (daysSinceWarn >= daysToFinal) {
      shouldFinalWarn = true;
    }

    if (shouldSuspend) {
      console.log(`${label} ARCHIVE: ${name} (${daysInactive}d, warned ${daysSinceWarn.toFixed(1)}d ago)${dryRun ? ' [dry]' : ''}`);
      if (!dryRun) {
        try {
          const currentRoles = await getMemberRoles(pilot.discord_id);
          await adminPatch(pilot.id, {
            status: 'archived',
            activity_warned_at: null,
            activity_thread_id: null,
            suspended_roles: JSON.stringify(currentRoles),
          });
          if (pilot.discord_id && GUILD_ID) {
            await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}`);
            console.log(`${label} kicked from Discord: ${pilot.discord_id}`);
          }
          await closeActivityThread(pilot, '🔒 **Account Archived** — removed from the server due to continued inactivity. This case is now closed.');
          await notifyPilotKicked({ name, callsign, daysInactive, lastFlightStr, discordMention }).catch(() => {});
          console.log(`${label} archived OK: ${pilot.id}`);
        } catch (updateErr) {
          console.error(`${label} failed to archive ${name}:`, updateErr?.message);
          skipped.push({ name, callsign, reason: `archive failed: ${updateErr?.message}` }); continue;
        }
      }
      suspended.push({ id: pilot.id, name, callsign, daysInactive, lastFlightStr, discordMention });

    } else if (shouldFinalWarn) {
      console.log(`${label} FINAL WARN: ${name} (${daysInactive}d, warned ${daysSinceWarn.toFixed(1)}d ago)${dryRun ? ' [dry]' : ''}`);
      if (!dryRun) await pingWarningChannel(pb, pilot, 1, true);
      finalWarned.push({ id: pilot.id, name, callsign, daysInactive, lastFlightStr, discordMention });

    } else if (shouldWarn) {
      console.log(`${label} WARN: ${name} (${daysInactive ?? 'test'}d)${dryRun ? ' [dry]' : ''}`);
      if (!dryRun) {
        try { await adminPatch(pilot.id, { activity_warned_at: now.toISOString() }); }
        catch (dbErr) {
          console.error(`${label} failed to set activity_warned_at for ${name}:`, dbErr?.message);
          skipped.push({ name, callsign, reason: `warn db failed: ${dbErr?.message}` }); continue;
        }
        try { await assignRole(pilot.discord_id, WARNING_ROLE_ID); } catch (e) { console.error(`${label} assignRole failed for ${name}:`, e?.message); }
        await new Promise(r => setTimeout(r, 1000));
        try { await pingWarningChannel(pb, pilot, threshold - warnDay, false); } catch (e) { console.error(`${label} pingWarningChannel failed for ${name}:`, e?.message); }
      }
      warned.push({ id: pilot.id, name, callsign, daysInactive, lastFlightStr, discordMention });

    } else if (warnedAt) {
      skipped.push({ name, callsign, reason: `already warned ${daysSinceWarn.toFixed(1)}d ago — waiting on grace period` });
    } else {
      skipped.push({ name, callsign, reason: `${daysInactive}d — still active` });
    }
  }

  if (!dryRun) {
    await notifyActivityWarnings(warned, threshold, warnDay);
    if (finalWarned.length) await notifyActivityFinalWarning(finalWarned);
    await notifyActivitySuspensions(suspended, suspendDay);
    if (!testUserId) await setLastRun(pb, now);
  }

  const result = {
    warned: warned.length, finalWarned: finalWarned.length,
    suspended: suspended.length, skipped: skipped.length,
    threshold, warnDay, finalDay, suspendDay, dryRun,
    testUserId: testUserId || null,
    details: { warned, finalWarned, suspended, skipped },
  };

  console.log(`${label} done — warned:${warned.length} finalWarned:${finalWarned.length} suspended:${suspended.length} skipped:${skipped.length}`);

  if (!dryRun && !testUserId) {
    await notifyActivitySummary({ warned: warned.length, suspended: suspended.length, skipped: skipped.length, threshold, dryRun });
  }

  return result;
}

function scheduleActivityCheck() {
  function msUntil5amLocal() {
    const now = new Date();
    const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: brand.timezone }));
    const next5am = new Date(sydneyNow);
    next5am.setHours(5, 0, 0, 0);
    if (next5am <= sydneyNow) next5am.setDate(next5am.getDate() + 1);
    const offsetMs = now.getTime() - sydneyNow.getTime();
    return Math.max(next5am.getTime() + offsetMs - now.getTime(), 60 * 1000);
  }

  function scheduleNext() {
    const ms = msUntil5amLocal();
    scheduleActivityCheck._nextRun = new Date(Date.now() + ms).toISOString();
    console.log(`[activity] next run in ${(ms / 3600000).toFixed(1)}h (5am ${brand.timezone})`);
    setTimeout(async () => {
      scheduleActivityCheck._lastRun = new Date().toISOString();
      try { await runActivityCheck(); }
      catch (err) { console.error('[activity] scheduled run failed:', err.message); }
      scheduleNext();
    }, ms);
  }

  console.log(`[activity] scheduler registered — runs at 5am ${brand.timezone} time`);
  scheduleNext();
}

async function sendTestPing(userId) {
  const pb = await getAdminClient();
  const pilot = await pb.collection('users').getOne(userId, { requestKey: null });
  const name   = `${pilot.first_name} ${pilot.last_name}`;
  const mention = pilot.discord_id ? `<@${pilot.discord_id}>` : (pilot.discord_username ? `@${pilot.discord_username}` : name);

  const { DISCORD_WEBHOOK_ACTIVITY } = process.env;
  if (DISCORD_WEBHOOK_ACTIVITY) {
    await fetch(DISCORD_WEBHOOK_ACTIVITY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: mention,
        embeds: [{
          title: 'Activity Warning — Test Ping',
          color: brand.embedColor('accent'),
          description: `This is a **test** of the activity warning system. ${mention}, if this was real your account would be archived in 7 days for inactivity.`,
          fields: [
            { name: 'Pilot', value: `${name}${pilot.callsign ? ` (${pilot.callsign})` : ''}`, inline: true },
            { name: 'Discord ID', value: pilot.discord_id || 'not set', inline: true },
          ],
          footer: { text: brand.footer('Activity System TEST') },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  }

  return { name, mention, discord_id: pilot.discord_id || null };
}

module.exports = {
  activitySettings,
  runActivityCheck,
  scheduleActivityCheck,
  sendTestPing,
  assignRole,
  removeRole,
  resolveActivityWarning,
  WARNING_ROLE_ID: () => WARNING_ROLE_ID,
};
