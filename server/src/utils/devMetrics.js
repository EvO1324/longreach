/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const RECENT_REQUESTS_MAX = 100;
const SLOW_QUERY_MAX      = 50;
const SLOW_QUERY_MS       = 300; // individual PocketBase call considered "slow"
const SLOW_REQUEST_MS     = 500; // whole API request considered "slow"

const recentRequests = []; // [{ method, path, status, ms, dbQueries, at }]
const slowQueries    = []; // [{ collection, method, ms, path, at }]

function pushBounded(arr, item, max) {
  arr.push(item);
  if (arr.length > max) arr.shift();
}

function runWithRequestContext(fn) {
  return als.run({ queries: 0 }, fn);
}

function recordQuery({ collection, method, ms, path }) {
  const store = als.getStore();
  if (store) store.queries++;
  if (ms >= SLOW_QUERY_MS) {
    pushBounded(slowQueries, { collection, method, ms, path: path || null, at: new Date().toISOString() }, SLOW_QUERY_MAX);
  }
}

function getQueryCount() {
  return als.getStore()?.queries || 0;
}

function recordRequest({ method, path, status, ms, dbQueries }) {
  pushBounded(recentRequests, { method, path, status, ms, dbQueries, at: new Date().toISOString() }, RECENT_REQUESTS_MAX);
  if (ms >= SLOW_REQUEST_MS) {
    console.warn(`[slow-request] ${method} ${path} — ${ms}ms, ${dbQueries} db quer${dbQueries === 1 ? 'y' : 'ies'}`);
  }
}

function getRecentRequests() {
  return [...recentRequests].reverse(); // newest first
}

function getSlowQueries() {
  return [...slowQueries].reverse();
}

module.exports = {
  als,
  runWithRequestContext,
  recordQuery,
  getQueryCount,
  recordRequest,
  getRecentRequests,
  getSlowQueries,
  SLOW_REQUEST_MS,
  SLOW_QUERY_MS,
};
