/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Partner VAs (the "partners" plugin, in testing). Two Longreach crew centres
// link up and share their routes and flights with each other.
//
// Linking:
//   1. VA A makes an invite in Admin › Partners. It's a code holding A's API
//      address, name and a token A made for this partner.
//   2. VA B pastes the code. B saves A, then calls A's /api/partners/link with
//      that token and a token B made, so each side holds the other's.
//   3. From then on each calls the other's /api/partners/data with the token
//      it was given. Each side decides what it shares with each partner.

const crypto = require('crypto');
const brand = require('../config/brand');

const SHARE_DEFAULTS = { routes: true, flights: true };
const TIMEOUT_MS = 8000;

const newToken = () => crypto.randomBytes(24).toString('base64url');

// Our own API address, as partners should call it
const ourUrl = () => String(process.env.PUBLIC_API_URL || brand.apiUrl || '').replace(/\/+$/, '').replace(/\/api$/, '');

function ourLogo() {
  const logo = brand.logos?.light || '';
  if (!logo || /^https?:/.test(logo)) return logo;
  return `${String(brand.frontendUrl || '').replace(/\/+$/, '')}/${logo.replace(/^\//, '')}`;
}

// https only, except a local crew centre while testing
function cleanUrl(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\/api$/, '')}`;
}

function makeInvite({ url, name, token }) {
  return Buffer.from(JSON.stringify({ v: 1, url, name, token })).toString('base64url');
}

function readInvite(code) {
  let d;
  try { d = JSON.parse(Buffer.from(String(code || '').trim(), 'base64url').toString('utf8')); } catch { return { error: 'That code isn\'t a partner invite' }; }
  const url = cleanUrl(d?.url);
  if (d?.v !== 1 || !url || typeof d.token !== 'string' || d.token.length < 20) return { error: 'That code isn\'t a partner invite' };
  return { url, name: String(d.name || 'Partner VA').slice(0, 80), token: d.token };
}

function readShare(v) {
  let s = v;
  if (typeof v === 'string') { try { s = JSON.parse(v); } catch { s = {}; } }
  return {
    routes: typeof s?.routes === 'boolean' ? s.routes : SHARE_DEFAULTS.routes,
    flights: typeof s?.flights === 'boolean' ? s.flights : SHARE_DEFAULTS.flights,
  };
}

// What a partner sees about us. Callsigns only, no pilot names.
async function ourData(pb, share, { liveFlights } = {}) {
  const out = { name: brand.name, logo: ourLogo(), url: brand.frontendUrl || '', shares: share };
  if (share.routes) {
    const routes = await pb.collection('routes').getList(1, 1000, { filter: 'active = true', sort: 'flight_number', fields: 'flight_number,departure_icao,arrival_icao,aircraft,distance_nm,duration', requestKey: null });
    out.routes = routes.items.map(r => ({ flight_number: r.flight_number, from: r.departure_icao, to: r.arrival_icao, aircraft: r.aircraft || '', distance_nm: r.distance_nm || null, duration: r.duration || '' }));
  }
  if (share.flights) {
    const recent = await pb.collection('flights').getList(1, 15, { filter: 'status = "approved"', sort: '-date,-created', expand: 'user', fields: 'departure_icao,arrival_icao,aircraft,flight_time,date,expand.user.callsign', requestKey: null });
    out.recent = recent.items.map(f => ({ callsign: f.expand?.user?.callsign || '', from: f.departure_icao, to: f.arrival_icao, aircraft: f.aircraft || '', hours: Math.round((f.flight_time || 0) * 10) / 10, date: f.date }));
    try {
      const live = liveFlights ? await liveFlights() : { flights: [] };
      out.live = (live.flights || []).map(f => ({ callsign: f.callsign, from: f.departure, to: f.arrival, aircraft: f.aircraft, altitude: f.altitude, speed: f.speed }));
    } catch { out.live = []; }
  }
  return out;
}

// Calls a partner's API with the token they gave us
async function call(partner, method, path, body) {
  const res = await fetch(`${partner.url}/api/partners${path}`, {
    method,
    headers: { Authorization: `Partner ${partner.their_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'longreach-partners' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || `${partner.name || 'The partner'} answered ${res.status}`);
  return data;
}

module.exports = { SHARE_DEFAULTS, newToken, ourUrl, ourLogo, cleanUrl, makeInvite, readInvite, readShare, ourData, call };
