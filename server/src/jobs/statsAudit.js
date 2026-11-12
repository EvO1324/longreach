/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { runStatsAudit } = require('../services/statsAudit');
const brand = require('../config/brand');

const fmtH = h => `${(h || 0).toFixed(1)}h`;
const fixMode = () => process.env.STATS_AUDIT_MODE === 'fix';

async function postSummary(result) {
  const url = process.env.DISCORD_WEBHOOK_ADMIN;
  const pilots = result.pilots?.fixed || [];
  const vaChanges = Object.keys(result.va?.changes || {});
  const days = result.daily?.fixed || [];
  const ranks = result.pilots?.ranksFixed || [];
  const found = pilots.length || ranks.length || vaChanges.length || days.length;
  if (!url || (result.dryRun ? false : !found)) return;
  const verb = result.dryRun ? 'to fix' : 'corrected';

  const lines = pilots.slice(0, 15).map(p => {
    const parts = [];
    if (p.flights[0] !== p.flights[1]) parts.push(`${p.flights[0]} → ${p.flights[1]} flights`);
    if (Math.abs(p.hours[0] - p.hours[1]) > 0.01) parts.push(`${fmtH(p.hours[0])} → ${fmtH(p.hours[1])}`);
    return `• **${p.name}**${p.callsign ? ` (${p.callsign})` : ''}: ${parts.join(', ')}`;
  });
  if (pilots.length > 15) lines.push(`…and ${pilots.length - 15} more`);

  const fields = [];
  if (pilots.length) fields.push({ name: `Pilots ${verb} (${pilots.length})`, value: lines.join('\n').slice(0, 1024) });
  if (ranks.length) fields.push({ name: `Ranks ${verb} (${ranks.length})`, value: ranks.slice(0, 15).map(r => `• **${r.name}**: ${r.rank[0]} → ${r.rank[1]}`).join('\n').slice(0, 1024) });
  if (vaChanges.length) fields.push({ name: `VA totals ${verb}`, value: vaChanges.map(k => `${k.replace(/_/g, ' ')}: ${result.va.changes[k][0]} → ${result.va.changes[k][1]}`).join('\n').slice(0, 1024) });
  if (days.length) fields.push({ name: `Daily stats ${verb}`, value: `${days.length} day(s): ${days.slice(0, 8).map(d => d.date).join(', ')}${days.length > 8 ? ', …' : ''}` });

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [{
        title: result.dryRun ? 'Nightly stats check (report only)' : 'Nightly stats check',
        description: !found
          ? `Checked ${result.pilots?.checked ?? 0} pilots and ${result.flights} flights. Everything matches the flight records.`
          : result.dryRun
            ? `Checked ${result.pilots?.checked ?? 0} pilots and ${result.flights} flights. These have drifted from their flight records. Nothing was changed. Recalculate VA Stats in Alex Panel fixes pilots and VA totals now; STATS_AUDIT_MODE=fix lets this job fix everything nightly.`
            : `Checked ${result.pilots?.checked ?? 0} pilots and ${result.flights} flights. These had drifted from their flight records and have been fixed.`,
        color: brand.embedColor('accent'),
        fields,
        footer: { text: brand.footer('stats audit') },
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(err => console.error('[stats-audit] summary post failed:', err.message));
}

async function runScheduledStatsAudit() {
  const result = await runStatsAudit({ dryRun: !fixMode() });
  console.log(`[stats-audit] ${result.dryRun ? 'report' : 'fix'} mode, done in ${result.ms}ms: ${result.pilots.fixed.length} pilot(s), ${result.pilots.ranksFixed.length} rank(s), ${Object.keys(result.va.changes).length} VA total(s), ${result.daily.fixed.length} day(s) ${result.dryRun ? 'would be fixed' : 'fixed'}`);
  await postSummary(result);
  return result;
}

function scheduleStatsAudit() {
  function msUntil430amSydney() {
    const now = new Date();
    const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: brand.timezone }));
    const next = new Date(sydneyNow);
    next.setHours(4, 30, 0, 0);
    if (next <= sydneyNow) next.setDate(next.getDate() + 1);
    const offsetMs = now.getTime() - sydneyNow.getTime();
    return Math.max(next.getTime() + offsetMs - now.getTime(), 60 * 1000);
  }

  function scheduleNext() {
    const ms = msUntil430amSydney();
    scheduleStatsAudit._nextRun = new Date(Date.now() + ms).toISOString();
    console.log(`[stats-audit] next run in ${(ms / 3600000).toFixed(1)}h (4:30am Sydney)`);
    setTimeout(async () => {
      scheduleStatsAudit._lastRun = new Date().toISOString();
      try { await runScheduledStatsAudit(); }
      catch (err) { console.error('[stats-audit] scheduled run failed:', err.message); }
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}

module.exports = { scheduleStatsAudit, runScheduledStatsAudit, postSummary };
