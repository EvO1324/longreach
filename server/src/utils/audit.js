/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');

async function logAction(actor, action, target = null, details = null) {
  try {
    const pb = await getAdminClient();
    await pb.collection('audit_logs').create({
      action,
      actor_id:    actor?.id    || 'system',
      actor_name:  actor?.callsign
        ? `${actor.callsign}`
        : (actor?.email || 'system'),
      target_id:   target?.id   || '',
      target_name: target?.name || '',
      details:     details || {},
    });
  } catch (err) {
    console.warn('[audit] failed to log action:', action, err.message);
  }
}

function diffFields(before, update, fields = null) {
  const keys = fields || Object.keys(update || {});
  const norm = (v) => (v && typeof v === 'object') ? JSON.stringify(v) : v;
  const changes = {};
  keys.forEach((k) => {
    if (update[k] === undefined) return;
    const from = before ? before[k] : undefined;
    const to   = update[k];
    if (norm(from) === norm(to)) return;
    changes[k] = { from: from === undefined ? null : from, to: to === undefined ? null : to };
  });
  return changes;
}

module.exports = { logAction, diffFields };
