/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAuth, requireAdmin, requireStaff, requireLiveAccess, requirePermission } = require('../middleware/auth');
const { distanceBetween, nearestAirport, lookupAirport } = require('../utils/airports');
const liveAircraftAdmin = require('../services/liveAircraftAdmin');
const { notifyUser } = require('./push');
const { notifyPirepFiled, notifyAircraftLanded, notifyBookingCreated, notifyBookingNeedsStaff, notifyEarlyRelease } = require('./discord');
const { matchChallengeOnApproval } = require('./challenges');
const { tryAutoApprove, updateUserStats, updateVaStats, checkRankUp } = require('./flights');
const { buildLoginResponse, createLoginExchangeCode, ACCOUNT_STATUS_MESSAGES } = require('./auth');
const { resolveActivityWarning } = require('../jobs/activityCheck');
const dailyStats = require('../utils/dailyStats');
const { tagDevelopers, getDeveloperIds } = require('../utils/developers');

const router = express.Router();

const AUTH_BASE   = 'https://api.infiniteflight.com/auth/v2';
const API_BASE    = 'https://api.infiniteflight.com/public/v3';
const CLIENT_ID     = process.env.IF_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.IF_OAUTH_CLIENT_SECRET;
const REDIRECT_URI  = process.env.IF_OAUTH_REDIRECT_URI;
const FRONTEND_URL  = brand.frontendUrl;

const ALLOWED_ORG_IDS = (process.env.IF_LIVE_ORG_ID || '').split(',').map(s => s.trim()).filter(Boolean);

function isAllowedOrg(orgId) {
  if (ALLOWED_ORG_IDS.length === 0) return true;
  return ALLOWED_ORG_IDS.includes(orgId);
}

const pendingAuth = new Map(); // state -> { userId, codeVerifier, expires }
const PENDING_TTL = 10 * 60 * 1000;

function cleanupPending() {
  const now = Date.now();
  for (const [state, entry] of pendingAuth) {
    if (now > entry.expires) pendingAuth.delete(state);
  }
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Token helpers

const { escFilterValue } = require('../utils/pbFilter');
const { lookupLivery } = require('../utils/ifLiveryLookup');

async function getTokenRecord(userId) {
  const pb = await getAdminClient();
  try {
    return await pb.collection('if_live_tokens').getFirstListItem(`user = "${escFilterValue(userId)}"`, { requestKey: null });
  } catch {
    return null;
  }
}

async function saveTokenRecord(userId, tokens, ifUsername) {
  if (!tokenMemo.get(userId)?.pending) tokenMemo.delete(userId);
  const pb = await getAdminClient();
  const data = {
    user:          userId,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    ...(ifUsername ? { if_username: ifUsername } : {}),
  };
  const existing = await getTokenRecord(userId);
  if (existing) return pb.collection('if_live_tokens').update(existing.id, data);
  return pb.collection('if_live_tokens').create(data);
}

async function refreshTokens(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchIfIdentity(tokens) {
  if (tokens.id_token) {
    const claims = decodeJwtPayload(tokens.id_token);
    if (claims?.sub) {
      return {
        if_user_id: claims.sub,
        if_username: claims.preferred_username || claims.username || claims.name || null,
      };
    }
    console.warn('[if-live] id_token present but no usable sub claim. Keys found:', claims ? Object.keys(claims) : 'null (decode failed)');
  } else {
    console.warn('[if-live] token response had no id_token. Keys present:', Object.keys(tokens));
  }

  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      const user = data.result || data; // some IF endpoints wrap responses in { result: ... }
      const if_user_id = user.userId || user.id || user.sub || null;
      if (if_user_id) {
        return {
          if_user_id,
          if_username: user.discourseUsername || user.username || user.name || null,
        };
      }
      console.warn('[if-live] /users/me responded OK but no usable id field. Keys found:', Object.keys(user));
    } else {
      console.warn(`[if-live] /users/me fallback returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[if-live] /users/me fallback threw:', err.message);
  }

  throw new Error('Could not determine your Infinite Flight identity. Please try again or contact a staff member.');
}

const TOKEN_MEMO_MS = 5 * 60 * 1000;
const tokenMemo = new Map(); // userId -> { token, expiresAt, readUntil } | { pending }

async function getValidAccessToken(userId) {
  const memo = tokenMemo.get(userId);
  if (memo?.pending) return memo.pending;
  if (memo && Date.now() < memo.readUntil && Date.now() < memo.expiresAt - 60 * 1000) return memo.token;

  const pending = (async () => {
    const record = await getTokenRecord(userId);
    if (!record) throw new Error('Not connected to Infinite Flight Live yet');

    let token = record.access_token;
    let expiresAt = new Date(record.expires_at).getTime();
    if (Date.now() >= expiresAt - 60 * 1000) { // not good for another 60s
      if (!record.refresh_token) throw new Error('Token expired and no refresh token available — reconnect required');
      const fresh = await refreshTokens(record.refresh_token);
      await saveTokenRecord(userId, fresh);
      token = fresh.access_token;
      expiresAt = Date.now() + fresh.expires_in * 1000;
    }
    tokenMemo.set(userId, { token, expiresAt, readUntil: Date.now() + TOKEN_MEMO_MS });
    return token;
  })();
  tokenMemo.set(userId, { pending });
  try {
    return await pending;
  } catch (err) {
    tokenMemo.delete(userId);
    throw err;
  }
}

const readCache = new Map(); // key -> { data, expires }
const CACHE_TTL = 20 * 1000;

async function cached(key, fn) {
  const hit = readCache.get(key);
  if (hit && Date.now() < hit.expires) return hit.data;
  const data = await fn();
  readCache.set(key, { data, expires: Date.now() + CACHE_TTL });
  return data;
}

function invalidateAircraftSchedulesCache(aircraftId) {
  readCache.delete(`schedules:${aircraftId}`);
}

async function cachedTtl(key, fn, ttlMs) {
  const hit = readCache.get(key);
  if (hit && Date.now() < hit.expires) return hit.data;
  const data = await fn();
  readCache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

const aircraftStatusCache = new Map(); // aircraftId -> { state, altitude, speed, updatedAt }

function setAircraftStatus(aircraftId, position) {
  aircraftStatusCache.set(aircraftId, {
    state:     position?.state ?? null,
    altitude:  position?.altitude ?? null,
    speed:     position?.speed ?? null,
    updatedAt: new Date().toISOString(),
  });
}

function getAircraftStatus(aircraftId) {
  return aircraftStatusCache.get(aircraftId) || null;
}

function clearAircraftStatus(aircraftId) {
  aircraftStatusCache.delete(aircraftId);
}

async function ifLiveRequest(userId, path) {
  const token = await getValidAccessToken(userId);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const err = new Error('Infinite Flight is rate-limiting this app right now (testing-mode cap is 20 requests/min, shared across all testers). Wait a minute and try again.');
    err.status = 429;
    throw err;
  }
  const data = await res.json();
  if (!res.ok || data.errorCode) {
    const err = new Error(data.error || `IF Live API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

// Same as ifLiveRequest but for POST/PUT/DELETE calls that send a JSON body.
async function ifLiveWrite(userId, method, path, body) {
  const token = await getValidAccessToken(userId);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    const err = new Error('Infinite Flight is rate-limiting this app right now (testing-mode cap is 20 requests/min, shared across all testers). Wait a minute and try again.');
    err.status = 429;
    throw err;
  }
  const data = await res.json();
  if (!res.ok || data.errorCode) {
    const err = new Error(data.error || `IF Live API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

// Routes

const PLAYGROUND_PATH = /^\/live\/[A-Za-z0-9_\-/]+(\?[A-Za-z0-9_\-=&]*)?$/;
router.get('/playground', requireAdmin, async (req, res) => {
  const path = String(req.query.path || '');
  if (!PLAYGROUND_PATH.test(path) || path.includes('..')) {
    return res.status(400).json({ error: 'Path must be a /live/... endpoint, e.g. /live/organizations' });
  }
  const started = Date.now();
  try {
    const token = await getValidAccessToken(req.user.id);
    const ifRes = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await ifRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    res.json({ path, status: ifRes.status, durationMs: Date.now() - started, body });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const V2_BASE = 'https://api.infiniteflight.com/public/v2';
const PLAYGROUND_V2_PATH = /^\/(sessions|users|aircraft|airports?|tracks)(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9_\-=&]*)?$/;
router.get('/playground-v2', requireAdmin, async (req, res) => {
  const path = String(req.query.path || '');
  if (!PLAYGROUND_V2_PATH.test(path) || /apikey/i.test(path)) {
    return res.status(400).json({ error: 'Path must be a v2 endpoint, e.g. /sessions or /users/{id}/flights' });
  }
  if (!process.env.IF_API_KEY) return res.status(503).json({ error: 'IF_API_KEY is not set on the server' });
  const names = String(req.query.discourseNames || '').split(',').map(n => n.trim()).filter(Boolean).slice(0, 25);
  const isUserLookup = path === '/users' && names.length > 0;
  const url = `${V2_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(process.env.IF_API_KEY)}`;
  const started = Date.now();
  try {
    const ifRes = await fetch(url, isUserLookup
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discourseNames: names }) }
      : undefined);
    const text = await ifRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    res.json({ path, method: isUserLookup ? 'POST' : 'GET', status: ifRes.status, durationMs: Date.now() - started, body });
  } catch (err) {
    res.status(500).json({ error: 'Request to Infinite Flight failed' });
  }
});

router.get('/status', requireLiveAccess, async (req, res) => {
  const record = await getTokenRecord(req.user.id);
  res.json({
    allowed: true,
    connected: !!record,
    if_username: record?.if_username || null,
    expires_at: record?.expires_at || null,
    primary_org_id: record?.primary_org_id || null,
  });
});

router.get('/link-status', requireAuth, async (req, res) => {
  const record = await getTokenRecord(req.user.id);
  res.json({
    connected: !!record,
    if_username: record?.if_username || null,
  });
});

router.put('/primary-org', requireLiveAccess, async (req, res) => {
  const { orgId } = req.body;
  if (orgId && !isAllowedOrg(orgId)) {
    return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });
  }
  try {
    const pb = await getAdminClient();
    const record = await getTokenRecord(req.user.id);
    if (!record) return res.status(400).json({ error: 'Not connected to Infinite Flight Live yet' });
    const updated = await pb.collection('if_live_tokens').update(record.id, { primary_org_id: orgId || null });
    res.json({ primary_org_id: updated.primary_org_id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const DEFAULT_RETURN_TO = '/if-live';
function safeReturnTo(raw, fallback = DEFAULT_RETURN_TO) {
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return fallback;
  return raw;
}

function beginOAuth({ userId, returnTo }) {
  cleanupPending();

  const codeVerifier  = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state         = base64url(crypto.randomBytes(16));

  pendingAuth.set(state, { userId, codeVerifier, returnTo, expires: Date.now() + PENDING_TTL });

  const scope = [
    'openid', 'profile', 'offline_access',
    'live:organizations.read', 'live:aircraft.read', 'live:schedules.read', 'live:schedules.write',
    ...(process.env.IF_LIVE_MEMBERS_SCOPE === '1' ? ['live:members.read'] : []),
  ].join(' ');

  return `${AUTH_BASE}/connect/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

router.get('/connect', requireLiveAccess, (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(503).json({ error: 'IF Live OAuth is not configured on the server yet (missing IF_OAUTH_* env vars)' });
  }
  const authUrl = beginOAuth({ userId: req.user.id, returnTo: safeReturnTo(req.query.returnTo) });
  res.json({ authUrl });
});

router.get('/link', requireAuth, (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(503).json({ error: 'IF OAuth is not configured on the server yet (missing IF_OAUTH_* env vars)' });
  }
  const authUrl = beginOAuth({ userId: req.user.id, returnTo: safeReturnTo(req.query.returnTo, '/profile') });
  res.json({ authUrl });
});

router.get('/auth-start', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(503).json({ error: 'IF OAuth is not configured on the server yet (missing IF_OAUTH_* env vars)' });
  }
  const authUrl = beginOAuth({ userId: null, returnTo: null });
  res.json({ authUrl });
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}${DEFAULT_RETURN_TO}?if_live_error=${encodeURIComponent(error)}`);
  }

  const pending = pendingAuth.get(state);
  if (!pending || Date.now() > pending.expires) {
    return res.redirect(`${FRONTEND_URL}${DEFAULT_RETURN_TO}?if_live_error=expired_or_invalid_state`);
  }
  pendingAuth.delete(state);

  let tokens;
  try {
    const tokenRes = await fetch(`${AUTH_BASE}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
        code_verifier: pending.codeVerifier,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    tokens = await tokenRes.json();
  } catch (err) {
    console.error('[if-live] callback token exchange error:', err.message);
    if (pending.userId === null) {
      return res.redirect(`${FRONTEND_URL}/login?if_login_error=${encodeURIComponent(err.message)}`);
    }
    const returnTo = pending.returnTo || DEFAULT_RETURN_TO;
    const sep = returnTo.includes('?') ? '&' : '?';
    return res.redirect(`${FRONTEND_URL}${returnTo}${sep}if_live_error=${encodeURIComponent(err.message)}`);
  }

  if (pending.userId === null) {
    try {
      const identity = await fetchIfIdentity(tokens);
      if (!identity?.if_user_id) {
        throw new Error('Infinite Flight did not return an identifiable user for this account');
      }

      const pb = await getAdminClient();
      let existingUser = null;
      try {
        existingUser = await pb.collection('users').getFirstListItem(`if_user_id = "${escFilterValue(identity.if_user_id)}"`, { requestKey: null });
      } catch { }

      if (existingUser) {
        if (existingUser.status !== 'approved') {
          const msg = ACCOUNT_STATUS_MESSAGES[existingUser.status] || `Account status: ${existingUser.status}. Contact admin for approval.`;
          return res.redirect(`${FRONTEND_URL}/login?if_login_error=${encodeURIComponent(msg)}`);
        }
        await saveTokenRecord(existingUser.id, tokens, identity.if_username);
        const { token, user: safeU } = await buildLoginResponse(pb, existingUser);
        const exchangeCode = createLoginExchangeCode({ token, user: safeU });
        return res.redirect(`${FRONTEND_URL}/login?if_login_code=${encodeURIComponent(exchangeCode)}`);
      }

      const signupToken = jwt.sign(
        { purpose: 'if_signup', if_user_id: identity.if_user_id, if_username: identity.if_username || null },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.redirect(`${FRONTEND_URL}/signup?if_signup_token=${encodeURIComponent(signupToken)}`);
    } catch (err) {
      console.error('[if-live] login callback error:', err.message);
      return res.redirect(`${FRONTEND_URL}/login?if_login_error=${encodeURIComponent(err.message)}`);
    }
  }

  // Branch: existing authenticated connect/link flow (unchanged)
  const returnTo = pending.returnTo || DEFAULT_RETURN_TO;
  const sep = returnTo.includes('?') ? '&' : '?'; // /admin?tab=if-live already has a query string
  try {
    await saveTokenRecord(pending.userId, tokens);
    res.redirect(`${FRONTEND_URL}${returnTo}${sep}if_live_connected=1`);
  } catch (err) {
    console.error('[if-live] callback error:', err.message);
    res.redirect(`${FRONTEND_URL}${returnTo}${sep}if_live_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/if-live/organizations
router.get('/organizations', requireLiveAccess, async (req, res) => {
  try {
    const result = await cached(`orgs:${req.user.id}`, () => ifLiveRequest(req.user.id, '/live/organizations'));
    const filtered = (result || []).filter(org => isAllowedOrg(org.id));
    res.json({ organizations: filtered });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/organizations/:orgId', requireLiveAccess, async (req, res) => {
  if (!isAllowedOrg(req.params.orgId)) return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });
  try {
    const result = await cached(`org:${req.params.orgId}`, () => ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(req.params.orgId)}`));
    res.json({ organization: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/organizations/:orgId/day-schedule', requireStaff, async (req, res) => {
  if (!isAllowedOrg(req.params.orgId)) return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });

  const dateStr = req.query.date; // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`).getTime();

  try {
    const aircraftList = await cached(`aircraft:${req.params.orgId}`, () => ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(req.params.orgId)}/aircraft`));

    const pb = await getAdminClient();
    const bids = await pb.collection('if_live_bids').getFullList({
      filter: `organization_id = "${escFilterValue(req.params.orgId)}" && (status = "active" || status = "completed")`,
      requestKey: null,
    }).catch(() => []);
    const pirepFiledScheduleIds = new Set();
    for (const bid of bids) {
      for (const leg of bid.legs || []) {
        if (leg.ifScheduleId && leg.pirepId) pirepFiledScheduleIds.add(leg.ifScheduleId);
      }
    }

    const withSchedules = await Promise.all((aircraftList || []).map(async (ac) => {
      try {
        const schedules = await cached(`schedules:${ac.id}`, () => ifLiveRequest(req.user.id, `/live/aircraft/${encodeURIComponent(ac.id)}/schedules`));
        const dayFlights = (schedules || [])
          .filter(s => {
            const t = new Date(s.scheduledDepartureUtc).getTime();
            return t >= dayStart && t <= dayEnd;
          })
          .map(s => ({ ...s, pirepFiled: pirepFiledScheduleIds.has(s.id) }))
          .sort((a, b) => new Date(a.scheduledDepartureUtc) - new Date(b.scheduledDepartureUtc));
        return { aircraft: ac, schedules: dayFlights, error: null };
      } catch (err) {
        return { aircraft: ac, schedules: [], error: err.message };
      }
    }));

    res.json({ date: dateStr, columns: withSchedules });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function getCurrentIcaoByAircraftId(pb, orgId) {
  const bids = await pb.collection('if_live_bids').getFullList({
    filter: `organization_id = "${escFilterValue(orgId)}"`,
    requestKey: null,
  }).catch(() => []);

  const latestByAircraft = new Map(); // aircraftId -> { icao, at }
  for (const bid of bids) {
    if (!bid.aircraft_id) continue;
    for (const leg of bid.legs || []) {
      if (!leg.pirepId || !leg.destIcao || !leg.loggedAt) continue;
      const at = new Date(leg.loggedAt).getTime();
      const existing = latestByAircraft.get(bid.aircraft_id);
      if (!existing || at > existing.at) {
        latestByAircraft.set(bid.aircraft_id, { icao: leg.destIcao, at });
      }
    }
  }
  // A location set by hand on Live Mode, Admin wins until a later leg is filed
  const admin = await liveAircraftAdmin.getAll().catch(() => ({}));
  for (const [aircraftId, entry] of Object.entries(admin)) {
    if (!entry?.locationIcao) continue;
    const at = new Date(entry.locationAt || 0).getTime();
    const existing = latestByAircraft.get(aircraftId);
    if (!existing || at > existing.at) latestByAircraft.set(aircraftId, { icao: entry.locationIcao, at });
  }
  const result = {};
  for (const [aircraftId, { icao }] of latestByAircraft) result[aircraftId] = icao;
  return result;
}

async function getLiveIcaoOverrides(userId, aircraftList) {
  const overrides = {};
  await Promise.all((aircraftList || []).map(async (ac) => {
    try {
      const raw = await cachedTtl(`acpos:${ac.id}`, () => ifLiveRequest(userId, `/live/aircraft/${encodeURIComponent(ac.id)}/position`), 15 * 1000);
      const position = extractPosition(raw);
      if (!position || !position.isOnGround) return;
      const nearest = nearestAirport(position.latitude, position.longitude);
      if (nearest) overrides[ac.id] = nearest.icao;
    } catch {
    }
  }));
  return overrides;
}

const FLEET_STATUS_TTL_MS = 2 * 60 * 1000;
async function fleetStatus(orgId) {
  return cachedTtl(`fleetStatus:${orgId}`, async () => {
    const serviceUserId = await getServiceUserIdForOrg(orgId);
    if (!serviceUserId) return [];
    const list = await cached(`aircraft:${orgId}`, () => ifLiveRequest(serviceUserId, `/live/organizations/${encodeURIComponent(orgId)}/aircraft`));
    const pb = await getAdminClient();
    const [currentIcaoByAircraft, liveIcaoOverrides, servers, adminSettings] = await Promise.all([
      getCurrentIcaoByAircraftId(pb, orgId),
      getLiveIcaoOverrides(serviceUserId, list),
      getAllServerFlightIds().catch(() => null),
      liveAircraftAdmin.getAll().catch(() => ({})),
    ]);
    return (list || []).map(ac => {
      const f = servers?.byFlightId?.get(ac.id);
      return {
        // Blocked from booking by an admin: { reason } or null
        blocked: adminSettings[ac.id]?.blocked ? { reason: adminSettings[ac.id].reason || '' } : null,
        id: ac.id,
        registration: ac.registration || null,
        // a Live aircraft's aircraftId is IF's livery id
        type: lookupLivery(ac.aircraftId)?.aircraftName || null,
        currentIcao: liveIcaoOverrides[ac.id] || currentIcaoByAircraft[ac.id] || null,
        live: f ? { callsign: f.callsign || null, session: f.session, onGround: (f.speed || 0) <= 40 } : null,
      };
    });
  }, FLEET_STATUS_TTL_MS);
}

// GET /api/if-live/organizations/:orgId/aircraft
router.get('/organizations/:orgId/aircraft', requireLiveAccess, async (req, res) => {
  if (!isAllowedOrg(req.params.orgId)) return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });
  try {
    const result = await cached(`aircraft:${req.params.orgId}`, () => ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(req.params.orgId)}/aircraft`));
    const pb = await getAdminClient();
    const adminSettings = await liveAircraftAdmin.getAll().catch(() => ({}));
    const [currentIcaoByAircraft, liveIcaoOverrides, servers] = await Promise.all([
      getCurrentIcaoByAircraftId(pb, req.params.orgId),
      getLiveIcaoOverrides(req.user.id, result),
      getAllServerFlightIds().catch(() => null),
    ]);
    const aircraft = (result || []).map(ac => ({
      ...ac,
      currentIcao: liveIcaoOverrides[ac.id] || currentIcaoByAircraft[ac.id] || null,
      currentIcaoSource: liveIcaoOverrides[ac.id] ? 'live-position' : (currentIcaoByAircraft[ac.id] ? 'booking-history' : null),
      liveStatus: getAircraftStatus(ac.id),
      // Blocked from booking by an admin: { reason } or null
      adminBlock: adminSettings[ac.id]?.blocked ? { reason: adminSettings[ac.id].reason || '' } : null,
      live: (() => {
        const f = servers?.byFlightId?.get(ac.id);
        return f ? { altitude: Math.round(f.altitude || 0), speed: Math.round(f.speed || 0), session: f.session, callsign: f.callsign || null } : null;
      })(),
    }));
    res.json({ aircraft });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/fleet-images', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const rows = await pb.collection('if_live_fleet_images').getFullList({ requestKey: null });
    const map = {};
    for (const r of rows) map[r.aircraft_type_id] = r.image_url;
    res.json({ images: map });
  } catch (err) {
    if (err.status === 404) return res.json({ images: {} });
    res.status(500).json({ error: err.message });
  }
});

router.put('/fleet-images/:aircraftTypeId', requireStaff, async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
  try {
    const pb = await getAdminClient();
    const typeId = req.params.aircraftTypeId;
    let existing = null;
    try {
      existing = await pb.collection('if_live_fleet_images').getFirstListItem(`aircraft_type_id = "${escFilterValue(typeId)}"`, { requestKey: null });
    } catch (_) { /* none yet */ }
    const row = existing
      ? await pb.collection('if_live_fleet_images').update(existing.id, { image_url: imageUrl })
      : await pb.collection('if_live_fleet_images').create({ aircraft_type_id: typeId, image_url: imageUrl });
    res.json({ aircraftTypeId: typeId, imageUrl: row.image_url });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function pickField(obj, names) {
  if (!obj) return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}

function pickNumber(obj, names) {
  const v = pickField(obj, names);
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

function extractPosition(detail, flightIds) {
  if (!detail) return null;
  const latitude  = pickNumber(detail, ['latitude', 'Latitude', 'lat', 'Lat']);
  const longitude = pickNumber(detail, ['longitude', 'Longitude', 'lng', 'Lng', 'lon', 'Lon']);
  if (latitude === undefined || longitude === undefined) return null; // no stored fix at all yet
  const id = pickField(detail, ['id', 'Id']);
  return {
    latitude,
    longitude,
    heading:       pickNumber(detail, ['heading', 'Heading', 'track', 'Track']) || 0,
    altitude:      pickNumber(detail, ['altitude', 'Altitude']),
    speed:         pickNumber(detail, ['speed', 'Speed']),
    verticalSpeed: pickNumber(detail, ['verticalSpeed', 'VerticalSpeed']),
    state:         pickNumber(detail, ['state', 'State']),
    isOnGround:    pickField(detail, ['isOnGround', 'IsOnGround']) ?? null,
    lastPilotUsername: pickField(detail, ['lastPilotUsername', 'LastPilotUsername']) || null,
    updatedAt:     pickField(detail, ['updatedAt', 'UpdatedAt']) || null,
    stale: flightIds ? !(id && flightIds.has(id)) : null,
  };
}

const IF_V2_BASE = 'https://api.infiniteflight.com/public/v2';

async function getAllServerFlightIds() {
  const sessData = await cachedTtl('v2:sessions', async () => {
    const r = await fetch(`${IF_V2_BASE}/sessions?apikey=${process.env.IF_API_KEY}`);
    const d = await r.json();
    if (d.errorCode !== 0) throw new Error(`IF v2 sessions error ${d.errorCode}`);
    return d;
  }, 10 * 60 * 1000);

  const sessions = sessData.result || [];
  const flightIds = new Set();
  const byUser = new Map(); // IF user id -> their live flights, Expert first
  const byFlightId = new Map(); // a Live aircraft's id is its flightId while it's flying
  let flightCount = 0;
  for (const session of sessions) {
    try {
      const flightData = await cachedTtl(`v2:flights:${session.id}`, async () => {
        const r = await fetch(`${IF_V2_BASE}/sessions/${session.id}/flights?apikey=${process.env.IF_API_KEY}`);
        const d = await r.json();
        if (d.errorCode !== 0) throw new Error(`IF v2 flights error ${d.errorCode}`);
        return d;
      }, 15 * 1000);
      for (const f of (flightData.result || [])) {
        const fid = f.flightId || f.FlightId;
        if (fid) { flightIds.add(fid); byFlightId.set(fid, { ...f, session: session.name, sessionId: session.id }); }
        if (f.userId) {
          const list = byUser.get(f.userId) || [];
          list[/expert/i.test(session.name || '') ? 'unshift' : 'push']({ ...f, session: session.name, sessionId: session.id });
          byUser.set(f.userId, list);
        }
        flightCount++;
      }
    } catch (err) {
      console.warn(`[if-live/positions] couldn't fetch flights for session "${session.name}":`, err.message);
    }
  }
  return { flightIds, byUser, byFlightId, sessionsChecked: sessions.map(s => s.name), flightCount };
}

async function orgPositions(userId, orgId) {
  const aircraftList = await cached(`aircraft:${orgId}`, () => ifLiveRequest(userId, `/live/organizations/${encodeURIComponent(orgId)}/aircraft`));

  let flightIds;
  let byUser = new Map();
  let byFlightId = new Map();
  try {
    ({ flightIds, byUser, byFlightId } = await getAllServerFlightIds());
  } catch (err) {
    console.warn('[if-live/positions] could not fetch public v2 flight ids:', err.message);
  }

  // Who has each aircraft booked, so a stale aircraft can be found by its pilot.
  const bookedPilot = new Map();
  try {
    const pb = await getAdminClient();
    const active = await pb.collection('if_live_bids').getFullList({
      filter: `organization_id = "${escFilterValue(orgId)}" && status = "active"`,
      expand: 'pilot', fields: 'aircraft_id,expand.pilot.if_user_id', requestKey: null,
    });
    for (const b of active) if (b.expand?.pilot?.if_user_id) bookedPilot.set(b.aircraft_id, b.expand.pilot.if_user_id);
  } catch { /* positions still work without it */ }

  const pilotFlight = (ac, detail) => {
    if (byFlightId.has(ac.id)) return byFlightId.get(ac.id);
    for (const userId of [bookedPilot.get(ac.id), detail?.lastPilotId].filter(Boolean)) {
      const f = (byUser.get(userId) || []).find(x => !ac.aircraftId || x.aircraftId === ac.aircraftId);
      if (f) return f;
    }
    return null;
  };

  const withPositions = await Promise.all((aircraftList || []).map(async (ac) => {
    try {
      const detail = await cachedTtl(`acpos:${ac.id}`, () => ifLiveRequest(userId, `/live/aircraft/${encodeURIComponent(ac.id)}/position`), 15 * 1000);
      let position = extractPosition(detail, flightIds);
      const frozenAloft = !position || (position.stale !== false && position.isOnGround === false);
      if (byFlightId.has(ac.id) || frozenAloft) {
        const f = pilotFlight(ac, detail);
        if (f) {
          position = {
            latitude: f.latitude, longitude: f.longitude,
            heading: f.heading || f.track || 0, altitude: f.altitude, speed: f.speed, verticalSpeed: f.verticalSpeed,
            state: (f.speed || 0) > 40 ? 2 : 1, isOnGround: (f.speed || 0) <= 40 ? true : null,
            lastPilotUsername: f.username || position?.lastPilotUsername || null,
            updatedAt: f.lastReport || new Date().toISOString(),
            stale: false, source: byFlightId.has(ac.id) ? 'flight' : 'pilot', callsign: f.callsign || null, session: f.session,
            // For the map's flown path (GET /livemap/route/:sessionId/:flightId).
            sessionId: f.sessionId || null, flightId: f.flightId || null,
          };
        }
      }
      return { aircraft: ac, position, error: null };
    } catch (err) {
      return { aircraft: ac, position: null, error: err.message };
    }
  }));

  return withPositions;
}

router.get('/organizations/:orgId/positions', requireLiveAccess, async (req, res) => {
  if (!isAllowedOrg(req.params.orgId)) return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });
  try {
    res.json({ aircraft: await orgPositions(req.user.id, req.params.orgId) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/aircraft/:aircraftId', requireLiveAccess, async (req, res) => {
  try {
    const result = await cached(`acdetail:${req.params.aircraftId}`, () => ifLiveRequest(req.user.id, `/live/aircraft/${encodeURIComponent(req.params.aircraftId)}`));
    res.json({ aircraft: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/aircraft/:aircraftId/flights', requireLiveAccess, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const id = req.params.aircraftId;
    const result = await cachedTtl(`acflights:${id}:${page}`, () => ifLiveRequest(req.user.id, `/live/aircraft/${encodeURIComponent(id)}/flights?page=${page}&pageSize=25`), 60 * 1000);
    const flights = (result?.items || []).map(f => {
      const byPilot = new Map();
      for (const t of (f.pilotFlightTimes || [])) {
        const cur = byPilot.get(t.userId) || { userId: t.userId, username: t.username || null, seconds: 0 };
        cur.seconds += t.flightTimeSeconds || 0;
        byPilot.set(t.userId, cur);
      }
      for (const c of (f.crew || [])) {
        if (!byPilot.has(c.userId)) byPilot.set(c.userId, { userId: c.userId, username: c.username || null, seconds: 0 });
      }
      return {
        id: f.id,
        originIcao: f.originIcao || null,
        destinationIcao: f.destinationIcao || null,
        departedUtc: f.actualDepartureUtc || null,
        arrivedUtc: f.actualArrivalUtc || null,
        status: f.status, // 0 active, 1 completed, 2 cancelled/crashed
        flightTimeMinutes: Math.round(f.flightTimeMinutes || 0),
        airframeHours: Math.round((f.airframeTimeMinutes || 0) / 6) / 10,
        pilots: [...byPilot.values()].map(p => ({ ...p, minutes: Math.round(p.seconds / 60) })),
      };
    });
    res.json({ flights, page: result?.page || page, totalPages: result?.totalPages || 1, totalCount: result?.totalCount ?? flights.length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const ORG_SCHEDULES_MAX_PAGES = 5;
router.get('/organizations/:orgId/schedules', requireLiveAccess, async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const items = await cachedTtl(`orgschedules:${orgId}`, async () => {
      const all = [];
      for (let page = 1; page <= ORG_SCHEDULES_MAX_PAGES; page++) {
        const result = await ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(orgId)}/schedules?page=${page}&pageSize=100`);
        all.push(...(result?.items || []));
        if (!result || page >= (result.totalPages || 1)) break;
      }
      return all;
    }, 60 * 1000);
    const schedules = (items || []).map(sc => ({
      id: sc.id,
      aircraftId: sc.aircraftId,
      status: sc.status,
      callsign: sc.callsign,
      flightType: sc.flightType,
      originIcao: sc.originIcao,
      destinationIcao: sc.destinationIcao,
      isTimeless: !!sc.isTimeless,
      scheduledDepartureUtc: sc.isTimeless ? null : sc.scheduledDepartureUtc,
      scheduledArrivalUtc: sc.isTimeless ? null : sc.scheduledArrivalUtc,
      actualDepartureUtc: sc.actualDepartureUtc || null,
      actualArrivalUtc: sc.actualArrivalUtc || null,
      sequence: sc.sequence,
      crew: (sc.crew || []).map(c => ({ username: c.username || null, role: c.role })),
    }));
    res.json({ schedules });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/organizations/:orgId/history', requireLiveAccess, async (req, res) => {
  if (!isAllowedOrg(req.params.orgId)) return res.status(403).json({ error: `This organization is not the configured ${brand.abbreviation} Live organization` });
  const days = Math.min(180, Math.max(1, parseInt(req.query.days, 10) || 30));
  try {
    const orgId = req.params.orgId;
    const aircraft = await cached(`aircraft:${orgId}`, () => ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(orgId)}/aircraft`));
    const idByReg = new Map((aircraft || []).filter(a => a.registration).map(a => [a.registration.toUpperCase(), a.id]));
    if (!idByReg.size) return res.json({ flights: [], days });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    const regFilter = [...idByReg.keys()].map(r => `registration = "${escFilterValue(r)}" || aircraft = "${escFilterValue(r)}"`).join(' || ');
    const pb = await getAdminClient();
    const list = await pb.collection('flights').getList(1, 1000, {
      filter: `(${regFilter}) && status != "rejected" && created >= "${since}"`,
      sort: '-created',
      expand: 'user',
      fields: 'id,flight_number,departure_icao,arrival_icao,aircraft,registration,flight_time,date,status,is_live,auto_approved,created,expand.user.id,expand.user.first_name,expand.user.last_name,expand.user.callsign',
      requestKey: null,
    });
    const flights = list.items.map(f => {
      const u = f.expand?.user;
      return {
        id: f.id,
        aircraftId: idByReg.get(String(f.registration || f.aircraft || '').toUpperCase()) || null,
        registration: f.registration || f.aircraft,
        aircraftType: f.registration ? f.aircraft : null,
        callsign: f.flight_number || '',
        originIcao: f.departure_icao,
        destinationIcao: f.arrival_icao,
        flightHours: Number(f.flight_time) || 0,
        date: f.date,
        filedAt: f.created,
        status: f.status,
        isLive: !!f.is_live,
        autoApproved: !!f.auto_approved,
        pilot: u ? `${u.first_name || 'Pilot'} ${(u.last_name || '').charAt(0).toUpperCase()}${u.last_name ? '.' : ''}` : null,
        pilotCallsign: u?.callsign || null,
        pilotId: u?.id || null,
      };
    });
    res.json({ flights, days });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/organizations/:orgId/members', requireLiveAccess, async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const result = await cachedTtl(`orgmembers:${orgId}`, () => ifLiveRequest(req.user.id, `/live/organizations/${encodeURIComponent(orgId)}/members`), 5 * 60 * 1000);
    res.json({
      available: true,
      members: (result || []).map(m => ({ userId: m.userId, username: m.username || null, role: m.role, joinedAt: m.joinedAt, activeLifts: m.activeLifts || 0 })),
    });
  } catch (err) {
    if (err.status === 403) return res.json({ available: false, members: [] });
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/if-live/aircraft/:aircraftId/schedules
router.get('/aircraft/:aircraftId/schedules', requireStaff, async (req, res) => {
  try {
    const result = await cached(`schedules:${req.params.aircraftId}`, () => ifLiveRequest(req.user.id, `/live/aircraft/${encodeURIComponent(req.params.aircraftId)}/schedules`));
    res.json({ schedules: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/aircraft/:aircraftId/schedules', requireStaff, async (req, res) => {
  try {
    const result = await ifLiveWrite(req.user.id, 'POST', `/live/aircraft/${encodeURIComponent(req.params.aircraftId)}/schedules`, req.body);
    invalidateAircraftSchedulesCache(req.params.aircraftId);
    res.status(201).json({ schedule: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/schedules/:scheduleId', requireStaff, async (req, res) => {
  try {
    const result = await ifLiveWrite(req.user.id, 'PUT', `/live/schedules/${encodeURIComponent(req.params.scheduleId)}`, req.body);
    if (result?.aircraftId) invalidateAircraftSchedulesCache(result.aircraftId);
    res.json({ schedule: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/schedules/:scheduleId/flightplan', requireStaff, async (req, res) => {
  try {
    const result = await ifLiveWrite(req.user.id, 'PUT', `/live/schedules/${encodeURIComponent(req.params.scheduleId)}/flightplan`, { flightPlan: req.body.flightPlan ?? null });
    if (result?.aircraftId) invalidateAircraftSchedulesCache(result.aircraftId);
    res.json({ schedule: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/aircraft/:aircraftId/schedules/reorder', requireStaff, async (req, res) => {
  try {
    const { scheduleId, afterId = null } = req.body;
    if (!scheduleId) return res.status(400).json({ error: 'scheduleId required' });
    const result = await ifLiveWrite(req.user.id, 'PUT', `/live/aircraft/${encodeURIComponent(req.params.aircraftId)}/schedules/reorder`, { scheduleId, afterId });
    invalidateAircraftSchedulesCache(req.params.aircraftId);
    res.json({ reordered: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/schedules/:scheduleId', requireStaff, async (req, res) => {
  try {
    let aircraftId = null;
    try {
      const cacheEntries = [...readCache.entries()].find(([k, v]) => k.startsWith('schedules:') && (v.data || []).some(s => s.id === req.params.scheduleId));
      if (cacheEntries) aircraftId = cacheEntries[0].replace('schedules:', '');
    } catch { /* best effort only */ }

    const result = await ifLiveWrite(req.user.id, 'DELETE', `/live/schedules/${encodeURIComponent(req.params.scheduleId)}`);
    if (aircraftId) invalidateAircraftSchedulesCache(aircraftId);
    res.json({ deleted: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/if-live/aircraft/:aircraftId/position
router.get('/aircraft/:aircraftId/position', requireLiveAccess, async (req, res) => {
  try {
    const result = await ifLiveRequest(req.user.id, `/live/aircraft/${encodeURIComponent(req.params.aircraftId)}/position`);
    res.json({ position: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/disconnect', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const record = await getTokenRecord(req.user.id);
    if (record) await pb.collection('if_live_tokens').delete(record.id);
    tokenMemo.delete(req.user.id);
    res.json({ disconnected: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getServiceUserIdForOrg(orgId) {
  const pb = await getAdminClient();
  const list = await pb.collection('if_live_tokens').getFullList({
    filter: `primary_org_id = "${escFilterValue(orgId)}"`,
    expand: 'user',
    requestKey: null,
  });
  const withAdmin = list.find(r => r.expand?.user?.role === 'admin');
  return (withAdmin || list[0])?.user || null;
}

function isTimelessLeg(leg) {
  return !leg.departureUtc || !leg.arrivalUtc;
}

// Request body for POST /live/aircraft/{id}/schedules.
function schedulePayloadForLeg(leg) {
  const payload = {
    callsign: leg.flightNumber,
    flightType: 1,
    originIcao: leg.originIcao,
    destinationIcao: leg.destIcao,
  };
  if (isTimelessLeg(leg)) {
    payload.isTimeless = true;
  } else {
    payload.scheduledDepartureUtc = leg.departureUtc;
    payload.scheduledArrivalUtc = leg.arrivalUtc;
  }
  if (leg.flightPlan) payload.flightPlan = String(leg.flightPlan).slice(0, 16000);
  return payload;
}

const START_WINDOW_MS = 4 * 60 * 60 * 1000;
const HOLD_BUFFER_MS = 6 * 60 * 60 * 1000; // was 2h; pilots can still extend 3 × 1h on top (EXTEND_MAX)
const ESTIMATE_CRUISE_KT = 450;     // average airliner block speed for timeless estimates
const ESTIMATE_OVERHEAD_MIN = 30;   // taxi, climb and descent on top of cruise time
const ESTIMATE_MIN_MINUTES = 45;
const MAX_LEGS_PER_BOOKING = 6;     // sectors you can chain on one booking with "Add a sector"
const MAX_BOOKINGS_PER_PILOT = 2;

function estimatedBlockMs(leg) {
  const nm = distanceBetween(leg.originIcao, leg.destIcao) || 0;
  const minutes = Math.max(ESTIMATE_MIN_MINUTES, (nm / ESTIMATE_CRUISE_KT) * 60 + ESTIMATE_OVERHEAD_MIN);
  return Math.round(minutes) * 60 * 1000;
}

function blockMs(leg) {
  return isTimelessLeg(leg) ? estimatedBlockMs(leg) : new Date(leg.arrivalUtc) - new Date(leg.departureUtc);
}

function deadlineForLeg(leg, legIndex, createdAt = Date.now(), previousDeadlineUtc = null) {
  const start = !isTimelessLeg(leg) ? new Date(leg.departureUtc).getTime()
    : legIndex > 0 && previousDeadlineUtc ? new Date(previousDeadlineUtc).getTime() : createdAt;
  return new Date(start + Math.max(START_WINDOW_MS, blockMs(leg) + HOLD_BUFFER_MS)).toISOString();
}

// The deadline once the flight has been seen under way.
function startedDeadline(leg, startedAt) {
  return new Date(new Date(startedAt).getTime() + blockMs(leg) + HOLD_BUFFER_MS).toISOString();
}

async function createLiveSchedulesForBid({ organizationId, aircraftId, legs, crew, captain, startAt, previousDeadlineUtc = null }) {
  const serviceUserId = await getServiceUserIdForOrg(organizationId);
  if (!serviceUserId) {
    const err = new Error("No connected Infinite Flight Live account is set as this organization's default yet — ask an admin to connect and choose a default org first");
    err.status = 503;
    throw err;
  }

  const createdScheduleIds = [];
  const updatedLegs = legs.map(l => ({ ...l }));
  try {
    const createdAt = startAt || Date.now();
    for (const [legIndex, leg] of updatedLegs.entries()) {
      const schedule = await ifLiveWrite(serviceUserId, 'POST', `/live/aircraft/${encodeURIComponent(aircraftId)}/schedules`, schedulePayloadForLeg(leg));
      createdScheduleIds.push(schedule.id);
      leg.ifScheduleId = schedule.id;
      const prevDeadline = legIndex > 0 ? updatedLegs[legIndex - 1].deadlineUtc : previousDeadlineUtc;
      leg.holdStartUtc = isTimelessLeg(leg)
        ? new Date(prevDeadline ? new Date(prevDeadline).getTime() : createdAt).toISOString()
        : leg.departureUtc;
      leg.deadlineUtc = deadlineForLeg(leg, prevDeadline ? 1 : 0, createdAt, prevDeadline);
    }
  } catch (writeErr) {
    await Promise.allSettled(createdScheduleIds.map(id =>
      ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(id)}`)));
    throw writeErr;
  }

  invalidateAircraftSchedulesCache(aircraftId);

  const crewWarnings = [];
  if (captain?.ifUserId) {
    try {
      await applyCrewToLegs(serviceUserId, updatedLegs, captain.ifUserId, CREW_ROLE_CAPTAIN);
    } catch (crewErr) {
      crewWarnings.push(`The booking pilot couldn't be added as Captain on the real schedule: ${crewErr.message}`);
    }
  }
  for (const crewMember of (crew || [])) {
    try {
      await applyCrewToLegs(serviceUserId, updatedLegs, crewMember.ifUserId);
    } catch (crewErr) {
      crewWarnings.push(`${crewMember.name || crewMember.ifUsername || 'A crew member'} couldn't be added to the real schedule: ${crewErr.message}`);
    }
  }

  return { legs: updatedLegs, crewWarnings };
}

function serializeBid(b, req) {
  return {
    id: b.id,
    aircraftId: b.aircraft_id,
    aircraftRegistration: b.aircraft_registration,
    legs: b.legs || [],
    status: b.status,
    reviewNote: b.review_note || '',
    pilot: b.expand?.pilot ? { id: b.expand.pilot.id, callsign: b.expand.pilot.callsign, first_name: b.expand.pilot.first_name, last_name: b.expand.pilot.last_name } : null,
    isMine: b.pilot === req.user.id,
    crew: b.crew || [],
    created: b.created,
  };
}

const RECENT_BIDS_DAYS = 7;
router.get('/bids', requireLiveAccess, async (req, res) => {
  const { organizationId } = req.query;
  if (!organizationId) return res.status(400).json({ error: 'organizationId required' });
  try {
    const pb = await getAdminClient();
    const since = new Date(Date.now() - RECENT_BIDS_DAYS * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    const statusFilter = req.query.recent === '1'
      ? `(status = "pending" || status = "active" || ((status = "completed" || status = "expired") && updated >= "${since}"))`
      : '(status = "pending" || status = "active")';
    const list = await pb.collection('if_live_bids').getFullList({
      filter: `organization_id = "${escFilterValue(organizationId)}" && ${statusFilter}`,
      expand: 'pilot',
      sort: '-created',
      requestKey: null,
    });
    res.json({ bids: list.map(b => serializeBid(b, req)) });
  } catch (err) {
    if (err.status === 404) return res.json({ bids: [] });
    res.status(500).json({ error: err.message });
  }
});

router.get('/bids/mine', requireLiveAccess, async (req, res) => {
  const wantsHistory = req.query.history === '1' || req.query.history === 'true';
  try {
    const pb = await getAdminClient();
    const filter = wantsHistory
      ? `pilot = "${escFilterValue(req.user.id)}"`
      : `pilot = "${escFilterValue(req.user.id)}" && (status = "pending" || status = "active")`;
    const list = await pb.collection('if_live_bids').getFullList({
      filter,
      sort: '-created',
      requestKey: null,
    });
    res.json({ bids: list.map(b => serializeBid({ ...b, expand: {} }, req)) });
  } catch (err) {
    if (err.status === 404) return res.json({ bids: [] });
    res.status(500).json({ error: err.message });
  }
});

router.get('/bids/landed-legs', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const pilot = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    if (!pilot.if_user_id) return res.json({ landed: [] });

    const bids = await pb.collection('if_live_bids').getFullList({
      filter: `pilot = "${escFilterValue(req.user.id)}" && status = "active"`,
      requestKey: null,
    });

    const excludeCreated = await getConsumedFlightTimestamps(pb, req.user.id);

    const landed = [];
    for (const bid of bids) {
      const legs = bid.legs || [];
      for (let legIndex = 0; legIndex < legs.length; legIndex++) {
        const leg = legs[legIndex];
        if (leg.pirepId || leg.expired || !leg.ifScheduleId) continue;
        const autoResult = await matchLandedLeg(pb, bid, leg, pilot, { excludeCreated });
        if (autoResult.matched) {
          if (autoResult.bestCandidate?.created) excludeCreated.add(autoResult.bestCandidate.created);
          landed.push({
            bidId: bid.id, legIndex,
            flightNumber: leg.flightNumber, originIcao: leg.originIcao, destIcao: leg.destIcao,
            aircraftRegistration: bid.aircraft_registration,
          });
        }
      }
    }
    res.json({ landed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function checkBidRequest(pb, userId, { organizationId, aircraftId, legs, excludeBidId = null, aheadOf = null, extendBidId = null }) {
  if (!organizationId || !aircraftId) return { status: 400, error: 'organizationId and aircraftId are required' };
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 2) {
    return { status: 400, error: 'Provide 1 or 2 legs (an outbound, and optionally a return)' };
  }
  for (const leg of legs) {
    if (!leg || !leg.flightNumber || !leg.originIcao || !leg.destIcao) {
      return { status: 400, error: 'Each leg needs a flight number, origin and destination' };
    }
    if (!!leg.departureUtc !== !!leg.arrivalUtc) {
      return { status: 400, error: 'Give both an off-blocks and an on-blocks time, or neither' };
    }
    if (!isTimelessLeg(leg) && new Date(leg.arrivalUtc) <= new Date(leg.departureUtc)) {
      return { status: 400, error: "Each leg's arrival must be after its departure" };
    }
    leg.timeless = isTimelessLeg(leg);
  }
  // A return leg has to depart from wherever the outbound leg actually lands.
  for (let i = 1; i < legs.length; i++) {
    if (legs[i].originIcao.toUpperCase() !== legs[i - 1].destIcao.toUpperCase()) {
      return { status: 400, error: `Leg ${i + 1} must depart from ${legs[i - 1].destIcao}, where leg ${i} lands` };
    }
  }

  // Blocked by an admin (Live Mode, Admin, Aircraft)
  const block = await liveAircraftAdmin.blockFor(aircraftId).catch(() => null);
  if (block) {
    return { status: 409, error: `This aircraft isn't available to book right now${block.reason ? `: ${block.reason}` : ''}` };
  }

  const mine = (await pb.collection('if_live_bids').getFullList({
    filter: `pilot = "${escFilterValue(userId)}" && (status = "pending" || status = "active")`,
    requestKey: null,
  })).filter(b => b.id !== excludeBidId && b.id !== extendBidId
    && (b.status === 'pending' || (b.legs || []).some(l => !l.pirepId && !l.expired)));
  if (!extendBidId) {
    const sameAircraft = mine.find(b => b.aircraft_id === aircraftId);
    if (sameAircraft) {
      return { status: 409, error: `You already have ${sameAircraft.aircraft_registration || 'this aircraft'} booked. Add a sector to that booking instead.` };
    }
    if (mine.length >= MAX_BOOKINGS_PER_PILOT) {
      const regs = mine.map(b => b.aircraft_registration).filter(Boolean).join(' and ');
      return { status: 409, error: `You can have up to ${MAX_BOOKINGS_PER_PILOT} aircraft booked at a time${regs ? ` (you have ${regs})` : ''}. Fly or cancel one first.` };
    }
  }

  const existingBids = (await pb.collection('if_live_bids').getFullList({
    filter: `aircraft_id = "${escFilterValue(aircraftId)}" && (status = "pending" || status = "active")`,
    requestKey: null,
  })).filter(b => b.id !== excludeBidId);
  if (existingBids.some(b => b.status === 'pending')) {
    return { status: 409, error: 'This aircraft has a booking waiting on staff. Pick another one for now.' };
  }
  let last = null;
  for (const bid of existingBids) {
    for (const leg of (bid.legs || [])) {
      if (leg.pirepId || leg.expired || !leg.deadlineUtc) continue;
      const at = new Date(leg.deadlineUtc).getTime();
      if (aheadOf != null && at > aheadOf) continue;
      if (!last || at > last.at) last = { at, icao: leg.destIcao, bidId: bid.id };
    }
  }

  if (extendBidId && last?.bidId !== extendBidId) {
    return { status: 409, error: "Someone has booked this aircraft after you, so you can't add more sectors to this booking." };
  }
  if (last) {
    const until = new Date(last.at);
    const z = `${String(until.getUTCHours()).padStart(2, '0')}${String(until.getUTCMinutes()).padStart(2, '0')}Z`;
    if (last.icao && legs[0].originIcao.toUpperCase() !== String(last.icao).toUpperCase()) {
      return { status: 400, error: extendBidId
        ? `Your booking finishes at ${last.icao}, so the next sector has to depart from there`
        : `This aircraft is booked until ${z} and finishes at ${last.icao}, so your first flight has to depart from there` };
    }
    const tooEarly = legs.find(l => !l.timeless && new Date(l.departureUtc).getTime() < last.at);
    if (tooEarly) {
      return { status: 400, error: `This aircraft is booked until ${z}. Set your departure for ${z} or later, or choose Fly now to go straight after.` };
    }
    return { startAt: Math.max(Date.now(), last.at), queuedAfter: last.at };
  }

  const [currentIcaoByAircraft, liveIcaoOverrides] = await Promise.all([
    getCurrentIcaoByAircraftId(pb, organizationId),
    getLiveIcaoOverrides(userId, [{ id: aircraftId }]),
  ]);
  const knownIcao = liveIcaoOverrides[aircraftId] || currentIcaoByAircraft[aircraftId];
  if (knownIcao && legs[0].originIcao.toUpperCase() !== knownIcao.toUpperCase()) {
    return { status: 400, error: `This aircraft is now at ${knownIcao}, so the first flight has to depart from there` };
  }
  return { startAt: Date.now(), queuedAfter: null };
}

async function extendableBid(pb, userId, bidId, count) {
  const bid = await pb.collection('if_live_bids').getOne(bidId, { requestKey: null }).catch(() => null);
  if (!bid || bid.pilot !== userId) return { status: 404, error: 'Booking not found' };
  if (bid.status !== 'active') return { status: 400, error: `This booking is ${bid.status}` };
  if (!(bid.legs || []).some(l => !l.pirepId && !l.expired)) return { status: 400, error: 'This booking is finished. Book a new flight instead.' };
  if ((bid.legs || []).length + count > MAX_LEGS_PER_BOOKING) {
    return { status: 400, error: `A booking can have up to ${MAX_LEGS_PER_BOOKING} sectors` };
  }
  return { bid };
}

// When the leg's 4-hour start window closes, if it starts when planned.
function plannedStartBy(leg, startAt) {
  const start = isTimelessLeg(leg) ? startAt : new Date(leg.departureUtc).getTime();
  return new Date(start + START_WINDOW_MS).toISOString();
}

router.post('/bids/quote', requireLiveAccess, async (req, res) => {
  const { organizationId, aircraftId, legs, extendBidId } = req.body;
  try {
    const pb = await getAdminClient();
    if (extendBidId) {
      const ext = await extendableBid(pb, req.user.id, extendBidId, Array.isArray(legs) ? legs.length : 0);
      if (ext.error) return res.json({ ok: false, error: ext.error });
    }
    const check = await checkBidRequest(pb, req.user.id, { organizationId, aircraftId, legs, extendBidId });
    if (check.error) return res.json({ ok: false, error: check.error });
    const quoted = [];
    legs.forEach((leg, i) => {
      const deadlineUtc = deadlineForLeg(leg, i, check.startAt, quoted[i - 1]?.deadlineUtc);
      quoted.push({
        flightNumber: leg.flightNumber, originIcao: leg.originIcao, destIcao: leg.destIcao, timeless: leg.timeless,
        deadlineUtc,
        estimatedMinutes: leg.timeless ? Math.round(estimatedBlockMs(leg) / 60000) : null,
      });
    });
    res.json({
      ok: true, legs: quoted, heldUntilUtc: quoted[quoted.length - 1].deadlineUtc, bufferMinutes: HOLD_BUFFER_MS / 60000,
      freeFromUtc: check.queuedAfter ? new Date(check.queuedAfter).toISOString() : null,
      startWindowMinutes: START_WINDOW_MS / 60000,
      startByUtc: plannedStartBy(legs[0], check.startAt),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/airports', requireLiveAccess, (req, res) => {
  const icaos = String(req.query.icaos || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{3,8}$/.test(s)).slice(0, 400);
  const airports = {};
  for (const icao of icaos) {
    const a = lookupAirport(icao);
    if (a) airports[icao] = { name: a.name || null, city: a.city ? a.city.replace(/\s*\(.*\)\s*$/, '') : null, country: a.country || null };
  }
  res.json({ airports });
});

router.post('/bids', requireLiveAccess, async (req, res) => {
  const { organizationId, aircraftId, aircraftRegistration, aircraftTypeId, liveryId, legs } = req.body;
  try {
    const pb = await getAdminClient();
    const check = await checkBidRequest(pb, req.user.id, { organizationId, aircraftId, legs });
    if (check.error) return res.status(check.status).json({ error: check.error });

    let finalLegs = legs;
    let crewWarnings;
    let status = 'pending';
    let scheduleError = null;
    try {
      const me = await pb.collection('users').getOne(req.user.id, { fields: 'if_user_id', requestKey: null }).catch(() => null);
      const result = await createLiveSchedulesForBid({ organizationId, aircraftId, legs, crew: [], captain: { ifUserId: me?.if_user_id }, startAt: check.startAt });
      finalLegs = result.legs;
      crewWarnings = result.crewWarnings;
      status = 'active';
    } catch (err) {
      scheduleError = err.message;
    }

    const bid = await pb.collection('if_live_bids').create({
      pilot: req.user.id,
      organization_id: organizationId,
      aircraft_id: aircraftId,
      aircraft_registration: aircraftRegistration || '',
      aircraft_type_id: aircraftTypeId || '',
      livery_id: liveryId || '',
      legs: finalLegs,
      status,
      ...(scheduleError ? { review_note: `Schedule failed: ${scheduleError}`.slice(0, 500) } : {}),
    });

    if (status !== 'pending') {
      pb.collection('users').getOne(req.user.id, { requestKey: null })
        .then(pilot => notifyBookingCreated({ pilot, aircraftRegistration, aircraftTypeId, legs: finalLegs }))
        .catch(() => {});
    } else {
      pb.collection('users').getOne(req.user.id, { requestKey: null })
        .then(pilot => notifyBookingNeedsStaff({ pilot, aircraftRegistration, legs: finalLegs, error: scheduleError }))
        .catch(() => {});
    }

    res.status(201).json({ bid, crewWarnings: crewWarnings?.length ? crewWarnings : undefined, scheduleError: status === 'pending' ? scheduleError : undefined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/bids/:id/legs', requireLiveAccess, async (req, res) => {
  const { legs } = req.body;
  try {
    const pb = await getAdminClient();
    const ext = await extendableBid(pb, req.user.id, req.params.id, Array.isArray(legs) ? legs.length : 0);
    if (ext.error) return res.status(ext.status).json({ error: ext.error });
    const { bid } = ext;
    const check = await checkBidRequest(pb, req.user.id, { organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs, extendBidId: bid.id });
    if (check.error) return res.status(check.status).json({ error: check.error });

    const open = (bid.legs || []).filter(l => !l.pirepId && !l.expired && l.deadlineUtc);
    const lastDeadline = open.length ? open[open.length - 1].deadlineUtc : null;
    const me = await pb.collection('users').getOne(req.user.id, { requestKey: null }).catch(() => null);
    const result = await createLiveSchedulesForBid({
      organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs, crew: bid.crew || [],
      captain: { ifUserId: me?.if_user_id }, startAt: check.startAt, previousDeadlineUtc: lastDeadline,
    });
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs: [...(bid.legs || []), ...result.legs] }, { expand: 'pilot' });
    if (me) notifyBookingCreated({ pilot: me, aircraftRegistration: bid.aircraft_registration, aircraftTypeId: bid.aircraft_type_id, legs: result.legs }).catch(() => {});
    res.status(201).json({ bid: serializeBid(updated, req), crewWarnings: result.crewWarnings?.length ? result.crewWarnings : undefined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/bids/:id/approve', requirePermission('if_live.bids.approve'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.status !== 'pending') return res.status(400).json({ error: `This bid is already ${bid.status}` });

    const bidPilot = await pb.collection('users').getOne(bid.pilot, { fields: 'if_user_id', requestKey: null }).catch(() => null);
    const { legs, crewWarnings } = await createLiveSchedulesForBid({
      organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs: bid.legs || [], crew: bid.crew || [],
      captain: { ifUserId: bidPilot?.if_user_id },
    });

    const updated = await pb.collection('if_live_bids').update(bid.id, { legs, status: 'active' });
    res.json({ bid: updated, crewWarnings: crewWarnings.length ? crewWarnings : undefined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/bids/:id/deny', requirePermission('if_live.bids.approve'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.status !== 'pending') return res.status(400).json({ error: `This bid is already ${bid.status}` });
    const updated = await pb.collection('if_live_bids').update(bid.id, { status: 'denied', review_note: (req.body?.reason || '').slice(0, 500) });
    res.json({ bid: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const EARLY_RELEASE_MIN_MS = 10 * 60 * 1000; // not worth a message for less
function zuluHHMM(d) {
  const t = new Date(d);
  return `${String(t.getUTCHours()).padStart(2, '0')}${String(t.getUTCMinutes()).padStart(2, '0')}Z`;
}
function legHoldStart(leg, bid) {
  return new Date(leg.holdStartUtc || leg.departureUtc || String(bid.created).replace(' ', 'T')).getTime();
}
async function notifyNextBookingOfEarlyRelease(pb, bid, landedLeg, landedPilot, reason = 'landed') {
  const others = await pb.collection('if_live_bids').getFullList({
    filter: `aircraft_id = "${escFilterValue(bid.aircraft_id)}" && status = "active" && id != "${escFilterValue(bid.id)}"`,
    requestKey: null,
  });
  let next = null;
  for (const b of others) {
    const leg = (b.legs || []).find(l => !l.pirepId && !l.expired);
    if (!leg) continue;
    const start = legHoldStart(leg, b);
    if (!next || start < next.start) next = { bid: b, leg, start };
  }
  if (!next || next.bid.pilot === bid.pilot) return;
  if (next.start - Date.now() < EARLY_RELEASE_MIN_MS) return; // it wasn't really waiting

  const nextPilot = await pb.collection('users').getOne(next.bid.pilot, { fields: 'first_name,last_name,discord_id', requestKey: null }).catch(() => null);
  await notifyEarlyRelease({
    nextPilot, landedPilot, aircraftRegistration: bid.aircraft_registration,
    landedAt: reason === 'dropped' ? landedLeg.originIcao : landedLeg.destIcao, nextLeg: next.leg, waitedUntil: next.start, reason,
  });
}

router.patch('/bids/:id/time', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who made this booking, or an admin, can change it' });
    }
    if (bid.status !== 'active') return res.status(400).json({ error: `This booking is ${bid.status}` });
    const legs = (bid.legs || []).map(l => ({ ...l }));
    if (legs.some(l => l.pirepId || l.expired)) return res.status(400).json({ error: "Part of this booking has already been flown, so its time can't change" });
    if (legs.some(l => isTimelessLeg(l))) return res.status(400).json({ error: "This booking isn't at a set time. You can fly it whenever it's free." });

    const newDep = new Date(req.body.departureUtc).getTime();
    if (!Number.isFinite(newDep)) return res.status(400).json({ error: 'Choose a departure time' });
    if (newDep < Date.now() - 60 * 1000) return res.status(400).json({ error: "That time has already passed" });
    const delta = newDep - new Date(legs[0].departureUtc).getTime();
    for (const l of legs) {
      l.departureUtc = new Date(new Date(l.departureUtc).getTime() + delta).toISOString();
      l.arrivalUtc = new Date(new Date(l.arrivalUtc).getTime() + delta).toISOString();
    }

    const originalStart = legHoldStart(bid.legs[0], bid);
    const check = await checkBidRequest(pb, bid.pilot, {
      organizationId: bid.organization_id, aircraftId: bid.aircraft_id, legs, excludeBidId: bid.id, aheadOf: originalStart + 60 * 1000,
    });
    if (check.error) return res.status(check.status).json({ error: check.error });
    legs.forEach((l, i) => {
      l.holdStartUtc = l.departureUtc;
      l.deadlineUtc = deadlineForLeg(l, i, check.startAt, legs[i - 1]?.deadlineUtc);
      delete l.warned1h;
      delete l.windowStartUtc;
    });

    // Not into a booking queued after this one.
    const others = await pb.collection('if_live_bids').getFullList({
      filter: `aircraft_id = "${escFilterValue(bid.aircraft_id)}" && status = "active" && id != "${escFilterValue(bid.id)}"`,
      requestKey: null,
    });
    const oldEnd = Math.max(...(bid.legs || []).map(l => new Date(l.deadlineUtc).getTime()));
    const behind = others.flatMap(b => (b.legs || []).filter(l => !l.pirepId && !l.expired).map(l => legHoldStart(l, b)))
      .filter(t => t >= oldEnd - 60 * 1000);
    const newEnd = new Date(legs[legs.length - 1].deadlineUtc).getTime();
    if (behind.length && newEnd > Math.min(...behind)) {
      return res.status(409).json({ error: `Someone has booked this aircraft from ${zuluHHMM(Math.min(...behind))}, so it can't be held that late. Choose an earlier time.` });
    }

    const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
    if (!serviceUserId) return res.status(503).json({ error: "The Live organisation isn't connected right now, so the schedule can't be changed" });
    for (const l of legs.filter(x => x.ifScheduleId)) {
      await ifLiveWrite(serviceUserId, 'PUT', `/live/schedules/${encodeURIComponent(l.ifScheduleId)}`, schedulePayloadForLeg(l));
    }
    invalidateAircraftSchedulesCache(bid.aircraft_id);
    const updated = await pb.collection('if_live_bids').update(bid.id, { legs }, { expand: 'pilot' });
    res.json({ bid: serializeBid(updated, req) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/bids/:id', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who placed this bid, or an admin, can cancel it' });
    }

    if (bid.status === 'active') {
      const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
      if (serviceUserId) {
        await Promise.allSettled((bid.legs || [])
          .filter(l => l.ifScheduleId)
          .map(l => ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(l.ifScheduleId)}`)));
        invalidateAircraftSchedulesCache(bid.aircraft_id);
      }
    }

    await pb.collection('if_live_bids').update(req.params.id, { status: 'cancelled' });
    res.json({ cancelled: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const MAX_CREW_TOTAL = 3;

router.get('/crew-candidates', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const users = await pb.collection('users').getFullList({
      filter: '(role = "admin" || staff_role != "" || live_access = true) && if_user_id != ""',
      fields: 'id,first_name,callsign,if_user_id,if_username',
      sort: 'first_name',
      requestKey: null,
    });
    res.json({
      candidates: users
        .filter(u => u.id !== req.user.id)
        .map(u => ({ id: u.id, name: u.first_name || 'Pilot', callsign: u.callsign || null, ifUsername: u.if_username || null })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CREW_ROLE_CAPTAIN = 0;
const CREW_ROLE_FIRST_OFFICER = 1;
async function applyCrewToLegs(serviceUserId, legs, ifUserId, role = CREW_ROLE_FIRST_OFFICER) {
  await Promise.all((legs || [])
    .filter(l => l.ifScheduleId)
    .map(l => ifLiveWrite(serviceUserId, 'PUT', `/live/schedules/${encodeURIComponent(l.ifScheduleId)}/crew/${encodeURIComponent(ifUserId)}`, { role })));
}

async function removeCrewFromLegs(serviceUserId, legs, ifUserId) {
  await Promise.allSettled((legs || [])
    .filter(l => l.ifScheduleId)
    .map(l => ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(l.ifScheduleId)}/crew/${encodeURIComponent(ifUserId)}`)));
}

router.post('/bids/:id/crew', requireLiveAccess, async (req, res) => {
  const { pilotId } = req.body;
  if (!pilotId) return res.status(400).json({ error: 'pilotId required' });
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who placed this bid, or an admin, can manage its crew' });
    }
    if (!['pending', 'active'].includes(bid.status)) {
      return res.status(400).json({ error: `Crew can't be changed on a bid that's ${bid.status}` });
    }
    if (pilotId === bid.pilot) {
      return res.status(400).json({ error: 'The pilot who placed this booking is already its captain' });
    }

    const crew = bid.crew || [];
    if (crew.some(c => c.pilotId === pilotId)) {
      return res.status(409).json({ error: 'This pilot is already crew on this booking' });
    }
    if (crew.length + 1 >= MAX_CREW_TOTAL) {
      return res.status(400).json({ error: `Infinite Flight caps a schedule's crew at ${MAX_CREW_TOTAL} — this booking is full` });
    }

    const invited = await pb.collection('users').getOne(pilotId, { requestKey: null });
    if (!invited.if_user_id) {
      return res.status(400).json({ error: `${invited.first_name || 'This pilot'} hasn't connected a real Infinite Flight account yet, so they can't be added as crew` });
    }

    if (bid.status === 'active') {
      const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
      if (!serviceUserId) {
        return res.status(503).json({ error: "No connected Infinite Flight Live account is set as this organization's default yet" });
      }
      await applyCrewToLegs(serviceUserId, bid.legs || [], invited.if_user_id);
    }

    const newEntry = { pilotId: invited.id, ifUserId: invited.if_user_id, ifUsername: invited.if_username || null, name: invited.first_name || null, role: 1 };
    const updated = await pb.collection('if_live_bids').update(bid.id, { crew: [...crew, newEntry] });
    res.status(201).json({ bid: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/bids/:id/crew/:pilotId', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who placed this bid, or an admin, can manage its crew' });
    }
    const crew = bid.crew || [];
    const entry = crew.find(c => c.pilotId === req.params.pilotId);
    if (!entry) return res.status(404).json({ error: 'That pilot is not crew on this booking' });

    if (bid.status === 'active') {
      const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
      if (serviceUserId) {
        await removeCrewFromLegs(serviceUserId, bid.legs || [], entry.ifUserId);
      }
    }

    const updated = await pb.collection('if_live_bids').update(bid.id, { crew: crew.filter(c => c.pilotId !== req.params.pilotId) });
    res.json({ bid: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const FLEET_NAMES_TTL = 5 * 60 * 1000;
const ORG_AIRCRAFT_TTL = 10 * 60 * 1000;

async function fleetNamesById() {
  return cachedTtl('fleet-names', async () => {
    const pb = await getAdminClient();
    const fleet = await pb.collection('fleet').getFullList({ fields: 'name,aircraft_id,livery_id', requestKey: null });
    const map = {};
    for (const f of fleet) {
      if (f.aircraft_id && !map[f.aircraft_id]) map[f.aircraft_id] = f.name;
      if (f.livery_id) map[f.livery_id] = f.name;
    }
    return map;
  }, FLEET_NAMES_TTL);
}

// { 'IF-RUIA': '<IF livery id>', … } for the org, read with its service account
async function orgAircraftIdsByRegistration(organizationId) {
  const orgId = organizationId || ALLOWED_ORG_IDS[0];
  if (!orgId) return {};
  return cachedTtl(`org-aircraft-regs:${orgId}`, async () => {
    const serviceUserId = await getServiceUserIdForOrg(orgId);
    if (!serviceUserId) return {};
    const list = await ifLiveRequest(serviceUserId, `/live/organizations/${encodeURIComponent(orgId)}/aircraft`);
    return Object.fromEntries((list || []).filter(a => a.registration).map(a => [a.registration.toUpperCase(), a.aircraftId]));
  }, ORG_AIRCRAFT_TTL);
}

async function fleetNameForLiveAircraft({ registration, aircraftTypeId, liveryId, organizationId }) {
  const names = await fleetNamesById().catch(() => ({}));
  for (const id of [liveryId, aircraftTypeId]) {
    if (id && names[id]) return names[id];
  }
  let ifId = liveryId || aircraftTypeId || null;
  if (!ifId && registration) {
    const regs = await orgAircraftIdsByRegistration(organizationId).catch(() => ({}));
    ifId = regs[String(registration).toUpperCase()] || null;
    if (ifId && names[ifId]) return names[ifId];
  }
  // Not in the fleet collection: IF's own catalog name, in the fleet's format
  const lv = ifId ? lookupLivery(ifId) : null;
  return lv ? `${lv.aircraftName} - ${lv.liveryName}` : null;
}

const LIVE_MATCH_MAX_AGE_HOURS_EXACT    = 36;
const LIVE_MATCH_MAX_AGE_HOURS_FALLBACK = 2;

function liveMatchOpts(bid) {
  const exactAircraftId = bid.aircraft_type_id || null;
  const exactLiveryId   = bid.livery_id || null;
  const maxAgeHours = (exactAircraftId || exactLiveryId)
    ? LIVE_MATCH_MAX_AGE_HOURS_EXACT
    : LIVE_MATCH_MAX_AGE_HOURS_FALLBACK;
  return { exactAircraftId, exactLiveryId, maxAgeHours };
}

async function getConsumedFlightTimestamps(pb, pilotId) {
  const consumed = new Set();
  try {
    const bids = await pb.collection('if_live_bids').getFullList({
      filter: `pilot = "${escFilterValue(pilotId)}"`,
      requestKey: null,
    });
    for (const b of bids) {
      for (const l of (b.legs || [])) {
        if (l.pirepId && l.matchedFlightCreated) consumed.add(l.matchedFlightCreated);
      }
    }
  } catch (err) {
    console.warn('[if-live] getConsumedFlightTimestamps failed:', err.message);
  }
  return consumed;
}

async function matchLandedLeg(pb, bid, leg, pilot, { excludeCreated, fleetItems = null } = {}) {
  const { exactAircraftId, exactLiveryId, maxAgeHours } = liveMatchOpts(bid);
  return tryAutoApprove(pb, {
    aircraft:       bid.aircraft_registration || '',
    departure_icao: leg.originIcao,
    arrival_icao:   leg.destIcao,
    flight_time:    null,
  }, pilot, { skipDateWindow: true, maxAgeHours, exactAircraftId, exactLiveryId, excludeCreated, fleetItems });
}

async function attemptFilePirep(pb, bid, legIndex, opts = {}) {
  const legs = bid.legs || [];
  const leg = legs[legIndex];
  if (!leg) { const e = new Error('No such leg on this bid'); e.status = 404; throw e; }
  if (!leg.ifScheduleId) { const e = new Error('This leg was never scheduled in Infinite Flight Live'); e.status = 400; throw e; }
  if (leg.pirepId) { const e = new Error('A PIREP has already been filed for this leg'); e.status = 400; throw e; }

  const pilot = opts.pilot || await pb.collection('users').getOne(bid.pilot, { requestKey: null });

  const { exactAircraftId, exactLiveryId } = liveMatchOpts(bid);
  const excludeCreated = opts.excludeCreated || await getConsumedFlightTimestamps(pb, bid.pilot);
  const autoResult = await tryAutoApprove(pb, {
    aircraft:       bid.aircraft_registration || '',
    departure_icao: leg.originIcao,
    arrival_icao:   leg.destIcao,
    flight_time:    null,
  }, pilot, {
    skipDateWindow: true,
    maxAgeHours: opts.maxAgeHours || null,
    fleetItems: opts.fleetItems || null,
    exactAircraftId, exactLiveryId,
    excludeCreated,
  });

  if (!autoResult.matched) {
    return { matched: false, checks: autoResult.checks };
  }

  const flightTimeHours = parseFloat((autoResult.bestCandidate.totalTime / 60).toFixed(2));

  const registration = bid.aircraft_registration || '';
  const aircraftName = await fleetNameForLiveAircraft({
    registration, aircraftTypeId: bid.aircraft_type_id, liveryId: bid.livery_id, organizationId: bid.organization_id,
  }).catch(() => null) || registration;

  const flight = await pb.collection('flights').create({
    flight_number:   leg.flightNumber || '',
    departure_icao:  leg.originIcao,
    arrival_icao:    leg.destIcao,
    aircraft:        aircraftName,
    registration,
    flight_time:     flightTimeHours,
    date:            new Date().toISOString().slice(0, 10),
    notes:           (opts.notes || '').slice(0, 1000),
    user:            bid.pilot,
    status:          'approved',
    auto_approved:   true,
    is_live:         true,
    fuel_used_kg:    autoResult.fuelUsedKg ?? null,
    landing_stats:   autoResult.landingStats?.length ? JSON.stringify(autoResult.landingStats) : null,
  });

  // Same pilot-stats side effects a normal auto-approved PIREP triggers.
  const oldHours = pilot.total_hours || 0;
  const newHours = parseFloat((oldHours + flightTimeHours).toFixed(4));
  await updateUserStats(pb, bid.pilot, (pilot.total_flights || 0) + 1, newHours);
  checkRankUp(pb, bid.pilot, oldHours, newHours).catch(() => {});
  updateVaStats(pb, {
    total_flights: 1,
    total_hours: flightTimeHours,
    total_distance_nm: distanceBetween(leg.originIcao, leg.destIcao) || 0,
    total_approved_pireps: 1,
    total_auto_approved: 1,
  }).catch(() => {});
  dailyStats.recordFlight(pb, {
    date: flight.date, flightTime: flightTimeHours, autoApproved: true, multiplied: false,
    departureIcao: leg.originIcao, arrivalIcao: leg.destIcao,
    aircraft: aircraftName, userId: bid.pilot,
  }).catch(err => console.error('[daily_stats] record failed:', err.message));

  if (pilot.activity_warned_at) {
    adminPatch(bid.pilot, { activity_warned_at: null, activity_thread_id: null }).catch(() => {});
    resolveActivityWarning(pilot).catch(() => {});
  }

  notifyUser(bid.pilot, {
    title: '✅ Live PIREP Auto-Approved',
    body: `Your flight ${leg.flightNumber || ''} was verified via Infinite Flight!`,
    url: '/logbook',
    icon: brand.appIcon,
  }).catch(() => {});
  notifyPirepFiled({ pilot, flight: { ...flight, status: 'approved', flight_time: flightTimeHours }, auto_approved: true }).catch(() => {});
  matchChallengeOnApproval(pb, { ...flight, status: 'approved' }).catch(err =>
    console.error('[challenges] matchChallengeOnApproval failed:', err.message)
  );

  leg.pirepId = flight.id;
  leg.pirepFlightTime = flightTimeHours;
  leg.loggedAt = new Date().toISOString();
  leg.matchedFlightCreated = autoResult.bestCandidate?.created || null;

  const allTerminal = legs.every(l => l.pirepId || l.expired);
  leg.releasedAtUtc = new Date().toISOString();
  const updated = await pb.collection('if_live_bids').update(bid.id, {
    legs,
    ...(allTerminal ? { status: 'completed' } : { status: 'active' }),
  });
  if (allTerminal) {
    notifyNextBookingOfEarlyRelease(pb, bid, leg, pilot).catch(err => console.warn('[if-live] early-release notice failed:', err.message));
  }

  (async () => {
    let nextLeg = legs.find(l => l !== leg && !l.pirepId && !l.expired) || null;
    if (!nextLeg) {
      const otherBids = await pb.collection('if_live_bids').getFullList({
        filter: `aircraft_id = "${escFilterValue(bid.aircraft_id)}" && (status = "active" || status = "pending") && id != "${escFilterValue(bid.id)}"`,
        sort: 'created',
        requestKey: null,
      });
      nextLeg = otherBids.flatMap(b => b.legs || []).find(l => !l.pirepId && !l.expired) || null;
    }
    await notifyAircraftLanded({
      pilot, leg, aircraftRegistration: bid.aircraft_registration, aircraftTypeId: bid.aircraft_type_id,
      availableToBook: !nextLeg, nextLeg, flightTimeHours,
      landingStats: autoResult.landingStats, fuelUsedKg: autoResult.fuelUsedKg,
    });
  })().catch(() => {});

  return { matched: true, flight, bid: updated };
}

const EXTEND_STEP_MS = 60 * 60 * 1000;
const EXTEND_MAX = 3;

async function extendBlocker(pb, bid, legIndex) {
  const leg = (bid.legs || [])[legIndex];
  if (!leg) return 'That leg is no longer on the booking';
  if (bid.status !== 'active') return `This booking is ${bid.status}`;
  if (leg.pirepId) return 'This flight is already filed';
  if (leg.expired) return 'This flight has already been closed';
  if (!leg.startedAt) return 'You can extend once the flight has started';
  if (!leg.deadlineUtc) return "This flight doesn't have a deadline to extend";
  if ((leg.extensions || 0) >= EXTEND_MAX) return `This flight has already been extended ${EXTEND_MAX} times`;
  if ((bid.legs || []).slice(legIndex + 1).some(l => !l.pirepId && !l.expired && !isTimelessLeg(l))) {
    return 'A later leg on your booking has a set departure time, so this one can\'t move';
  }
  const others = await pb.collection('if_live_bids').getFullList({
    filter: `aircraft_id = "${escFilterValue(bid.aircraft_id)}" && (status = "active" || status = "pending") && id != "${escFilterValue(bid.id)}"`,
    requestKey: null,
  });
  if (others.some(b => b.status === 'pending' || (b.legs || []).some(l => !l.pirepId && !l.expired))) {
    return `${bid.aircraft_registration || 'The aircraft'} is booked by someone after you, so it can't be extended`;
  }
  return null;
}

async function extendLeg(pb, bid, legIndex) {
  const blocker = await extendBlocker(pb, bid, legIndex);
  if (blocker) { const e = new Error(blocker); e.status = 409; throw e; }
  const legs = (bid.legs || []).map(l => ({ ...l }));
  const leg = legs[legIndex];
  leg.deadlineUtc = new Date(new Date(leg.deadlineUtc).getTime() + EXTEND_STEP_MS).toISOString();
  leg.extensions = (leg.extensions || 0) + 1;
  delete leg.warnedLand1h;
  // The pilot's own later legs keep their place in the queue
  for (let i = legIndex + 1; i < legs.length; i++) {
    const l = legs[i];
    if (l.pirepId || l.expired) continue;
    if (l.holdStartUtc) l.holdStartUtc = new Date(new Date(l.holdStartUtc).getTime() + EXTEND_STEP_MS).toISOString();
    if (l.deadlineUtc) l.deadlineUtc = new Date(new Date(l.deadlineUtc).getTime() + EXTEND_STEP_MS).toISOString();
  }
  const updated = await pb.collection('if_live_bids').update(bid.id, { legs });
  // The 1 HOUR LEFT TO LAND message, if it was sent, now shows the new deadline
  if (leg.landWarnMessageId && leg.landWarnChannelId) {
    const { markWarningExtended } = require('../services/landingPrompt');
    markWarningExtended({ channelId: leg.landWarnChannelId, messageId: leg.landWarnMessageId }, { bid: updated, legIndex })
      .catch(err => console.warn('[if-live] couldn\'t update the landing warning:', err.message));
  }
  return { bid: updated, leg, extensionsLeft: EXTEND_MAX - leg.extensions };
}

// POST /api/if-live/bids/:id/legs/:legIndex/extend
router.post('/bids/:id/legs/:legIndex/extend', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });
    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who booked this can extend it' });
    }
    const result = await extendLeg(pb, bid, parseInt(req.params.legIndex, 10));
    res.json({ deadlineUtc: result.leg.deadlineUtc, extensionsLeft: result.extensionsLeft, bid: result.bid });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/bids/:id/legs/:legIndex/file-pirep', requireLiveAccess, async (req, res) => {
  const legIndex = parseInt(req.params.legIndex, 10);

  try {
    const pb = await getAdminClient();
    const bid = await pb.collection('if_live_bids').getOne(req.params.id, { requestKey: null });

    if (bid.pilot !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the pilot who placed this bid can file its PIREP' });
    }
    if (bid.status === 'pending') return res.status(400).json({ error: "This bid hasn't been approved yet" });
    if (bid.status === 'denied' || bid.status === 'cancelled') {
      return res.status(400).json({ error: `This bid was ${bid.status} — no PIREP can be filed against it` });
    }

    const result = await attemptFilePirep(pb, bid, legIndex, { notes: req.body?.notes });
    if (!result.matched) {
      return res.status(422).json({
        error: "Couldn't find this flight in your Infinite Flight logbook yet — make sure your IF account is linked and try again in a few minutes.",
        checks: result.checks,
      });
    }
    res.status(201).json({ bid: result.bid, flight: result.flight });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function countedLegs(bid) {
  return (bid.legs || []).filter(l => l.pirepId);
}

router.get('/stats/mine', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bids = await pb.collection('if_live_bids').getFullList({
      filter: `pilot = "${escFilterValue(req.user.id)}"`,
      requestKey: null,
    });
    let flights = 0, hours = 0;
    for (const bid of bids) {
      for (const leg of countedLegs(bid)) {
        flights++;
        hours += leg.pirepFlightTime || 0;
      }
    }
    res.json({ flights, hours: Math.round(hours * 10) / 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/members', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const devIds = await getDeveloperIds(pb);
    const devFilter = [...devIds].map(id => `id = "${escFilterValue(id)}"`).join(' || ');
    const filter = 'role = "admin" || staff_role != "" || live_access = true' + (devFilter ? ` || ${devFilter}` : '');
    const [users, roles, ranks] = await Promise.all([
      pb.collection('users').getFullList({
        filter,
        fields: 'id,first_name,callsign,ifc_username,rank,role,staff_role,live_access',
        sort: 'first_name',
        requestKey: null,
      }),
      pb.collection('roles').getFullList({ fields: 'id,name,color', requestKey: null }),
      pb.collection('ranks').getFullList({ fields: 'id,name', requestKey: null }),
    ]);
    await tagDevelopers(pb, users);
    const roleById = new Map(roles.map(r => [r.id, r]));
    const rankNameById = new Map(ranks.map(r => [r.id, r.name]));
    const members = users.map(u => {
      const role = u.staff_role ? roleById.get(u.staff_role) : null;
      return {
        id: u.id,
        name: u.first_name || 'Pilot',
        callsign: u.callsign || null,
        ifcUsername: u.ifc_username || null,
        rank: u.rank ? (rankNameById.get(u.rank) || null) : null,
        isStaff: !!u.staff_role || (u.role === 'admin' && !u.is_developer),
        staffRole: role?.name || (u.role === 'admin' && !u.is_developer ? 'Admin' : null),
        staffRoleColor: role?.color || null,
        liveAccess: !!u.live_access,
        isDeveloper: !!u.is_developer,
      };
    });
    // Staff first, then alphabetical within each group.
    members.sort((a, b) => (b.isStaff - a.isStaff) || a.name.localeCompare(b.name));
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/leaderboard', requireLiveAccess, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const bids = await pb.collection('if_live_bids').getFullList({
      expand: 'pilot',
      requestKey: null,
    });
    const byPilot = new Map();
    for (const bid of bids) {
      const legs = countedLegs(bid);
      if (!legs.length) continue;
      const pilot = bid.expand?.pilot;
      const key = bid.pilot;
      if (!byPilot.has(key)) {
        byPilot.set(key, {
          pilotId: key,
          callsign: pilot?.callsign || null,
          name: pilot ? `${pilot.first_name || ''} ${pilot.last_name || ''}`.trim() : 'Unknown pilot',
          flights: 0,
          hours: 0,
        });
      }
      const entry = byPilot.get(key);
      for (const leg of legs) {
        entry.flights++;
        entry.hours += leg.pirepFlightTime || 0;
      }
    }
    const leaderboard = [...byPilot.values()]
      .map(e => ({ ...e, hours: Math.round(e.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let aircraftStatsMemo = null; // { data, expires } | { pending }
router.get('/stats/aircraft', requireLiveAccess, async (req, res) => {
  try {
    if (!aircraftStatsMemo || (aircraftStatsMemo.expires && aircraftStatsMemo.expires < Date.now())) {
      const pending = buildAircraftStats();
      aircraftStatsMemo = { pending };
      pending.then(data => { aircraftStatsMemo = { data, expires: Date.now() + 5 * 60 * 1000 }; })
        .catch(() => { aircraftStatsMemo = null; });
    }
    res.json({ aircraft: aircraftStatsMemo.data || await aircraftStatsMemo.pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function buildAircraftStats() {
  const pb = await getAdminClient();
  const [bids, flights] = await Promise.all([
    pb.collection('if_live_bids').getFullList({ fields: 'aircraft_id,pilot,legs', requestKey: null }),
    pb.collection('flights').getFullList({ filter: 'is_live = true', fields: 'id,landing_stats', requestKey: null }),
  ]);
  // touchdown fpm per PIREP: IF's verticalSpeed is m/s, the last landing counts
  const fpmByFlight = new Map();
  for (const f of flights) {
    const stats = typeof f.landing_stats === 'string' ? JSON.parse(f.landing_stats || '[]') : (f.landing_stats || []);
    const vs = stats.at(-1)?.verticalSpeed;
    if (Number.isFinite(vs)) fpmByFlight.set(f.id, Math.abs(vs) * 196.85);
  }
  const byAircraft = {};
  for (const bid of bids) {
    for (const leg of countedLegs(bid)) {
      const a = (byAircraft[bid.aircraft_id] ||= { legs: 0, hours: 0, pilots: new Set(), routes: {}, lastFlown: null, fpm: [] });
      a.legs++;
      a.hours += leg.pirepFlightTime || 0;
      a.pilots.add(bid.pilot);
      const route = `${leg.originIcao}-${leg.destIcao}`;
      a.routes[route] = (a.routes[route] || 0) + 1;
      if (leg.loggedAt && (!a.lastFlown || leg.loggedAt > a.lastFlown)) a.lastFlown = leg.loggedAt;
      if (fpmByFlight.has(leg.pirepId)) a.fpm.push(fpmByFlight.get(leg.pirepId));
    }
  }
  const out = {};
  for (const [id, a] of Object.entries(byAircraft)) {
    const [topRoute, topCount] = Object.entries(a.routes).sort((x, y) => y[1] - x[1])[0];
    out[id] = {
      legs: a.legs,
      hours: Math.round(a.hours * 10) / 10,
      pilots: a.pilots.size,
      // only worth calling a favourite once it's been flown more than once
      topRoute: topCount > 1 ? { route: topRoute, count: topCount } : null,
      lastFlown: a.lastFlown,
      avgFpm: a.fpm.length ? Math.round(a.fpm.reduce((s, v) => s + v, 0) / a.fpm.length) : null,
    };
  }
  return out;
}

let overviewMemo = null; // { data, expires } | { pending }
router.get('/stats/overview', requireLiveAccess, async (req, res) => {
  try {
    if (!overviewMemo || (overviewMemo.expires && overviewMemo.expires < Date.now())) {
      const pending = buildOverview();
      overviewMemo = { pending };
      pending.then(data => { overviewMemo = { data, expires: Date.now() + 5 * 60 * 1000 }; })
        .catch(() => { overviewMemo = null; });
    }
    res.json(overviewMemo.data || await overviewMemo.pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function buildOverview() {
  const pb = await getAdminClient();
  const [bids, flights] = await Promise.all([
    pb.collection('if_live_bids').getFullList({ fields: 'aircraft_id,aircraft_registration,aircraft_type_id,pilot,legs,expand.pilot.first_name,expand.pilot.last_name,expand.pilot.callsign', expand: 'pilot', requestKey: null }),
    pb.collection('flights').getFullList({ filter: 'is_live = true', fields: 'id,landing_stats', requestKey: null }),
  ]);
  const landingByFlight = new Map();
  for (const f of flights) {
    const stats = typeof f.landing_stats === 'string' ? JSON.parse(f.landing_stats || '[]') : (f.landing_stats || []);
    const last = stats.at(-1);
    if (Number.isFinite(last?.verticalSpeed)) landingByFlight.set(f.id, { fpm: Math.round(Math.abs(last.verticalSpeed) * 196.85), g: last.maxGForce || null });
  }

  const pilotName = p => (p ? `${p.first_name || ''}${p.last_name ? ` ${p.last_name[0]}.` : ''}`.trim() : 'Unknown pilot');
  const totals = { flights: 0, hours: 0 };
  const pilots = new Map(), aircraft = new Map(), routes = new Map(), airports = new Map();
  const landings = [];
  const bump = (map, key, init) => { if (!map.has(key)) map.set(key, init()); return map.get(key); };

  for (const bid of bids) {
    const p = bid.expand?.pilot;
    for (const leg of countedLegs(bid)) {
      const hours = leg.pirepFlightTime || 0;
      totals.flights++;
      totals.hours += hours;
      const pe = bump(pilots, bid.pilot, () => ({ name: pilotName(p), callsign: p?.callsign || null, flights: 0, hours: 0 }));
      pe.flights++; pe.hours += hours;
      const ae = bump(aircraft, bid.aircraft_id, () => ({ registration: bid.aircraft_registration, type: lookupLivery(bid.aircraft_type_id)?.aircraftName || null, flights: 0, hours: 0 }));
      ae.flights++; ae.hours += hours;
      // older bookings didn't store the type, so take it from any that did
      ae.type ||= lookupLivery(bid.aircraft_type_id)?.aircraftName || null;
      const re = bump(routes, `${leg.originIcao}-${leg.destIcao}`, () => ({ from: leg.originIcao, to: leg.destIcao, flights: 0 }));
      re.flights++;
      for (const icao of [leg.originIcao, leg.destIcao]) bump(airports, icao, () => ({ icao, visits: 0 })).visits++;
      const landing = landingByFlight.get(leg.pirepId);
      if (landing) landings.push({ ...landing, pilot: pilotName(p), registration: bid.aircraft_registration, airport: leg.destIcao, date: leg.loggedAt || null });
    }
  }

  const round1 = n => Math.round(n * 10) / 10;
  const place = icao => { const a = lookupAirport(icao); return a ? { lat: a.lat, lng: a.lng, city: a.city ? a.city.replace(/\s*\(.*\)\s*$/, '') : null } : null; };
  const byHours = (a, b) => b.hours - a.hours;
  const airportList = [...airports.values()].map(a => ({ ...a, ...place(a.icao) })).sort((a, b) => b.visits - a.visits);
  const routeList = [...routes.values()].sort((a, b) => b.flights - a.flights);
  return {
    totals: {
      flights: totals.flights,
      hours: round1(totals.hours),
      pilots: pilots.size,
      aircraft: aircraft.size,
      airports: airports.size,
      avgFpm: landings.length ? Math.round(landings.reduce((s, l) => s + l.fpm, 0) / landings.length) : null,
    },
    airports: airportList.filter(a => a.lat != null),
    routes: routeList,
    topAircraft: [...aircraft.values()].sort(byHours).slice(0, 5).map(a => ({ ...a, hours: round1(a.hours) })),
    topPilots: [...pilots.values()].sort(byHours).slice(0, 5).map(p => ({ ...p, hours: round1(p.hours) })),
    topRoutes: routeList.slice(0, 5),
    topAirports: airportList.slice(0, 5).map(({ icao, city, visits }) => ({ icao, city, visits })),
    smoothest: landings.sort((a, b) => a.fpm - b.fpm).slice(0, 5),
  };
}

module.exports = router;
module.exports.getServiceUserIdForOrg = getServiceUserIdForOrg;
module.exports.ifLiveWrite = ifLiveWrite;
module.exports.invalidateAircraftSchedulesCache = invalidateAircraftSchedulesCache;
module.exports.attemptFilePirep = attemptFilePirep;
module.exports.matchLandedLeg = matchLandedLeg;
module.exports.liveMatchOpts = liveMatchOpts;
module.exports.getConsumedFlightTimestamps = getConsumedFlightTimestamps;
module.exports.setAircraftStatus = setAircraftStatus;
module.exports.getAircraftStatus = getAircraftStatus;
module.exports.clearAircraftStatus = clearAircraftStatus;
module.exports.ifLiveRequest = ifLiveRequest;
module.exports.getAllServerFlightIds = getAllServerFlightIds;
module.exports.orgPositions = orgPositions;
module.exports.fleetStatus = fleetStatus;
module.exports.ALLOWED_ORG_IDS = ALLOWED_ORG_IDS;
module.exports.schedulePayloadForLeg = schedulePayloadForLeg;
module.exports.deadlineForLeg = deadlineForLeg;
module.exports.startedDeadline = startedDeadline;
module.exports.START_WINDOW_MS = START_WINDOW_MS;
module.exports.MAX_BOOKINGS_PER_PILOT = MAX_BOOKINGS_PER_PILOT;
module.exports.checkBidRequest = checkBidRequest; // exported for tests
module.exports.isTimelessLeg = isTimelessLeg;
module.exports.checkBidRequest = checkBidRequest;
module.exports.notifyNextBookingOfEarlyRelease = notifyNextBookingOfEarlyRelease;
// For the Live Mode admin tab (routes/ifLiveAdmin.js)
module.exports.createLiveSchedulesForBid = createLiveSchedulesForBid;
module.exports.applyCrewToLegs = applyCrewToLegs;
module.exports.CREW_ROLE_CAPTAIN = CREW_ROLE_CAPTAIN;
// Extend a started leg by an hour (Fly page, and the bot's Extend button)
module.exports.extendBlocker = extendBlocker;
module.exports.extendLeg = extendLeg;
module.exports.EXTEND_MAX = EXTEND_MAX;
module.exports.countedLegs = countedLegs;
module.exports.fleetNameForLiveAircraft = fleetNameForLiveAircraft;
