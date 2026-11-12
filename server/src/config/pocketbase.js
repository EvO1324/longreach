/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const PocketBase = require('pocketbase/cjs');
const devMetrics = require('../utils/devMetrics');

let cachedPb    = null;
let tokenExpiry = null;
let authPromise = null; // prevents concurrent re-auths under load

const PBURL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

function newPb() {
  const pb = new PocketBase(PBURL);
  pb.autoCancellation(false);
  return pb;
}

const TRACKED_METHODS = new Set(['getList', 'getFullList', 'getOne', 'getFirstListItem', 'create', 'update', 'delete']);

function instrumentPb(pb) {
  const origCollection = pb.collection.bind(pb);
  pb.collection = (name) => {
    const svc = origCollection(name);
    return new Proxy(svc, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig !== 'function' || !TRACKED_METHODS.has(prop)) return orig;
        return async (...args) => {
          const start = Date.now();
          try {
            return await orig.apply(target, args);
          } finally {
            devMetrics.recordQuery({ collection: name, method: prop, ms: Date.now() - start });
          }
        };
      },
    });
  };
  return pb;
}

function invalidateAdminCache() {
  cachedPb    = null;
  tokenExpiry = null;
  console.log('[PocketBase] Cache invalidated — will re-auth on next request');
}

async function getAdminClient() {
  const now = Date.now();
  if (cachedPb && cachedPb.authStore.isValid && tokenExpiry && now < tokenExpiry - 5 * 60 * 1000) {
    return cachedPb;
  }

  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      const pb = newPb();
      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
      tokenExpiry = now + 23 * 60 * 60 * 1000;
      cachedPb    = instrumentPb(pb);
      console.log('[PocketBase] Admin authenticated');
      return cachedPb;
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

async function withAdminRetry(fn) {
  try {
    const pb = await getAdminClient();
    return await fn(pb);
  } catch (err) {
    if (err?.status === 403 || err?.response?.code === 403) {
      console.warn('[PocketBase] 403 detected — invalidating cache and retrying');
      invalidateAdminCache();
      const pb = await getAdminClient();
      return await fn(pb);
    }
    throw err;
  }
}

async function adminPatch(id, data) {
  const start = Date.now();
  const pb = newPb();
  await pb.admins.authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL,
    process.env.POCKETBASE_ADMIN_PASSWORD
  );
  const res = await fetch(`${PBURL}/api/collections/users/records/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': pb.authStore.token,
    },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  devMetrics.recordQuery({ collection: 'users', method: 'adminPatch', ms: Date.now() - start });
  if (!res.ok) {
    console.error('[adminPatch] failed', id, res.status, JSON.stringify(json));
    throw new Error(json.message || JSON.stringify(json));
  }
  return json;
}

async function getUserClient(token) {
  const userPb = newPb();
  userPb.authStore.save(token, null);
  try {
    await userPb.collection('users').authRefresh();
    return userPb;
  } catch {
    throw new Error('Invalid or expired token');
  }
}

module.exports = { getAdminClient, adminPatch, getUserClient, withAdminRetry, invalidateAdminCache, newPb };
