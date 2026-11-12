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
const jwt = require('jsonwebtoken');
const PocketBase = require('pocketbase/cjs');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAuth } = require('../middleware/auth');
const { escFilterValue } = require('../utils/pbFilter');

const { notifyRegistration } = require('./discord');
const router = express.Router();

const IF_BASE = 'https://api.infiniteflight.com/public/v2';

async function lookupIfUserId(discourseUsername) {
  if (!discourseUsername || !process.env.IF_API_KEY) return null;
  try {
    const res = await fetch(`${IF_BASE}/users?apikey=${process.env.IF_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discourseNames: [discourseUsername] }),
    });
    const data = await res.json();
    if (data.errorCode !== 0 || !data.result?.length) return null;
    const match = data.result.find(u => u.discourseUsername?.toLowerCase() === discourseUsername.toLowerCase());
    return match?.userId || null;
  } catch (err) {
    console.warn('[signup] IF lookup failed:', err.message);
    return null;
  }
}

const ACCOUNT_STATUS_MESSAGES = {
  pending:  'Your account is pending approval. Contact admin.',
  rejected: 'Your account has been rejected. Contact admin.',
  archived: 'Account archived, please contact a staff member.',
};

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      callsign: user.callsign,
      status: user.status,
      staff_role: user.staff_role || '',
      live_access: user.live_access || false,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(record) {
  return {
    id: record.id,
    email: record.email,
    first_name: record.first_name,
    last_name: record.last_name,
    callsign: record.callsign,
    ifc_username: record.ifc_username,
    role: record.role,
    status: record.status,
    total_flights: record.total_flights,
    total_hours: record.total_hours,
    if_user_id:       record.if_user_id,
    discord_id:       record.discord_id || '',
    discord_username: record.discord_username || '',
    created:          record.created,
    staff_role:       record.staff_role || '',
    live_access:      record.live_access || false,
    recruitment_status: record.recruitment_status || 'applied',
    activity_warned_at:   record.activity_warned_at   || null,
    must_change_password:  record.must_change_password  || false,
    onboarding_complete:   record.onboarding_complete   || false,
    has_imported_history:  record.has_imported_history  || false,
    tos_accepted_at:       record.tos_accepted_at        || null,
    if_verified:           record.if_verified            || false,
  };
}

async function buildLoginResponse(pb, user) {
  const token = signToken(user);
  const safeU = safeUser(user);
  if (user.staff_role) {
    try {
      const role = await pb.collection('roles').getOne(user.staff_role, { requestKey: null });
      safeU.staff_permissions = Array.isArray(role.permissions) ? role.permissions : [];
    } catch { safeU.staff_permissions = []; }
  } else {
    safeU.staff_permissions = [];
  }
  return { token, user: safeU };
}

const loginExchangeCodes = new Map(); // code -> { payload: {token,user}, expires }
const EXCHANGE_TTL = 60 * 1000;

function createLoginExchangeCode(payload) {
  const code = crypto.randomBytes(24).toString('base64url');
  loginExchangeCodes.set(code, { payload, expires: Date.now() + EXCHANGE_TTL });
  return code;
}

function cleanupExchangeCodes() {
  const now = Date.now();
  for (const [code, entry] of loginExchangeCodes) {
    if (now > entry.expires) loginExchangeCodes.delete(code);
  }
}

async function generateCallsign(pb) {
  let callsign;
  let attempts = 0;
  const max = 20;

  while (attempts < max) {
    attempts++;
    const number = brand.callsign.min + Math.floor(Math.random() * (brand.callsign.max - brand.callsign.min + 1));
    callsign = brand.callsign.format(number);
    try {
      await pb.collection('users').getFirstListItem(`callsign = "${escFilterValue(callsign)}"`, { requestKey: null });
    } catch {
      return callsign;
    }
  }

  // Fallback: timestamp-based suffix if all random attempts collide
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return brand.callsign.format(ts);
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name, ifc_username, bypass_code, tos_accepted, if_signup_token } = req.body;

    let verifiedIfIdentity = null;
    if (if_signup_token) {
      try {
        const decoded = jwt.verify(if_signup_token, process.env.JWT_SECRET);
        if (decoded.purpose === 'if_signup' && decoded.if_user_id) {
          verifiedIfIdentity = { if_user_id: decoded.if_user_id, if_username: decoded.if_username || null };
        }
      } catch (e) {
        console.warn('[signup] if_signup_token invalid/expired, falling back to manual verification:', e.message);
      }
    }

    const effectiveIfcUsername = verifiedIfIdentity?.if_username || ifc_username;

    if (!email || !password || !first_name || !last_name || !effectiveIfcUsername) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (tos_accepted !== true) {
      return res.status(400).json({ error: 'You must read and agree to the Terms of Service and Privacy Policy to sign up.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const isBypass = !!(bypass_code && process.env.BYPASS_CODE && bypass_code === process.env.BYPASS_CODE);

    const pb = await getAdminClient();

    // Check for duplicate email
    try {
      await pb.collection('users').getFirstListItem(`email = "${escFilterValue(email.toLowerCase())}"`, { requestKey: null });
      return res.status(409).json({ error: 'An account with this email already exists' });
    } catch (e) {
      if (e?.status !== 404) throw e; // 404 = not found = good; anything else is a real error
    }

    // Check for duplicate IFC username (case-insensitive)
    try {
      await pb.collection('users').getFirstListItem(`ifc_username = "${escFilterValue(effectiveIfcUsername)}"`, { requestKey: null });
      return res.status(409).json({ error: 'This IFC username is already registered' });
    } catch (e) {
      if (e?.status !== 404) throw e;
    }

    const [callsign, ifUserId, ranksAll] = await Promise.all([
      generateCallsign(pb),
      verifiedIfIdentity ? Promise.resolve(verifiedIfIdentity.if_user_id) : lookupIfUserId(effectiveIfcUsername),
      pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null }).catch(() => []),
    ]);
    const starterRank = ranksAll[0] || null; // lowest rank by hours_required

    let user;
    try {
      user = await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        first_name,
        last_name,
        callsign,
        ifc_username:  effectiveIfcUsername,
        if_user_id:    ifUserId || '',
        if_verified:   !!verifiedIfIdentity,
        status:             'pending',
        role:               'pilot',
        rank:               starterRank?.id || '',
        total_flights:      0,
        total_hours:        0,
        recruitment_status: isBypass ? 'approved' : 'applied',
        exam_attempts:      0,
        exam_score:         0,
        exam_passed:        false,
        tos_accepted_at:    new Date().toISOString()
      });
    } catch (createErr) {
      // Handle PocketBase unique constraint violation on callsign
      if (createErr?.response?.data?.callsign) {
        return res.status(409).json({ error: 'Callsign collision — please try signing up again.' });
      }
      throw createErr;
    }

    notifyRegistration({
      first_name, last_name,
      callsign,
      ifc_username: effectiveIfcUsername,
      if_user_id: ifUserId || '',
    }).catch(() => {});

    res.status(201).json({
      message: isBypass ? 'Account created. Please verify via Discord to complete your re-registration.' : 'Account created. Please verify via Discord to activate your account.',
      bypass: isBypass,
      callsign,
      user:     safeUser(user),
    });
  } catch (err) {
    console.error('[signup]', err);
    res.status(400).json({ error: 'Failed to create account. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userPb = new PocketBase(process.env.POCKETBASE_URL || 'http://127.0.0.1:8090');
    userPb.autoCancellation(false); // see newPb in config/pocketbase.js
    const authData = await userPb.collection('users').authWithPassword(email, password);
    const pb = await getAdminClient();
    const user = authData.record;

    if (user.status !== 'approved') {
      return res.status(403).json({
        error: ACCOUNT_STATUS_MESSAGES[user.status] || `Account status: ${user.status}. Contact admin for approval.`,
        status: user.status,
      });
    }

    if (!user.email) user.email = email;
    const { token, user: safeU } = await buildLoginResponse(pb, user);
    res.json({ token, user: safeU });
  } catch (err) {
    console.error('[login]', err);
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

router.post('/if-exchange', async (req, res) => {
  cleanupExchangeCodes();
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const entry = loginExchangeCodes.get(code);
  if (!entry) return res.status(400).json({ error: 'This login link has expired or was already used. Please try again.' });
  loginExchangeCodes.delete(code); // single-use

  res.json(entry.payload);
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    // Fall back to JWT email if PocketBase emailVisibility masks it
    if (!user.email && req.user.email) user.email = req.user.email;
    const safeU = safeUser(user);
    if (user.staff_role) {
      try {
        const role = await pb.collection('roles').getOne(user.staff_role, { requestKey: null });
        safeU.staff_permissions = Array.isArray(role.permissions) ? role.permissions : [];
      } catch { safeU.staff_permissions = []; }
    } else {
      safeU.staff_permissions = [];
    }
    res.json({ user: safeU });
  } catch (err) {
    res.status(404).json({ error: 'User not found' });
  }
});

router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.user.id, { requestKey: null });
    if (user.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    res.status(401).json({ error: 'Could not refresh token' });
  }
});

router.post('/onboarding-complete', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    await adminPatch(req.user.id, { onboarding_complete: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/onboarding-complete]', err.message);
    res.status(500).json({ error: 'Failed to save onboarding status' });
  }
});

// Password Reset

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.json({ ok: true });

  try {
    const pb = await getAdminClient();
    let user;
    try {
      user = await pb.collection('users').getFirstListItem(
        `email = "${escFilterValue(email.toLowerCase().trim())}" && status = "approved"`,
        { requestKey: null }
      );
    } catch { return res.json({ ok: true }); }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Upsert token record
    try {
      const existing = await pb.collection('password_reset_tokens').getFirstListItem(
        `user = "${escFilterValue(user.id)}"`, { requestKey: null }
      );
      await pb.collection('password_reset_tokens').update(existing.id, { token, expires_at: expires, used: false });
    } catch {
      await pb.collection('password_reset_tokens').create({ user: user.id, token, expires_at: expires, used: false });
    }

    const resetUrl = `${brand.frontendUrl}/reset-password?token=${token}`;

    // Send email via Resend
    const { sendEmail, invalidateEmailConfig } = require('../utils/email');
    invalidateEmailConfig();
    await sendEmail({
      to: user.email,
      subject: `Reset your ${brand.shortName} password`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:2rem">
          <h2 style="color:${brand.colors.primary}">Password Reset</h2>
          <p>Hi ${user.first_name},</p>
          <p>Click the button below to reset your ${brand.shortName} crew centre password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:0.75rem 1.5rem;background:${brand.colors.primary};color:${brand.colors.onPrimary};border-radius:8px;text-decoration:none;font-weight:700;margin:1rem 0">Reset Password</a>
          <p style="color:#888;font-size:0.85rem">If you didn't request this, you can ignore this email.</p>
        </div>`,
      text: `Reset your password: ${resetUrl}`,
    });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
  }

  res.json({ ok: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (typeof token !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const pb = await getAdminClient();

    let record;
    try {
      record = await pb.collection('password_reset_tokens').getFirstListItem(
        `token = "${escFilterValue(token)}" && used = false`, { requestKey: null }
      );
    } catch {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    await pb.collection('users').update(record.user, { password, passwordConfirm: password });
    await pb.collection('password_reset_tokens').update(record.id, { used: true });

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

module.exports.buildLoginResponse      = buildLoginResponse;
module.exports.createLoginExchangeCode = createLoginExchangeCode;
module.exports.ACCOUNT_STATUS_MESSAGES = ACCOUNT_STATUS_MESSAGES;
module.exports.lookupIfUserId          = lookupIfUserId;
