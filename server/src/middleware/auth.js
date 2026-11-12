/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const jwt = require('jsonwebtoken');
const { getAdminClient } = require('../config/pocketbase');
const { DEVELOPER_EMAILS } = require('../utils/developers');

const API_KEYS = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

// Cache staff role permissions to avoid DB hit on every request
const roleCache = new Map(); // roleId -> { permissions: [], expires: number }
const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 mins

async function getStaffPermissions(roleId) {
  if (!roleId) return [];
  const cached = roleCache.get(roleId);
  if (cached && Date.now() < cached.expires) return cached.permissions;
  try {
    const pb = await getAdminClient();
    const role = await pb.collection('roles').getOne(roleId, { requestKey: null });
    const p = role.permissions;
    const permissions = Array.isArray(p) ? p : (p ? JSON.parse(p) : []);
    roleCache.set(roleId, { permissions, expires: Date.now() + ROLE_CACHE_TTL });
    return permissions;
  } catch {
    return [];
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

function isDeveloperUser(user) {
  return !!user?.email && DEVELOPER_EMAILS.includes(String(user.email).toLowerCase());
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && !isDeveloperUser(req.user)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && !req.user.staff_role && !isDeveloperUser(req.user)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    next();
  });
}

function requireLiveAccess(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && !req.user.staff_role && !req.user.live_access && !isDeveloperUser(req.user)) {
      return res.status(403).json({ error: 'This feature requires Live Mode access' });
    }
    next();
  });
}
// Old name kept as an alias in case anything else still imports it.
const requireBetaAccess = requireLiveAccess;

function requireDeveloper(req, res, next) {
  requireAuth(req, res, () => {
    if (!DEVELOPER_EMAILS.includes(String(req.user.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Developer access required' });
    }
    next();
  });
}

function requirePermission(permission) {
  return async (req, res, next) => {
    // First validate JWT
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    try {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.user = decoded;
    } catch {
      return res.status(401).json({ error: 'Token expired or invalid' });
    }

    if (req.user.role === 'admin' || isDeveloperUser(req.user)) return next();

    if (req.user.staff_role) {
      const permissions = await getStaffPermissions(req.user.staff_role);
      if (permissions.includes(permission)) return next();
    }

    return res.status(403).json({ error: `Missing permission: ${permission}` });
  };
}

function requireAnyPermission(...wanted) {
  return (req, res, next) => {
    requireAuth(req, res, async () => {
      if (req.user.role === 'admin' || isDeveloperUser(req.user)) return next();
      if (req.user.staff_role) {
        const permissions = await getStaffPermissions(req.user.staff_role);
        if (wanted.some(p => permissions.includes(p))) return next();
      }
      return res.status(403).json({ error: `Missing permission: ${wanted.join(' or ')}` });
    });
  };
}

function requireApiKey(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('ApiKey ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  const key = header.slice(7).trim();
  if (!API_KEYS.includes(key)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

function requireAuthOrApiKey(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('ApiKey ')) return requireApiKey(req, res, next);
  return requireAuth(req, res, next);
}

module.exports = { requireAuth, requireAdmin, requireStaff, requireLiveAccess, requireBetaAccess, requirePermission, requireAnyPermission, requireApiKey, requireAuthOrApiKey, requireDeveloper, getStaffPermissions, isDeveloperUser };
