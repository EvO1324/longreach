/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const crypto = require('crypto');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin } = require('../middleware/auth');
const { escFilterValue } = require('../utils/pbFilter');
const { logAction } = require('../utils/audit');
const brand = require('../config/brand');

const router = express.Router();
const MAX_ROWS = 20000;

// Value parsing

const text = v => (v == null ? '' : String(v).trim());
const icao = v => text(v).toUpperCase();

// Hours from "1:30", "01:30:00", "1h 30m", "1h30", "90m", "1.5", "1,5"
function hours(v) {
  const s = text(v).toLowerCase().replace(',', '.');
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(\d+)?\s*(?:m(?:in(?:utes?|s)?)?)?$/) // 2h, 1h 30m, 1h30
    || s.match(/^()(\d+)\s*m(?:in(?:utes?|s)?)?$/);                                        // 90m, 45 mins
  if (m && (m[1] || m[2])) return (m[1] ? +m[1] : 0) + (m[2] ? +m[2] / 60 : 0);
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  return null;
}
// Minutes, for a route's planned duration
function minutes(v) {
  const s = text(v).toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return +s; // a bare number is already minutes
  const h = hours(s);
  return h == null ? null : Math.round(h * 60);
}
// "YYYY-MM-DD" from ISO, "12/11/2026" (day first), "11 Nov 2026", Excel serials, Unix times
function date(v) {
  const s = text(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m; if (y.length === 2) y = `20${y}`;
    // day first unless that's impossible (13/01 vs 01/13)
    const [d, mo] = +a > 12 ? [a, b] : +b > 12 ? [b, a] : [a, b];
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + +s * 86400000).toISOString().slice(0, 10); // Excel
  if (/^\d{10}$/.test(s)) return new Date(+s * 1000).toISOString().slice(0, 10);
  if (/^\d{13}$/.test(s)) return new Date(+s).toISOString().slice(0, 10);
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  // the calendar date as written, not shifted by the server's time zone
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
const number = v => { const n = parseFloat(text(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };
const bool = (v, dflt = true) => { const s = text(v).toLowerCase(); if (!s) return dflt; return !['0', 'false', 'no', 'n', 'inactive', 'off'].includes(s); };
const list = v => (Array.isArray(v) ? v : text(v).split(/\s*[|;]\s*/)).map(text).filter(Boolean);
const STATUS = { approved: 'approved', accepted: 'approved', pending: 'pending', rejected: 'rejected', denied: 'rejected' };

const TYPES = {
  pilots: {
    fields: ['first_name', 'last_name', 'email', 'callsign', 'ifc_username', 'discord_username', 'role', 'joined'],
    required: ['first_name', 'email'],
    async prepare(pb) {
      const users = await pb.collection('users').getFullList({ fields: 'email,callsign', requestKey: null });
      return { emails: new Set(users.map(u => String(u.email).toLowerCase())), callsigns: new Set(users.map(u => u.callsign).filter(Boolean)) };
    },
    check(r, ctx) {
      const email = text(r.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Not a valid email' };
      if (!text(r.first_name)) return { error: 'First name missing' };
      if (ctx.emails.has(email)) return { skip: 'Already has an account' };
      let callsign = text(r.callsign);
      if (/^\d+$/.test(callsign)) callsign = brand.callsign.format(callsign);
      if (callsign && ctx.callsigns.has(callsign)) return { skip: `${callsign} is already taken` };
      ctx.emails.add(email); if (callsign) ctx.callsigns.add(callsign);
      const role = ['pilot', 'staff', 'admin'].includes(text(r.role).toLowerCase()) ? text(r.role).toLowerCase() : 'pilot';
      return { record: { email, callsign, role } };
    },
    async create(pb, r, prepared) {
      let callsign = prepared.callsign;
      for (let i = 0; !callsign && i < 50; i++) {
        const n = brand.callsign.min + Math.floor(Math.random() * (brand.callsign.max - brand.callsign.min + 1));
        const cs = brand.callsign.format(n);
        const taken = await pb.collection('users').getFirstListItem(`callsign = "${escFilterValue(cs)}"`, { requestKey: null }).catch(() => null);
        if (!taken) callsign = cs;
      }
      // a random password: they set their own with "Forgot password"
      const password = crypto.randomBytes(18).toString('base64url');
      await pb.collection('users').create({
        email: prepared.email, emailVisibility: false, password, passwordConfirm: password,
        first_name: text(r.first_name), last_name: text(r.last_name), callsign,
        ifc_username: text(r.ifc_username), discord_username: text(r.discord_username),
        role: prepared.role, status: 'approved', recruitment_status: 'approved',
        total_flights: 0, total_hours: 0, has_imported_history: true,
      });
    },
  },

  flights: {
    fields: ['pilot', 'departure', 'arrival', 'flight_time', 'date', 'flight_number', 'aircraft', 'registration', 'distance_nm', 'status', 'notes'],
    required: ['pilot', 'departure', 'arrival', 'flight_time'],
    async prepare(pb) {
      const users = await pb.collection('users').getFullList({ fields: 'id,email,callsign,ifc_username,first_name,last_name', requestKey: null });
      const by = new Map();
      const add = (k, u) => { if (k) by.set(String(k).trim().toLowerCase(), u.id); };
      for (const u of users) {
        add(u.email, u); add(u.callsign, u); add(u.ifc_username, u); add(`${u.first_name} ${u.last_name}`, u);
        const n = brand.callsign.number(u.callsign);
        if (n) { add(n, u); add(brand.callsign.short(n), u); }
      }
      return { pilots: by, seen: new Set() };
    },
    async check(r, ctx, pb) {
      const user = ctx.pilots.get(text(r.pilot).toLowerCase()) || ctx.pilots.get(String(brand.callsign.number(r.pilot) || '').toLowerCase());
      if (!user) return { error: `No pilot matches "${text(r.pilot)}"` };
      const dep = icao(r.departure), arr = icao(r.arrival);
      if (!/^[A-Z0-9]{3,4}$/.test(dep) || !/^[A-Z0-9]{3,4}$/.test(arr)) return { error: 'Departure and arrival must be airport codes' };
      const h = hours(r.flight_time);
      if (h == null || h <= 0 || h > 30) return { error: `Can't read the flight time "${text(r.flight_time)}"` };
      const d = text(r.date) ? date(r.date) : new Date().toISOString().slice(0, 10);
      if (!d) return { error: `Can't read the date "${text(r.date)}"` };
      const key = [user, d, dep, arr, text(r.flight_number)].join('|');
      if (ctx.seen.has(key)) return { skip: 'The same flight appears twice in the file' };
      ctx.seen.add(key);
      const dup = await pb.collection('flights').getFirstListItem(
        `user = "${user}" && date = "${d}" && departure_icao = "${dep}" && arrival_icao = "${arr}"`, { requestKey: null }).catch(() => null);
      if (dup) return { skip: 'Already in their logbook' };
      return { record: { user, dep, arr, h, d } };
    },
    async create(pb, r, p) {
      await pb.collection('flights').create({
        user: p.user, departure_icao: p.dep, arrival_icao: p.arr, date: p.d,
        flight_time: parseFloat(p.h.toFixed(4)),
        flight_number: text(r.flight_number), aircraft: text(r.aircraft), registration: text(r.registration),
        distance_nm: number(r.distance_nm), notes: text(r.notes) || 'Imported',
        status: STATUS[text(r.status).toLowerCase()] || 'approved',
      });
    },
  },

  routes: {
    fields: ['flight_number', 'departure', 'arrival', 'aircraft', 'distance_nm', 'duration', 'active'],
    required: ['departure', 'arrival'],
    async prepare(pb) {
      const routes = await pb.collection('routes').getFullList({ fields: 'flight_number,departure_icao,arrival_icao', requestKey: null });
      return { seen: new Set(routes.map(r => `${r.flight_number}|${r.departure_icao}|${r.arrival_icao}`)) };
    },
    check(r, ctx) {
      const dep = icao(r.departure), arr = icao(r.arrival);
      if (!/^[A-Z0-9]{3,4}$/.test(dep) || !/^[A-Z0-9]{3,4}$/.test(arr)) return { error: 'Departure and arrival must be airport codes' };
      const key = `${text(r.flight_number)}|${dep}|${arr}`;
      if (ctx.seen.has(key)) return { skip: 'Route already exists' };
      ctx.seen.add(key);
      return { record: { dep, arr } };
    },
    async create(pb, r, p) {
      const mins = minutes(r.duration);
      await pb.collection('routes').create({
        flight_number: text(r.flight_number), departure_icao: p.dep, arrival_icao: p.arr,
        aircraft: JSON.stringify(list(r.aircraft)), distance_nm: number(r.distance_nm),
        duration: mins == null ? '' : String(mins), active: bool(r.active),
      });
    },
  },

  fleet: {
    fields: ['name', 'icao_code', 'livery_name', 'aircraft_id', 'livery_id', 'image_url'],
    required: ['name'],
    async prepare(pb) {
      const fleet = await pb.collection('fleet').getFullList({ fields: 'name', requestKey: null });
      return { seen: new Set(fleet.map(f => f.name.toLowerCase())) };
    },
    check(r, ctx) {
      const name = text(r.name);
      if (!name) return { error: 'Name missing' };
      if (ctx.seen.has(name.toLowerCase())) return { skip: 'Already in the fleet' };
      ctx.seen.add(name.toLowerCase());
      return { record: {} };
    },
    async create(pb, r) {
      await pb.collection('fleet').create({
        name: text(r.name), icao_code: icao(r.icao_code), livery_name: text(r.livery_name),
        aircraft_id: text(r.aircraft_id), livery_id: text(r.livery_id), image_url: text(r.image_url),
      });
    },
  },
};

router.get('/', requireAdmin, (req, res) => {
  res.json({ types: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { fields: t.fields, required: t.required }])) });
});

// POST /api/import/:type
router.post('/:type', requireAdmin, async (req, res) => {
  const type = TYPES[req.params.type];
  if (!type) return res.status(404).json({ error: 'Unknown import type' });
  const rows = req.body?.rows;
  const dryRun = req.body?.dryRun !== false;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Nothing to import' });
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Up to ${MAX_ROWS.toLocaleString()} rows at a time` });

  try {
    const pb = await getAdminClient();
    const ctx = await type.prepare(pb);
    const out = [];
    const summary = { create: 0, skip: 0, error: 0 };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const missing = type.required.filter(f => !text(r[f]));
      let result = missing.length ? { error: `Missing ${missing.join(', ')}` } : await type.check(r, ctx, pb);
      if (result.record && !dryRun) {
        try { await type.create(pb, r, result.record); }
        catch (err) {
          const detail = err?.data?.data ? Object.entries(err.data.data).map(([k, v]) => `${k}: ${v.message}`).join(', ') : err.message;
          result = { error: `Couldn't save (${detail})` };
        }
      }
      const status = result.error ? 'error' : result.skip ? 'skip' : 'create';
      summary[status]++;
      if (status !== 'create' || out.length < 50) out.push({ row: i + 1, status, message: result.error || result.skip || '' });
    }

    if (!dryRun && summary.create) {
      logAction(req.user, `import.${req.params.type}`, null, { created: summary.create, skipped: summary.skip, failed: summary.error }).catch(() => {});
      if (req.params.type === 'flights') {
        // hours, flight counts, ranks and VA totals now include the imported flights
        const { runStatsAudit } = require('../services/statsAudit');
        await runStatsAudit({ dryRun: false, parts: ['pilots', 'va'] }).catch(err => console.warn('[import] stats recalculation:', err.message));
      }
    }
    res.json({ dryRun, summary, rows: out.filter(r => r.status !== 'create').slice(0, 500) });
  } catch (err) {
    console.error('[import]', err.message);
    res.status(500).json({ error: 'Import failed', detail: err.message });
  }
});

module.exports = router;
module.exports._parse = { hours, minutes, date }; // for tests
