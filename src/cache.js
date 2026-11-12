/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const store = {};

const DEFAULT_TTL = {
  flights:    5 * 60 * 1000,
  fleet:      30 * 60 * 1000,
  routes:     15 * 60 * 1000,
  stats:      5 * 60 * 1000,
  dashboard:  2 * 60 * 1000,
  rotw:       15 * 60 * 1000,
};

export function cacheGet(key) {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete store[key];
    return null;
  }
  return entry.data;
}

export function cacheSet(key, data, ttlMs) {
  const ttl = ttlMs ?? DEFAULT_TTL[key.split(':')[0]] ?? 5 * 60 * 1000;
  store[key] = { data, expiresAt: Date.now() + ttl };
}

export function cacheDelete(key) {
  delete store[key];
}

export function cacheClear() {
  Object.keys(store).forEach(k => delete store[k]);
}

export function cacheInvalidate(prefix) {
  Object.keys(store).forEach(k => {
    if (k.startsWith(prefix)) delete store[k];
  });
}
