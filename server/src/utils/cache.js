/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const allStats = {}; // namespace -> { hits, misses }

function createCache(namespace = 'default') {
  const store = new Map();
  const k = (key) => `${namespace}:${key}`;
  if (!allStats[namespace]) allStats[namespace] = { hits: 0, misses: 0 };
  const stats = allStats[namespace];

  function getCached(key) {
    const entry = store.get(k(key));
    if (!entry || Date.now() > entry.expires) {
      if (entry) store.delete(k(key));
      stats.misses++;
      return null;
    }
    stats.hits++;
    return entry.data;
  }

  function setCached(key, data, ttlMs = 5 * 60 * 1000) {
    store.set(k(key), { data, expires: Date.now() + ttlMs });
  }

  function invalidateCache(key) {
    store.delete(k(key));
  }

  function invalidatePrefix(prefix) {
    const full = k(prefix);
    for (const key of store.keys()) {
      if (key.startsWith(full)) store.delete(key);
    }
  }

  function invalidateAll() {
    store.clear();
  }

  return { getCached, setCached, invalidateCache, invalidatePrefix, invalidateAll };
}

function getAllCacheStats() {
  return Object.fromEntries(
    Object.entries(allStats).map(([ns, s]) => [ns, {
      hits: s.hits,
      misses: s.misses,
      hitRate: (s.hits + s.misses) > 0 ? parseFloat((s.hits / (s.hits + s.misses) * 100).toFixed(1)) : null,
    }])
  );
}

module.exports = { createCache, getAllCacheStats };
