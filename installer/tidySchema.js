#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'server', 'schema.json');
const schema = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const DROP_TABLES = new Set(['atc_sessions', 'achievements', 'pilot_achievements', 'advent_doors', 'advent_opens', 'advent_uses']);
const DROP_FIELDS = {
  users: ['name', 'verify_token'],
  challenges: ['banner_image'],
};

// Field order for the big tables; anything not listed keeps its place at the end
const ORDER = {
  users: [
    // who they are
    'first_name', 'last_name', 'avatar', 'callsign', 'role', 'staff_role', 'status', 'rank',
    'total_hours', 'total_flights', 'atc_hours',
    // Infinite Flight
    'ifc_username', 'if_user_id', 'if_verified', 'live_access',
    // Discord
    'discord_id', 'discord_username', 'discord_invite_url', 'discord_invite_sent_at', 'suspended_roles',
    // joining
    'recruitment_status', 'exam_token', 'exam_token_created', 'exam_question_ids', 'exam_attempts',
    'exam_score', 'exam_passed', 'exam_transcript', 'tos_accepted_at', 'onboarding_complete', 'must_change_password',
    // career mode
    'career_active', 'career_hub', 'career_aircraft', 'career_current_icao', 'career_started_at',
    'career_total_flights', 'career_total_hours', 'career_last_ferry_at',
    // everything else
    'activity_warned_at', 'has_imported_history', 'push_subscription', 'admin_notes',
  ],
  flights: [
    'user', 'status', 'date', 'flight_number', 'departure_icao', 'arrival_icao', 'aircraft', 'registration',
    'flight_time', 'distance_nm', 'fuel_used_kg', 'landing_stats', 'notes',
    'multiplier_code', 'multiplier_name', 'multiplier_value',
    'auto_approved', 'auto_approve_result', 'rejection_note', 'rejection_note_read',
    'event', 'challenge_leg_id', 'is_career', 'is_ferry', 'is_live', 'is_atc',
  ],
};

// Indexes the API leans on (non-unique, so they apply to any existing data)
const INDEXES = {
  users: [
    'CREATE INDEX `idx_users_callsign` ON `users` (`callsign`)',
    'CREATE INDEX `idx_users_status` ON `users` (`status`)',
    'CREATE INDEX `idx_users_discord_id` ON `users` (`discord_id`)',
    'CREATE INDEX `idx_users_if_user_id` ON `users` (`if_user_id`)',
  ],
  flights: [
    'CREATE INDEX `idx_flights_user_status` ON `flights` (`user`, `status`)',
    'CREATE INDEX `idx_flights_status_date` ON `flights` (`status`, `date`)',
  ],
  daily_stats: ['CREATE INDEX `idx_daily_stats_date` ON `daily_stats` (`date`)'],
  if_live_bids: ['CREATE INDEX `idx_if_live_bids_pilot` ON `if_live_bids` (`pilot`)'],
};

// Tables grouped by area, in the order DATABASE.md describes them
const AREAS = [
  'users', 'roles', 'ranks', 'badges', 'pilot_badges', 'leave_requests', 'password_reset_tokens',
  'flights', 'routes', 'fleet', 'airlines', 'multipliers', 'promo_uses', 'route_requests',
  'staff_applications', 'staff_positions', 'watchlist', 'exam_topics', 'exam_questions', 'exam_question_attempts',
  'events', 'event_registrations', 'challenges', 'challenge_legs', 'challenge_entries', 'challenge_leg_completions',
  'rotw_weeks', 'rotw_slots',
  'if_live_tokens', 'if_live_bids', 'if_live_fleet_images',
  'va_stats', 'daily_stats', 'news', 'notams', 'docs', 'changelog', 'settings', 'audit_logs',
];

let out = schema.filter(c => !DROP_TABLES.has(c.name));
const dangling = out.flatMap(c => c.schema.filter(f => f.type === 'relation'
  && schema.some(d => DROP_TABLES.has(d.name) && d.id === f.options.collectionId)).map(f => `${c.name}.${f.name}`));
if (dangling.length) throw new Error(`Still pointing at dropped tables: ${dangling.join(', ')}`);

for (const c of out) {
  const drop = new Set(DROP_FIELDS[c.name] || []);
  c.schema = c.schema.filter(f => !drop.has(f.name));
  if (ORDER[c.name]) {
    const rank = new Map(ORDER[c.name].map((n, i) => [n, i]));
    c.schema = c.schema.slice().sort((a, b) => (rank.get(a.name) ?? 999) - (rank.get(b.name) ?? 999));
  }
  for (const r of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) c[r] = null;
  if (c.type === 'auth') {
    c.options = { ...c.options, manageRule: null, allowUsernameAuth: false, allowOAuth2Auth: false, allowEmailAuth: true };
  }
  // an index this script added before under another name
  c.indexes = (c.indexes || []).filter(i => !i.includes('`idx_if_live_bids_user`'));
  const have = new Set((c.indexes || []).map(i => i.match(/`(idx_[^`]+)`/)?.[1]));
  for (const idx of INDEXES[c.name] || []) {
    if (!have.has(idx.match(/`(idx_[^`]+)`/)[1])) c.indexes = [...(c.indexes || []), idx];
  }
}

const pos = new Map(AREAS.map((n, i) => [n, i]));
out = out.sort((a, b) => (pos.get(a.name) ?? 999) - (pos.get(b.name) ?? 999));
const unplaced = out.filter(c => !pos.has(c.name)).map(c => c.name);
if (unplaced.length) console.warn('Not in AREAS (left at the end):', unplaced.join(', '));

fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} tables · ${out.reduce((n, c) => n + c.schema.length, 0)} fields · every table admin-only`);
