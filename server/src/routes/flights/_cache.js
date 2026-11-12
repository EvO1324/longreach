/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const _cache = new Map();

const getCached = (key) => {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.data;
};
const setCached = (key, data, ttlMs) => _cache.set(key, { data, exp: Date.now() + ttlMs });
const invalidateCache = (key) => _cache.delete(key);

module.exports = { getCached, setCached, invalidateCache };
