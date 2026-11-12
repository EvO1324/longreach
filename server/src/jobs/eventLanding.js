/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { eventLive, inWindow } = require('../services/eventLive');

const EVERY_MS = 2 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const pbDate = ms => new Date(ms).toISOString().replace('T', ' ');

async function runEventLanding() {
  const pb = await getAdminClient();
  const now = Date.now();
  const candidates = await pb.collection('events').getFullList({
    filter: `status = "published" && start_at <= "${pbDate(now + 2 * HOUR)}" && start_at >= "${pbDate(now - 48 * HOUR)}"`,
    fields: 'id,title,status,start_at,end_at', requestKey: null,
  });
  for (const ev of candidates.filter(e => inWindow(e, now))) {
    await eventLive(ev.id).catch(err => console.warn(`[event-landing] ${ev.title}: ${err.message}`));
  }
}

function scheduleEventLanding() {
  const tick = async () => {
    scheduleEventLanding._lastRun = new Date().toISOString();
    try { await runEventLanding(); }
    catch (err) { console.error('[event-landing] run failed:', err.message); }
    scheduleEventLanding._nextRun = new Date(Date.now() + EVERY_MS).toISOString();
  };
  scheduleEventLanding._nextRun = new Date(Date.now() + EVERY_MS).toISOString();
  setInterval(tick, EVERY_MS).unref();
}

module.exports = { scheduleEventLanding, runEventLanding };
