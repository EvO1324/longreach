/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAuth, requireAdmin, requireAuthOrApiKey, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { DEVELOPER_EMAILS } = require('../utils/developers');
const { logAction, diffFields } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');
const { lookupIfUserId } = require('./auth');

const { createDiscordInvite } = require('../utils/discordInvite');

const router = express.Router();

const LIVE_DISCORD_ROLE_ID = process.env.DISCORD_LIVE_ROLE_ID || null;

function safePilot(u) {
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    callsign: u.callsign,
    ifc_username: u.ifc_username,
    role: u.role,
    status: u.status,
    total_flights: u.total_flights,
    total_hours: u.total_hours,
    rank: u.rank,
    if_user_id: u.if_user_id,
    created: u.created,
    recruitment_status: u.recruitment_status || 'applied',
    exam_passed:        u.exam_passed  || false,
    exam_score:         u.exam_score   || 0,
    exam_attempts:      u.exam_attempts || 0,
    exam_token_created: u.exam_token_created || null,
    discord_invite_sent_at: u.discord_invite_sent_at || null,
    discord_invite_sent_at: u.discord_invite_sent_at || null,
    staff_role:             u.staff_role          || '',
    live_access:            u.live_access         || false,
    has_imported_history:   u.has_imported_history || false,
    career_active:        u.career_active        || false,
    career_aircraft:      u.career_aircraft      || '',
    career_hub:           u.career_hub           || '',
    career_current_icao:  u.career_current_icao  || '',
    career_started_at:    u.career_started_at    || null,
    career_total_flights: u.career_total_flights || 0,
    career_total_hours:   u.career_total_hours   || 0,
    admin_notes:          u.admin_notes          || '',
  };
}

// GET routes (specific before wildcard)

// Simple cache for pilots list
const _pilotsCache = new Map();
const getPilotsCache = (key) => { const e = _pilotsCache.get(key); if (!e || Date.now() > e.exp) { _pilotsCache.delete(key); return null; } return e.data; };
const setPilotsCache = (key, data, ttlMs) => _pilotsCache.set(key, { data, exp: Date.now() + ttlMs });
const invalidatePilotsCache = () => _pilotsCache.clear();

// GET /api/pilots GET /api/pilots/archived
router.get('/archived', requirePermission('pilots.edit'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const pilots = await pb.collection('users').getFullList({
      filter: 'status = "archived"',
      sort: '-updated',
      requestKey: null,
      fields: 'id,first_name,last_name,callsign,ifc_username,role,status,total_flights,total_hours,rank,created,admin_notes',
    });
    res.json({ pilots: pilots.map(safePilot), total: pilots.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch archived pilots' });
  }
});

router.get('/', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { sort = '-total_hours', search } = req.query;
    let filter = 'status = "approved"';

    if (!search) {
      const cacheKey = `pilots-${sort}`;
      const cached = getPilotsCache(cacheKey);
      if (cached) return res.json(cached);
      const pilots = await pb.collection('users').getFullList({
        filter, sort, requestKey: null,
        fields: 'id,first_name,last_name,callsign,ifc_username,role,status,total_flights,total_hours,rank,if_user_id,created,staff_role,has_imported_history,live_access',
      });
      const result = { pilots: pilots.map(safePilot), total: pilots.length };
      setPilotsCache(cacheKey, result, 60 * 1000);
      return res.json(result);
    }

    const s = search.replace(/"/g, '');
    filter += ` && (first_name ~ "${s}" || last_name ~ "${s}" || callsign ~ "${s}" || ifc_username ~ "${s}")`;
    const pilots = await pb.collection('users').getFullList({
      filter, sort, requestKey: null,
      fields: 'id,first_name,last_name,callsign,ifc_username,role,status,total_flights,total_hours,rank,if_user_id,created,staff_role,has_imported_history,live_access',
    });
    res.json({ pilots: pilots.map(safePilot), total: pilots.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pilots' });
  }
});

// GET /api/pilots/pending
router.get('/pending', requirePermission('recruitment.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const pilots = await pb.collection('users').getFullList({
      filter: 'status = "pending"',
      sort: 'created',
      requestKey: null,
    });
    res.json({ pilots: pilots.map(safePilot) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending pilots' });
  }
});

// GET /api/pilots/rejected
router.get('/rejected', requirePermission('recruitment.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const pilots = await pb.collection('users').getFullList({
      filter: 'status = "rejected"',
      sort: '-created',
      requestKey: null,
    });
    res.json({ pilots: pilots.map(safePilot) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rejected pilots' });
  }
});

// GET /api/pilots/recruitment
router.get('/recruitment', requirePermission('recruitment.view'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const all = await pb.collection('users').getFullList({
      sort: '-created',
      requestKey: null,
      fields: 'id,first_name,last_name,callsign,ifc_username,status,if_user_id,created,recruitment_status,exam_passed,exam_score,exam_attempts,exam_token_created,discord_invite_sent_at',
    });
    res.json({ pilots: all.map(safePilot) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recruitment data' });
  }
});

router.get('/:id/stats', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.params.id, { requestKey: null });
    if (user.status !== 'approved') return res.status(404).json({ error: 'Pilot not found' });

    const flights = await pb.collection('flights').getFullList({
      filter: `user = "${escFilterValue(req.params.id)}" && status = "approved"`,
      fields: 'id,departure_icao,arrival_icao,aircraft,registration,flight_time,distance_nm,date,flight_number',
      sort: '-date',
      requestKey: null,
    });

    if (!flights.length) {
      return res.json({ total_flights: 0, total_hours: 0, total_distance_nm: 0, avg_flight_time: 0, top_routes: [], top_airports: [], top_aircraft: [], by_month: [], recent_flights: [] });
    }

    const totalHours    = flights.reduce((s, f) => s + (f.flight_time || 0), 0);
    const totalDistance = flights.reduce((s, f) => s + (f.distance_nm  || 0), 0);

    // Top routes
    const routeMap = {};
    flights.forEach(f => {
      if (!f.departure_icao || !f.arrival_icao) return;
      const key = `${f.departure_icao}-${f.arrival_icao}`;
      if (!routeMap[key]) routeMap[key] = { dep: f.departure_icao, arr: f.arrival_icao, count: 0, hours: 0 };
      routeMap[key].count++;
      routeMap[key].hours += f.flight_time || 0;
    });
    const topRoutes = Object.values(routeMap).sort((a, b) => b.count - a.count).slice(0, 5)
      .map(r => ({ ...r, hours: parseFloat(r.hours.toFixed(2)) }));

    // Top airports
    const airportMap = {};
    flights.forEach(f => {
      [f.departure_icao, f.arrival_icao].forEach(icao => {
        if (!icao) return;
        if (!airportMap[icao]) airportMap[icao] = { icao, total: 0 };
        airportMap[icao].total++;
      });
    });
    const topAirports = Object.values(airportMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // Top aircraft
    const aircraftMap = {};
    flights.forEach(f => {
      if (!f.aircraft) return;
      const type = f.aircraft.split(' - ')[0].trim();
      if (!aircraftMap[type]) aircraftMap[type] = { type, count: 0, hours: 0 };
      aircraftMap[type].count++;
      aircraftMap[type].hours += f.flight_time || 0;
    });
    const topAircraft = Object.values(aircraftMap).sort((a, b) => b.hours - a.hours).slice(0, 5)
      .map(a => ({ ...a, hours: parseFloat(a.hours.toFixed(2)) }));

    // By month (last 12)
    const monthMap = {};
    flights.forEach(f => {
      const d   = new Date(f.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) {
        const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
        monthMap[key] = { label: `${mo} '${String(d.getFullYear()).slice(2)}`, flights: 0, hours: 0 };
      }
      monthMap[key].flights++;
      monthMap[key].hours += f.flight_time || 0;
    });
    const byMonth = Object.keys(monthMap).sort().slice(-12)
      .map(k => ({ ...monthMap[k], hours: parseFloat(monthMap[k].hours.toFixed(1)) }));

    // Recent flights (last 10, safe fields only)
    const recentFlights = flights.slice(0, 10).map(f => ({
      id: f.id,
      flight_number: f.flight_number,
      departure_icao: f.departure_icao,
      arrival_icao: f.arrival_icao,
      aircraft: f.aircraft,
      registration: f.registration || '',
      flight_time: f.flight_time,
      date: f.date,
    }));

    res.json({
      total_flights:     flights.length,
      total_hours:       parseFloat(totalHours.toFixed(2)),
      total_distance_nm: Math.round(totalDistance),
      avg_flight_time:   parseFloat((totalHours / flights.length).toFixed(2)),
      top_routes:        topRoutes,
      top_airports:      topAirports,
      top_aircraft:      topAircraft,
      by_month:          byMonth,
      recent_flights:    recentFlights,
    });
  } catch (err) {
    console.error('[pilots/:id/stats]', err);
    res.status(500).json({ error: 'Failed to fetch pilot stats' });
  }
});

router.get('/:id/email', requireAnyPermission('pilots.view_email', 'pilots.edit_email'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.params.id, { requestKey: null });
    logAction(req.user, 'pilot.email_viewed',
      { id: user.id, name: `${user.first_name} ${user.last_name} (${user.callsign})` }, {}
    ).catch(() => {});
    res.json({ email: user.email || '' });
  } catch (err) {
    res.status(404).json({ error: 'Pilot not found' });
  }
});

router.patch('/:id/email', requirePermission('pilots.edit_email'), async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    const pb = await getAdminClient();
    const target = await pb.collection('users').getOne(req.params.id, { requestKey: null }).catch(() => null);
    if (!target) return res.status(404).json({ error: 'Pilot not found' });

    const oldEmail = (target.email || '').toLowerCase();
    if (email === oldEmail) return res.json({ email });

    const requesterIsAdmin = req.user.role === 'admin' || DEVELOPER_EMAILS.includes(req.user.email);
    const targetIsProtected = target.role === 'admin' || DEVELOPER_EMAILS.includes(oldEmail);
    if (targetIsProtected && !requesterIsAdmin) {
      return res.status(403).json({ error: "Only an admin can change an admin's email" });
    }
    if (DEVELOPER_EMAILS.includes(email)) {
      return res.status(400).json({ error: "That email address can't be used" });
    }

    const taken = await pb.collection('users').getFirstListItem(
      `email = "${escFilterValue(email)}" && id != "${escFilterValue(target.id)}"`, { requestKey: null }
    ).catch(() => null);
    if (taken) return res.status(409).json({ error: 'Another account already uses that email' });

    await adminPatch(target.id, { email });
    logAction(req.user, 'pilot.email_changed',
      { id: target.id, name: `${target.first_name} ${target.last_name} (${target.callsign})` },
      { changes: { email: { from: oldEmail || null, to: email } } }
    ).catch(() => {});
    res.json({ email });
  } catch (err) {
    console.error('[pilots/email]', err?.message);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

router.get('/:id', requireAuthOrApiKey, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.params.id, { requestKey: null });
    if (user.status !== 'approved' && user.status !== 'archived' && req.user?.role !== 'admin') {
      return res.status(404).json({ error: 'Pilot not found' });
    }
    res.json({ pilot: safePilot(user) });
  } catch (err) {
    res.status(404).json({ error: 'Pilot not found' });
  }
});

// PATCH routes (specific before wildcard)

// PATCH /api/pilots/me
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { first_name, last_name, ifc_username } = req.body;
    if (!ifc_username || !ifc_username.trim()) {
      return res.status(400).json({ error: 'IFC Username is required' });
    }
    const pb = await getAdminClient();
    // Check ifc_username isn't already taken by someone else
    try {
      const existing = await pb.collection('users').getFirstListItem(
        `ifc_username = "${ifc_username.trim()}" && id != "${req.user.id}"`,
        { requestKey: null }
      );
      if (existing) return res.status(409).json({ error: 'This IFC username is already registered to another account' });
    } catch (e) {
      if (e?.status !== 404) throw e;
    }
    const updated = await pb.collection('users').update(req.user.id, {
      first_name, last_name, ifc_username: ifc_username.trim(),
    });
    res.json({ pilot: safePilot(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PATCH /api/pilots/:id/approve
router.patch('/:id/approve', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const approved = await adminPatch(req.params.id, { status: 'approved', recruitment_status: 'approved' });
    logAction(req.user, 'pilot.approved',
      { id: req.params.id, name: `${approved.first_name} ${approved.last_name} (${approved.callsign})` },
      { callsign: approved.callsign }
    ).catch(() => {});
    invalidatePilotsCache();
    res.json({ message: 'Pilot approved' });
  } catch (err) {
    console.error('[pilots/approve]', err?.message);
    res.status(500).json({ error: 'Failed to approve pilot', detail: err?.message });
  }
});

// PATCH /api/pilots/:id/reject
router.patch('/:id/reject', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const rejected = await adminPatch(req.params.id, { status: 'rejected', recruitment_status: 'rejected' });
    logAction(req.user, 'pilot.rejected',
      { id: req.params.id, name: `${rejected.first_name} ${rejected.last_name} (${rejected.callsign})` },
      {}
    ).catch(() => {});
    invalidatePilotsCache();
    res.json({ message: 'Pilot rejected' });
  } catch (err) {
    console.error('[pilots/reject]', err?.message);
    res.status(500).json({ error: 'Failed to reject pilot', detail: err?.message });
  }
});

// PATCH /api/pilots/:id/role
router.patch('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['pilot', 'beta_tester', 'staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const pb = await getAdminClient();
    const before = await pb.collection('users').getOne(req.params.id, { requestKey: null }).catch(() => null);
    const roleUser = await pb.collection('users').update(req.params.id, { role });
    logAction(req.user, 'pilot.role_changed',
      { id: req.params.id, name: `${roleUser.first_name} ${roleUser.last_name}` },
      { changes: { role: { from: before?.role || null, to: role } } }
    ).catch(() => {});
    res.json({ message: `Role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.patch('/:id', requirePermission('pilots.edit'), async (req, res) => {
  try {
    const allowed = ['first_name', 'last_name', 'ifc_username', 'role', 'status', 'total_flights', 'total_hours', 'rank', 'recruitment_status', 'staff_role', 'callsign', 'admin_notes', 'live_access'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Validate callsign format and uniqueness if being changed
    if (update.callsign) {
      const csNum = brand.callsign.number(update.callsign);
      if (!csNum || update.callsign !== brand.callsign.format(csNum)) {
        return res.status(400).json({ error: `Invalid callsign format. Must look like "${brand.callsign.format(brand.callsign.min)}".` });
      }
      const pb = await getAdminClient();
      try {
        const existing = await pb.collection('users').getFirstListItem(
          `callsign = "${update.callsign}" && id != "${req.params.id}"`, { requestKey: null }
        );
        if (existing) return res.status(409).json({ error: `Callsign ${update.callsign} is already taken by another pilot.` });
      } catch { /* not found = good */ }
    }

    const pbForDiff = await getAdminClient();
    const before = await pbForDiff.collection('users').getOne(req.params.id, { requestKey: null }).catch(() => null);

    console.log('[pilots/update]', req.params.id, JSON.stringify(update));
    const data = await adminPatch(req.params.id, update);
    console.log('[pilots/update] result staff_role:', data.staff_role);

    const { admin_notes: newNotesRaw, ...diffableUpdate } = update;
    const changes = diffFields(before, diffableUpdate);
    if (newNotesRaw !== undefined) {
      try {
        const beforeNotes = before?.admin_notes ? JSON.parse(before.admin_notes) : [];
        const afterNotes  = JSON.parse(newNotesRaw);
        if (afterNotes.length > beforeNotes.length) {
          const added = afterNotes[afterNotes.length - 1];
          changes.admin_notes = { from: `${beforeNotes.length} note${beforeNotes.length === 1 ? '' : 's'}`, to: `+ "${added.text}" — ${added.author}` };
        } else if (afterNotes.length < beforeNotes.length) {
          changes.admin_notes = { from: `${beforeNotes.length} notes`, to: `${afterNotes.length} notes (1 removed)` };
        }
      } catch { }
    }

    logAction(req.user, 'pilot.updated',
      { id: req.params.id, name: `${data.first_name} ${data.last_name}` },
      { changes }
    ).catch(() => {});

    // Update Discord nickname if callsign or name changed and pilot has a discord_id
    if ((update.callsign || update.first_name || update.last_name) && data.discord_id) {
      try {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId  = process.env.DISCORD_GUILD_ID;
        if (botToken && guildId) {
          const rawCallsign = data.callsign || '';
          const num         = brand.callsign.number(rawCallsign);
          const formatted   = num ? brand.callsign.short(num) : rawCallsign;
          const lastInitial = (data.last_name || '').charAt(0).toUpperCase();
          const nickname    = `${data.first_name} ${lastInitial} - ${formatted}`;
          await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${data.discord_id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: nickname }),
          });
        }
      } catch (e) {
        console.warn('[pilots/update] Discord nickname update failed:', e.message);
      }
    }

    if (update.live_access !== undefined && !!update.live_access !== !!before?.live_access && data.discord_id) {
      try {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId  = process.env.DISCORD_GUILD_ID;
        if (botToken && guildId && LIVE_DISCORD_ROLE_ID) {
          await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${data.discord_id}/roles/${LIVE_DISCORD_ROLE_ID}`, {
            method: data.live_access ? 'PUT' : 'DELETE',
            headers: { 'Authorization': `Bot ${botToken}` },
          });
          console.log(`[pilots/update] Discord Live role ${data.live_access ? 'added to' : 'removed from'} ${data.discord_id}`);
        }
      } catch (e) {
        console.warn('[pilots/update] Discord Live role sync failed:', e.message);
      }
    }

    invalidatePilotsCache();
    res.json({ pilot: safePilot(data) });
  } catch (err) {
    console.error('[pilots/update]', err?.message);
    res.status(500).json({ error: 'Failed to update pilot', detail: err?.message });
  }
});

router.post('/me/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const pb = await getAdminClient();

    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });

    const PocketBase = require('pocketbase/cjs');
    const freshPb = new PocketBase(process.env.POCKETBASE_URL || 'http://127.0.0.1:8090');
    freshPb.autoCancellation(false); // see newPb in config/pocketbase.js
    try {
      await freshPb.collection('users').authWithPassword(user.email, current_password);
    } catch {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password via adminPatch so collection rules don't block it
    await adminPatch(req.user.id, {
      password:             new_password,
      passwordConfirm:      new_password,
      must_change_password: false,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('[pilots/change-password]', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const words  = ['Alpha','Bravo','Foxtrot','Delta','Sierra','Tango','Victor','Zulu','Oscar','Lima'];
    const word   = words[Math.floor(Math.random() * words.length)];
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const tempPassword = `${word}${digits}!`;

    await adminPatch(req.params.id, {
      password:             tempPassword,
      passwordConfirm:      tempPassword,
      must_change_password: true,
    });

    console.log(`[pilots/reset-password] Admin ${req.user.id} reset password for pilot ${req.params.id}`);
    const resetUser = await pb.collection('users').getOne(req.params.id, { requestKey: null, fields: 'id,first_name,last_name,callsign' }).catch(() => null);
    logAction(req.user, 'pilot.password_reset',
      { id: req.params.id, name: resetUser ? `${resetUser.first_name} ${resetUser.last_name}` : req.params.id },
      {}
    ).catch(() => {});
    res.json({ temp_password: tempPassword });
  } catch (err) {
    console.error('[pilots/reset-password]', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

async function deletePilotFully(pb, id) {
  const pilot = await pb.collection('users').getOne(id, { requestKey: null }).catch(() => null);
  if (!pilot) return null;

  const name = `${pilot.first_name} ${pilot.last_name}`;

  const deleteAll = async (collection, filter) => {
    try {
      const records = await pb.collection(collection).getFullList({ filter, fields: 'id', requestKey: null });
      await Promise.allSettled(records.map(r => pb.collection(collection).delete(r.id)));
    } catch (e) {
      console.warn(`[deletePilotFully] deleteAll(${collection}) failed:`, e.message);
    }
  };

  await Promise.allSettled([
    deleteAll('flights',              `user = "${id}"`),
    deleteAll('leave_requests',       `user = "${id}"`),
    deleteAll('push_subscriptions',   `user = "${id}"`),
    deleteAll('challenge_progress',   `user = "${id}"`),
    deleteAll('challenge_entries',    `user = "${id}"`),   // field is 'user' not 'pilot'
    deleteAll('audit_logs',           `actor_id = "${id}"`), // field is 'actor_id' not 'actor'
    deleteAll('promo_uses',           `user = "${id}"`),
    deleteAll('if_live_tokens',       `user = "${id}"`),
    deleteAll('password_reset_tokens',`user = "${id}"`),
    deleteAll('route_requests',       `submitted_by = "${id}"`),
  ]);

  await pb.collection('users').delete(id).catch((e) => {
    const reason = e?.data?.data ? JSON.stringify(e.data.data) : e.message;
    throw new Error(`users.delete failed: ${reason}`);
  });
  return name;
}

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const id = req.params.id;

    const name = await deletePilotFully(pb, id);
    if (name === null) return res.json({ success: true, already_deleted: true });

    logAction(req.user, 'pilot.deleted', { id, name }, {}).catch(() => {});
    console.log(`[pilots/delete] Admin ${req.user.id} deleted pilot ${id} (${name})`);
    invalidatePilotsCache();
    res.json({ success: true });
  } catch (err) {
    console.error('[pilots/delete]', err.message, err.status || '', err.data || '');
    res.status(500).json({ error: 'Failed to delete pilot', detail: err.message });
  }
});

router.post('/:id/unsuspend', requireAdmin, async (req, res) => {
  try {
    const pb    = await getAdminClient();
    const pilot = await pb.collection('users').getOne(req.params.id, { requestKey: null });

    if (pilot.status !== 'archived') {
      return res.status(400).json({ error: 'Pilot is not archived' });
    }

    // Restore account
    await pb.collection('users').update(req.params.id, {
      status: 'approved',
      activity_warned_at: null,
      suspended_roles: null,
    });

    // Restore Discord roles
    const botToken  = process.env.DISCORD_BOT_TOKEN;
    const guildId   = process.env.DISCORD_GUILD_ID;
    const suspRoleId = process.env.DISCORD_SUSPENDED_ROLE_ID;
    const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;

    if (botToken && guildId && pilot.discord_id) {
      // Remove suspended role
      if (suspRoleId) {
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${pilot.discord_id}/roles/${suspRoleId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bot ${botToken}` },
        });
      }
      // Restore saved roles if available
      let rolesToRestore = [];
      try { rolesToRestore = JSON.parse(pilot.suspended_roles || '[]'); } catch {}
      if (verifiedRoleId && !rolesToRestore.includes(verifiedRoleId)) rolesToRestore.push(verifiedRoleId);
      for (const roleId of rolesToRestore) {
        if (roleId === suspRoleId) continue; // don't re-add suspended role
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${pilot.discord_id}/roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        });
      }
    }

    logAction(req.user, 'pilot.unarchived', { id: req.params.id, name: `${pilot.first_name} ${pilot.last_name}` }, {}).catch(() => {});
    console.log(`[pilots/unsuspend] ${req.user.callsign} restored ${pilot.first_name} ${pilot.last_name} from archived`);
    res.json({ success: true });
  } catch (err) {
    console.error('[pilots/unsuspend]', err.message);
    res.status(500).json({ error: 'Failed to unsuspend pilot' });
  }
});

router.post('/discord-invite', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const invite_url = await createDiscordInvite(req.body?.pilotId || null);
    res.json({ invite_url });
  } catch (err) {
    console.error('[pilots/discord-invite]', err.message);
    const status = err.message === 'Bot token not configured' ? 503 : 500;
    res.status(status).json({ error: err.message === 'Bot token not configured' ? err.message : 'Failed to generate invite', detail: err.message });
  }
});

router.post('/:id/refresh-if-link', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const pilot = await pb.collection('users').getOne(req.params.id, { requestKey: null });

    if (!pilot.ifc_username) {
      return res.status(400).json({ error: 'This pilot has no IFC username set.' });
    }

    const ifUserId = await lookupIfUserId(pilot.ifc_username);
    if (!ifUserId) {
      return res.status(404).json({ error: `No Infinite Flight account found for "${pilot.ifc_username}".` });
    }

    await adminPatch(pilot.id, { if_user_id: ifUserId });
    logAction(req.user, 'pilot.if_link_refreshed',
      { id: pilot.id, name: `${pilot.first_name} ${pilot.last_name} (${pilot.callsign})` },
      { ifc_username: pilot.ifc_username, if_user_id: ifUserId }
    ).catch(() => {});

    res.json({ success: true, if_user_id: ifUserId });
  } catch (err) {
    console.error('[pilots/refresh-if-link]', err.message);
    res.status(500).json({ error: 'Failed to refresh IF link' });
  }
});

module.exports = router;
module.exports.invalidatePilotsCache = invalidatePilotsCache;
module.exports.deletePilotFully = deletePilotFully;
