/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient, withAdminRetry, invalidateAdminCache } = require('../config/pocketbase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');

const { notifyUser, notifyAll } = require('./push');

const router = express.Router();

// Helpers

async function getLegs(pb, challengeId) {
  return pb.collection('challenge_legs').getFullList({
    filter: `challenge = "${escFilterValue(challengeId)}"`,
    sort: 'order',
    requestKey: null,
  });
}

async function deleteCompletionsForEntries(pb, entryIds) {
  if (!entryIds.length) return 0;
  const CHUNK = 50;
  let deleted = 0;
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const chunk = entryIds.slice(i, i + CHUNK);
    const filter = chunk.map(id => `entry = "${id}"`).join(' || ');
    const completions = await pb.collection('challenge_leg_completions').getFullList({
      filter, fields: 'id', requestKey: null,
    });
    await Promise.all(completions.map(c => pb.collection('challenge_leg_completions').delete(c.id)));
    deleted += completions.length;
  }
  return deleted;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function postChallengeToDiscord(challenge, legs, isReminder = false) {
  const CHANNEL_ID    = process.env.DISCORD_CHALLENGES_CHANNEL_ID;
  const BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN;
  const ROLE_ID       = process.env.DISCORD_CHALLENGES_ROLE_ID;

  if (!CHANNEL_ID || !BOT_TOKEN) {
    console.warn('[challenges] Discord env vars not set — skipping post');
    return;
  }

  let rewards = [];
  try { rewards = JSON.parse(challenge.rewards || '[]'); } catch {}
  const prizes = rewards.filter(r => r?.bonus_hours > 0);

  const legLines = legs.map((l, i) =>
    `> **Leg ${i + 1}** — \`${l.departure_icao}\` → \`${l.arrival_icao}\`${l.flight_number ? ` *(${l.flight_number})*` : ''}${l.multiplier && parseFloat(l.multiplier) > 1 ? ` ×${parseFloat(l.multiplier).toFixed(2)}` : ''}`
  ).join('\n');

  const prizeLines = prizes.length
    ? `\n🏆 **Prizes**\n${['1st', '2nd', '3rd'].slice(0, prizes.length).map((place, i) => `> ${place} — +${prizes[i].bonus_hours}h bonus`).join('\n')}\n`
    : '';

  const mention = ROLE_ID ? `<@&${ROLE_ID}>` : '@everyone';

  const content = isReminder
    ? [
        `# ✈️ Challenge starts tomorrow`,
        ``,
        `**${challenge.name}** goes live in **24 hours**.`,
        challenge.description ? `\n${challenge.description}\n` : '',
        `📅 **${fmtDate(challenge.start_date)} → ${fmtDate(challenge.end_date)}** · ${legs.length} leg${legs.length !== 1 ? 's' : ''}`,
        ``,
        legLines,
        prizeLines,
        `Enroll early at **${brand.frontendUrl}/challenges/${challenge.id}** — you can sign up before the start date.`,
        ``,
        mention,
      ].filter(l => l !== null).join('\n')
    : [
        `# ✈️ Challenge is live`,
        ``,
        `**${challenge.name}** has started!`,
        challenge.description ? `\n${challenge.description}\n` : '',
        `📅 **${fmtDate(challenge.start_date)} → ${fmtDate(challenge.end_date)}** · ${legs.length} leg${legs.length !== 1 ? 's' : ''}`,
        ``,
        legLines,
        prizeLines,
        `Enroll and file your first PIREP at **${brand.frontendUrl}/challenges/${challenge.id}**`,
        ``,
        mention,
      ].filter(l => l !== null).join('\n');

  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Discord API ${res.status}: ${JSON.stringify(err)}`);
  }
  console.log(`[challenges] Posted ${isReminder ? '24hr reminder' : 'launch'} to Discord`);
}

async function postCompletionToDiscord(challenge, user, placement, totalTime, durationDays) {
  const CHANNEL_ID = process.env.DISCORD_CHALLENGES_CHANNEL_ID;
  const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
  if (!CHANNEL_ID || !BOT_TOKEN) return;

  const placementEmoji = ['🥇', '🥈', '🥉'][placement - 1] || '✅';
  const placementText  = placement <= 3
    ? `${placementEmoji} **${['1st', '2nd', '3rd'][placement - 1]} place!**`
    : `${placementEmoji} Challenge complete!`;

  const discordTag = user.discord_id ? `<@${user.discord_id}>` : `**${user.first_name} ${user.last_name || ''}`.trim() + '**';

  const content = [
    `${placementText}`,
    ``,
    `${discordTag} just completed **${challenge.name}**`,
    `🕐 ${durationDays} day${durationDays !== 1 ? 's' : ''} · ✈️ ${totalTime.toFixed(1)}h logged`,
  ].join('\n');

  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn(`[challenges] completion Discord post failed: ${res.status} ${JSON.stringify(err)}`);
  } else {
    console.log(`[challenges] posted completion for ${user.first_name} — position ${placement}`);
  }
}

// GET /api/challenges
router.get('/', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const challenges = await pb.collection('challenges').getFullList({
      sort: '-start_date',
      requestKey: null,
    });
    res.json({ challenges });
  } catch (err) {
    console.error('[challenges/list]', err.message);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// GET /api/challenges/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const [challenge, legs] = await Promise.all([
      pb.collection('challenges').getOne(req.params.id, { requestKey: null }),
      getLegs(pb, req.params.id),
    ]);
    // Count all active entries (enrolled + active + completed) for display
    const enrolledCount = await pb.collection('challenge_entries').getList(1, 1, {
      filter: `challenge = "${escFilterValue(req.params.id)}"`,
      fields: 'id',
      requestKey: null,
    }).then(r => r.totalItems).catch(() => 0);
    res.json({ challenge, legs, enrolled_count: enrolledCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// GET /api/challenges/:id/leaderboard
router.get('/:id/leaderboard', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const entries = await pb.collection('challenge_entries').getFullList({
      filter: `challenge = "${escFilterValue(req.params.id)}" && (status = "completed" || status = "active" || status = "enrolled")`,
      sort: '-current_leg_index,completed_at',
      requestKey: null,
    });
    const userIds = [...new Set(entries.map(e => e.user).filter(Boolean))];
    const users = userIds.length ? await pb.collection('users').getFullList({
      filter: userIds.map(id => `id = "${id}"`).join(' || '),
      fields: 'id,first_name,last_name,callsign,rank',
      requestKey: null,
    }) : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    res.json({
      entries: entries.map((e, i) => ({
        ...e,
        expand: { user: userMap[e.user] || null },
        position: i + 1,
      })),
    });
  } catch (err) {
    console.error('[challenges/leaderboard]', err.message, err.status || '');
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/challenges/:id/my-entry
router.get('/:id/my-entry', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    let entry = null;
    try {
      entry = await pb.collection('challenge_entries').getFirstListItem(
        `challenge = "${req.params.id}" && user = "${req.user.id}"`,
        { requestKey: null }
      );
    } catch { /* not enrolled */ }

    if (!entry) return res.json({ entry: null, completions: [] });

    const completions = await pb.collection('challenge_leg_completions').getFullList({
      filter: `entry = "${escFilterValue(entry.id)}"`,
      sort: 'completed_at',
      requestKey: null,
    });

    res.json({ entry, completions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

// POST /api/challenges/:id/enroll
router.post('/:id/enroll', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const challenge = await pb.collection('challenges').getOne(req.params.id, { requestKey: null });

    if (challenge.status !== 'active') {
      return res.status(400).json({ error: 'Challenge is not active' });
    }

    try {
      await pb.collection('challenge_entries').getFirstListItem(
        `challenge = "${req.params.id}" && user = "${req.user.id}"`,
        { requestKey: null }
      );
      return res.status(400).json({ error: 'Already enrolled' });
    } catch { /* good, not enrolled yet */ }

    const entry = await pb.collection('challenge_entries').create({
      challenge:         req.params.id,
      user:              req.user.id,
      enrolled_at:       new Date().toISOString(),
      current_leg_index: 0,
      status:            'enrolled',
      total_flight_time: 0,
    });

    res.status(201).json({ entry });
  } catch (err) {
    console.error('[challenges/enroll]', err.message);
    res.status(500).json({ error: 'Failed to enroll' });
  }
});

// Admin routes

// POST /api/challenges
router.post('/', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { name, description, start_date, end_date, image_url } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date and end_date are required' });
    }
    const challenge = await pb.collection('challenges').create({
      name, description, start_date, end_date, status: 'draft', image_url: image_url || '',
    });
    logAction(req.user, 'challenge.created', { id: challenge.id, name: challenge.name }, {});
    res.status(201).json({ challenge });
  } catch (err) {
    console.error('[challenges/create]', err.message);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// PATCH /api/challenges/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const fields = ['name', 'description', 'start_date', 'end_date', 'status', 'rewards', 'image_url'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const challenge = await pb.collection('challenges').update(req.params.id, update);
    logAction(req.user, 'challenge.updated', { id: challenge.id, name: challenge.name }, { status: update.status });

    if (update.status === 'active') {
      const legs = await getLegs(pb, challenge.id);
      postChallengeToDiscord(challenge, legs, false)
        .catch(err => console.error('[challenges] discord post failed:', err.message));
      notifyAll({
        title: '✈️ New Challenge',
        body: `${challenge.name} is live — enroll now!`,
        url: `/challenges/${challenge.id}`,
        icon: brand.appIcon,
      }).catch(err => console.error('[challenges] push failed:', err.message));
    }

    res.json({ challenge });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const challenge = await pb.collection('challenges').getOne(req.params.id, { requestKey: null });
    console.log(`[challenges/delete] deleting ${req.params.id} (${challenge.name})`);

    // 1. Find all entries for this challenge
    const entries = await pb.collection('challenge_entries').getFullList({
      filter: `challenge = "${escFilterValue(req.params.id)}"`,
      fields: 'id',
      requestKey: null,
    });
    console.log(`[challenges/delete] found ${entries.length} entries`);

    await deleteCompletionsForEntries(pb, entries.map(e => e.id));
    console.log(`[challenges/delete] leg completions cleared`);

    // 3. Delete all entries
    await Promise.all(entries.map(e => pb.collection('challenge_entries').delete(e.id)));
    console.log(`[challenges/delete] entries cleared`);

    // 4. Delete all legs
    const legs = await pb.collection('challenge_legs').getFullList({
      filter: `challenge = "${escFilterValue(req.params.id)}"`,
      fields: 'id',
      requestKey: null,
    });
    await Promise.all(legs.map(l => pb.collection('challenge_legs').delete(l.id)));
    console.log(`[challenges/delete] legs cleared`);

    // 5. Delete the challenge itself
    await pb.collection('challenges').delete(req.params.id);
    console.log(`[challenges/delete] challenge deleted`);

    logAction(req.user, 'challenge.deleted', { id: req.params.id, name: challenge.name }, {
      entries_deleted: entries.length,
      legs_deleted: legs.length,
    });
    res.json({ message: 'Challenge and all related data deleted' });
  } catch (err) {
    console.error('[challenges/delete]', err.message, err.status || '', err.data || '');
    res.status(500).json({ error: 'Failed to delete challenge', detail: err.message });
  }
});

router.post('/:id/reset', requireAdmin, async (req, res) => {
  try {
    await withAdminRetry(async (pb) => {
      const challenge = await pb.collection('challenges').getOne(req.params.id, { requestKey: null });
      const entries = await pb.collection('challenge_entries').getFullList({
        filter: `challenge = "${escFilterValue(req.params.id)}"`,
        fields: 'id',
        requestKey: null,
      });
      await deleteCompletionsForEntries(pb, entries.map(e => e.id));
      await Promise.all(entries.map(e => pb.collection('challenge_entries').delete(e.id)));
      logAction(req.user, 'challenge.reset', { id: challenge.id, name: challenge.name }, {
        entries_wiped: entries.length,
      });
      res.json({ message: `Reset complete — ${entries.length} entries wiped`, entries_wiped: entries.length });
    });
  } catch (err) {
    console.error('[challenges/reset]', err.message, err.status || '');
    res.status(500).json({ error: 'Failed to reset challenge' });
  }
});

// POST /api/challenges/:id/legs
router.post('/:id/legs', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { order, departure_icao, arrival_icao, multiplier, aircraft_restriction, notes, route_id, flight_number, livery_id, livery_name } = req.body;
    const leg = await pb.collection('challenge_legs').create({
      challenge:            req.params.id,
      order:                order || 1,
      departure_icao:       (departure_icao || '').toUpperCase(),
      arrival_icao:         (arrival_icao || '').toUpperCase(),
      multiplier:           parseFloat(multiplier) || 1.0,
      aircraft_restriction: aircraft_restriction || '',
      notes:                notes || '',
      route_id:             route_id || '',
      flight_number:        flight_number || '',
      livery_id:            livery_id || '',
      livery_name:          livery_name || '',
    });
    res.status(201).json({ leg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create leg' });
  }
});

// PATCH /api/challenges/legs/:legId
router.patch('/legs/:legId', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { order, departure_icao, arrival_icao, multiplier, aircraft_restriction, notes, route_id, flight_number, livery_id, livery_name } = req.body;
    const update = {};
    if (order                !== undefined) update.order                = order;
    if (departure_icao       !== undefined) update.departure_icao       = departure_icao.toUpperCase();
    if (arrival_icao         !== undefined) update.arrival_icao         = arrival_icao.toUpperCase();
    if (multiplier           !== undefined) update.multiplier           = parseFloat(multiplier);
    if (aircraft_restriction !== undefined) update.aircraft_restriction = aircraft_restriction;
    if (notes                !== undefined) update.notes                = notes;
    if (route_id             !== undefined) update.route_id             = route_id;
    if (flight_number        !== undefined) update.flight_number        = flight_number;
    if (livery_id            !== undefined) update.livery_id            = livery_id;
    if (livery_name          !== undefined) update.livery_name          = livery_name;
    const leg = await pb.collection('challenge_legs').update(req.params.legId, update);
    res.json({ leg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update leg' });
  }
});

// DELETE /api/challenges/legs/:legId
router.delete('/legs/:legId', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    await pb.collection('challenge_legs').delete(req.params.legId);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete leg' });
  }
});

// GET /api/challenges/:id/admin-entries
router.get('/:id/admin-entries', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const entries = await pb.collection('challenge_entries').getFullList({
      filter: `challenge = "${escFilterValue(req.params.id)}"`,
      sort: '-enrolled_at',
      requestKey: null,
    });
    // Fetch user data separately to avoid expand permission issues
    const userIds = [...new Set(entries.map(e => e.user).filter(Boolean))];
    const users = userIds.length ? await pb.collection('users').getFullList({
      filter: userIds.map(id => `id = "${id}"`).join(' || '),
      fields: 'id,first_name,last_name,callsign,rank',
      requestKey: null,
    }) : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    res.json({ entries: entries.map(e => ({ ...e, expand: { user: userMap[e.user] || null } })) });
  } catch (err) {
    console.error('[challenges/admin-entries]', err.message, err.status || '');
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

async function matchChallengeOnApproval(pb, flight) {
  try {
    const legId = flight.challenge_leg_id;
    if (!legId) return;

    console.log(`[challenges] PIREP approved with challenge_leg_id=${legId}`);

    // Load the specific leg
    let leg;
    try {
      leg = await pb.collection('challenge_legs').getOne(legId, { requestKey: null });
    } catch {
      console.log(`[challenges] leg ${legId} not found — skipping`);
      return;
    }

    const challenge = await pb.collection('challenges').getOne(leg.challenge, { requestKey: null });

    // Block crediting if challenge hasn't started yet (starts at 06:00 UTC on start_date)
    if (challenge.start_date) {
      const startAt = new Date(`${challenge.start_date}T06:00:00Z`);
      if (new Date() < startAt) {
        console.log(`[challenges] challenge ${challenge.id} has not started yet (starts ${startAt.toISOString()}) — skipping credit`);
        return;
      }
    }

    // Find the pilot's active entry for this challenge
    let entry;
    try {
      entry = await pb.collection('challenge_entries').getFirstListItem(
        `challenge = "${leg.challenge}" && user = "${flight.user}" && (status = "enrolled" || status = "active")`,
        { requestKey: null }
      );
    } catch {
      console.log(`[challenges] no active entry for user ${flight.user} on challenge ${leg.challenge}`);
      return;
    }

    // Make sure this leg is actually the NEXT one for this pilot
    const legs = await pb.collection('challenge_legs').getFullList({
      filter: `challenge = "${escFilterValue(leg.challenge)}"`,
      sort: 'order',
      requestKey: null,
    });
    const expectedLeg = legs[entry.current_leg_index];
    if (!expectedLeg || expectedLeg.id !== legId) {
      console.log(`[challenges] leg ${legId} is not the next expected leg (index ${entry.current_leg_index}) — skipping`);
      return;
    }

    // Check if this leg was already completed (prevent double-credit)
    try {
      await pb.collection('challenge_leg_completions').getFirstListItem(
        `entry = "${entry.id}" && leg = "${legId}"`,
        { requestKey: null }
      );
      console.log(`[challenges] leg ${legId} already completed for entry ${entry.id} — skipping`);
      return;
    } catch { }

    const flightTime    = flight.flight_time || 0;
    const multiplier    = parseFloat(leg.multiplier) || 1.0;
    const hoursCredited = parseFloat((flightTime * multiplier).toFixed(4));
    const newLegIndex   = entry.current_leg_index + 1;
    const isComplete    = newLegIndex >= legs.length;
    const newTotalTime  = parseFloat(((entry.total_flight_time || 0) + flightTime).toFixed(4));

    // Record the completion
    await pb.collection('challenge_leg_completions').create({
      entry:          entry.id,
      leg:            legId,
      flight:         flight.id,
      completed_at:   new Date().toISOString(),
      flight_time:    flightTime,
      hours_credited: hoursCredited,
    });

    const bonusHours = parseFloat((hoursCredited - flightTime).toFixed(4));
    if (bonusHours > 0) {
      const user = await pb.collection('users').getOne(flight.user, { requestKey: null });
      const newTotal = parseFloat(((user.total_hours || 0) + bonusHours).toFixed(4));
      await pb.collection('users').update(flight.user, { total_hours: newTotal }, { requestKey: null });
      console.log(`[challenges] credited ${bonusHours}h bonus to ${flight.user} (×${multiplier} multiplier)`);
    }

    // Advance the entry
    await pb.collection('challenge_entries').update(entry.id, {
      current_leg_index: newLegIndex,
      total_flight_time: newTotalTime,
      status:            isComplete ? 'completed' : 'active',
      ...(isComplete && { completed_at: new Date().toISOString() }),
    });

    if (isComplete) {
      // Apply placement reward if in top 3
      let placement = null;
      let placementBonus = 0;
      try {
        const completedEntries = await pb.collection('challenge_entries').getFullList({
          filter: `challenge = "${escFilterValue(leg.challenge)}" && status = "completed"`,
          sort: 'completed_at',
          fields: 'id',
          requestKey: null,
        });
        const position = completedEntries.findIndex(e => e.id === entry.id); // 0-indexed
        placement = position + 1; // 1-indexed for display
        if (position >= 0 && position < 3 && challenge.rewards) {
          const rewardsList = JSON.parse(challenge.rewards || '[]');
          const reward = rewardsList[position];
          if (reward && reward.bonus_hours > 0) {
            placementBonus = reward.bonus_hours;
            const rewardUser = await pb.collection('users').getOne(flight.user, { requestKey: null });
            const newTotal = parseFloat(((rewardUser.total_hours || 0) + reward.bonus_hours).toFixed(4));
            await pb.collection('users').update(flight.user, { total_hours: newTotal }, { requestKey: null });
            console.log(`[challenges] placement reward: position ${position + 1}, +${reward.bonus_hours}h to ${flight.user}`);
            notifyUser(flight.user, {
              title: `🏆 ${['1st', '2nd', '3rd'][position]} Place — ${challenge.name}`,
              body: `You finished ${['first', 'second', 'third'][position]}! +${reward.bonus_hours} bonus hours credited.${reward.label ? ' ' + reward.label : ''}`,
              url: `/challenges/${challenge.id}`,
              icon: brand.appIcon,
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[challenges] reward error:', err.message);
      }

      // Store placement on entry for frontend display
      await pb.collection('challenge_entries').update(entry.id, {
        placement:             placement,
        placement_bonus_hours: placementBonus,
      }).catch(() => {});

      // Calculate duration
      const enrolledAt  = new Date(entry.enrolled_at);
      const completedAt = new Date();
      const durationDays = Math.ceil((completedAt - enrolledAt) / 86400000);

      notifyUser(flight.user, {
        title: '🏆 Challenge Complete!',
        body: `You completed ${challenge.name} in ${durationDays} day${durationDays !== 1 ? 's' : ''} with ${newTotalTime.toFixed(1)}h logged!`,
        url: `/challenges/${challenge.id}`,
        icon: brand.appIcon,
      }).catch(() => {});

      // Post to Discord challenges channel
      try {
        const completionUser = await pb.collection('users').getOne(flight.user, { requestKey: null });
        await postCompletionToDiscord(challenge, completionUser, placement, newTotalTime, durationDays);
      } catch (err) {
        console.error('[challenges] Discord completion post failed:', err.message);
      }

      console.log(`[challenges] user ${flight.user} completed "${challenge.name}" — position ${placement}, ${newTotalTime}h, ${durationDays} days`);
    } else {
      const next = legs[newLegIndex];
      notifyUser(flight.user, {
        title: `✅ Leg ${newLegIndex}/${legs.length} Complete — ${challenge.name}`,
        body: next
          ? `Next: ${next.departure_icao} → ${next.arrival_icao}${next.flight_number ? ' (' + next.flight_number + ')' : ''}`
          : 'Final leg done!',
        url: '/challenges',
        icon: brand.appIcon,
      }).catch(() => {});
      console.log(`[challenges] user ${flight.user} completed leg ${newLegIndex}/${legs.length} of "${challenge.name}"`);
    }
  } catch (err) {
    console.error('[challenges/match]', err.message);
  }
}

module.exports = { router, matchChallengeOnApproval, postChallengeToDiscord };
