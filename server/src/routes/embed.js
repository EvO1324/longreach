/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Website embeds: widgets a VA can put on its own website in an iframe
// (the pages are /embed/<widget> on the crew centre site). Each widget is off
// until an admin switches it on in Admin › Embeds, since they're public.

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
const KEY = 'embeds';
const WIDGETS = ['live', 'stats', 'leaderboard'];
const DEFAULTS = { live: false, stats: false, leaderboard: false };

async function load(pb) {
  const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  let saved = {};
  try { saved = r?.value ? JSON.parse(r.value) : {}; } catch { saved = {}; }
  const out = { ...DEFAULTS };
  for (const w of WIDGETS) if (typeof saved[w] === 'boolean') out[w] = saved[w];
  return out;
}

// a few seconds of caching so a busy website doesn't hammer the database
const cache = new Map();
async function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const shortName = u => `${u.first_name || ''} ${(u.last_name || '').charAt(0).toUpperCase()}${u.last_name ? '.' : ''}`.trim() || u.callsign || 'Pilot';

const data = {
  async live() {
    const { liveFlights } = require('./livemap');
    const r = await liveFlights();
    return {
      online: r.serverOnline !== false,
      flights: (r.flights || []).map(f => ({
        callsign: f.callsign, aircraft: f.aircraft, departure: f.departure, arrival: f.arrival,
        altitude: f.altitude, speed: f.speed, heading: f.heading, lat: f.lat, lng: f.lng,
      })),
    };
  },
  async stats(pb) {
    const [pilots, flights, routes, va] = await Promise.all([
      pb.collection('users').getList(1, 1, { filter: 'status = "approved"', fields: 'id', requestKey: null }),
      pb.collection('flights').getList(1, 1, { filter: 'status = "approved"', fields: 'id', requestKey: null }),
      pb.collection('routes').getList(1, 1, { filter: 'active = true', fields: 'id', requestKey: null }),
      pb.collection('va_stats').getFirstListItem('', { requestKey: null }).catch(() => null),
    ]);
    return {
      pilots: pilots.totalItems,
      flights: va?.total_flights || flights.totalItems,
      hours: Math.round(va?.total_hours || 0),
      distance_nm: Math.round(va?.total_distance_nm || 0),
      routes: routes.totalItems,
    };
  },
  // top 10 by hours: all time, or this month from approved PIREPs
  async leaderboard(pb, period) {
    if (period !== 'month') {
      const list = await pb.collection('users').getList(1, 10, { filter: 'status = "approved" && total_hours > 0', sort: '-total_hours', fields: 'first_name,last_name,callsign,total_hours', requestKey: null });
      return { period: 'all', pilots: list.items.map(u => ({ name: shortName(u), callsign: u.callsign || '', hours: Math.round((u.total_hours || 0) * 10) / 10 })) };
    }
    const from = new Date();
    from.setUTCDate(1);
    const flights = await pb.collection('flights').getFullList({
      filter: pb.filter('status = "approved" && date >= {:from}', { from: from.toISOString().slice(0, 10) }),
      fields: 'user,flight_time', requestKey: null,
    });
    const hours = {};
    for (const f of flights) hours[f.user] = (hours[f.user] || 0) + (f.flight_time || 0);
    const top = Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return { period: 'month', pilots: [] };
    const users = await pb.collection('users').getFullList({ filter: top.map(([id]) => pb.filter('id = {:id}', { id })).join(' || '), fields: 'id,first_name,last_name,callsign', requestKey: null });
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    return { period: 'month', pilots: top.filter(([id]) => byId[id]).map(([id, h]) => ({ name: shortName(byId[id]), callsign: byId[id].callsign || '', hours: Math.round(h * 10) / 10 })) };
  },
};

router.get('/config', requireAdmin, async (req, res) => {
  try {
    res.json({ widgets: await load(await getAdminClient()) });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load embed settings' });
  }
});

router.put('/config', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const next = await load(pb);
    for (const w of WIDGETS) if (typeof req.body?.[w] === 'boolean') next[w] = req.body[w];
    const value = JSON.stringify(next);
    const r = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
    if (r) await pb.collection('settings').update(r.id, { value });
    else await pb.collection('settings').create({ key: KEY, value });
    logAction(req.user, 'embeds.updated', { id: KEY, name: 'Website embeds' }, next);
    res.json({ widgets: next });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t save embed settings' });
  }
});

// Public: the data behind a widget, or 404 while it's switched off
router.get('/:widget', async (req, res) => {
  const w = req.params.widget;
  if (!WIDGETS.includes(w)) return res.status(404).json({ error: 'No such widget' });
  try {
    const pb = await getAdminClient();
    const on = await cached('config', 15000, () => load(pb));
    if (!on[w]) return res.status(404).json({ error: 'This widget is switched off' });
    const period = req.query.period === 'month' ? 'month' : 'all';
    const out = await cached(`${w}:${period}`, w === 'live' ? 15000 : 60000, () => data[w](pb, period));
    res.set('Cache-Control', 'public, max-age=15');
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load this widget' });
  }
});

module.exports = router;
module.exports.WIDGETS = WIDGETS;
