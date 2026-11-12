/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function getToken() {
  return localStorage.getItem('qv_token');
}

export function saveToken(token) {
  localStorage.setItem('qv_token', token);
}

export function clearToken() {
  localStorage.removeItem('qv_token');
}

async function request(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

const get   = (path)       => request('GET',    path);
const post  = (path, body) => request('POST',   path, body);
const patch = (path, body) => request('PATCH',  path, body);
const del   = (path)       => request('DELETE', path);

// Auth
export const auth = {
  login:              (email, password) => post('/auth/login', { email, password }),
  signup:             (email, password, data) => post('/auth/signup', { email, password, ...data }),
  me:                 ()                => get('/auth/me'),
  refresh:            ()                => post('/auth/refresh'),
  completeOnboarding: ()                => post('/auth/onboarding-complete', {}),
  forgotPassword:     (email)           => post('/auth/forgot-password', { email }),
  resetPassword:      (token, password) => post('/auth/reset-password', { token, password }),
};

export const ifAuth = {
  start:    ()     => get('/if-live/auth-start'),
  exchange: (code) => post('/auth/if-exchange', { code }),
};

// Documentation
export const docs = {
  list:   ()               => get('/docs'),
  update: (docId, data)    => request('PATCH', `/docs/${docId}`, data),
};

// Flights / PIREPs
export const flights = {
  list:             (params = {}) => get(`/flights?${new URLSearchParams(params)}`),
  byRoute: (dep, arr) => {
    const from = new Date(); from.setDate(from.getDate() - 30);
    const fromStr = from.toISOString().slice(0, 10);
    return get(`/flights?departure_icao=${dep}&arrival_icao=${arr}&status=approved&sort=-date&limit=20&from_date=${fromStr}&fields=id,aircraft,flight_time,multiplier_value,date`);
  },
  pending:          ()            => get('/flights/pending'),
  favouriteAirport: ()            => get('/flights/favourite-airport'),
  unreadRejections: (userId)       => get(`/flights?status=rejected&rejection_note_read=false&user=${userId}&fields=id,departure_icao,arrival_icao,aircraft,rejection_note,rejection_note_read`),
  submit:           (data)        => post('/flights', data),
  submitAtc:        (data)        => post('/flights/atc', data),
  previewMatch:     (data)        => post('/flights/preview-match', data),
  approve:          (id)          => patch(`/flights/${id}/approve`, {}),
  adminUpdate:      (id, data)    => patch(`/flights/${id}/admin-update`, data),
  getOne:           (id)          => get(`/flights/${id}`),
  reject:           (id, reason)  => patch(`/flights/${id}/reject`, { reason }),
  readRejection:    (id)          => patch(`/flights/${id}/read-rejection`, {}),
  aircraftStats:    ()            => get('/flights/stats/aircraft'),
  myStats:          ()            => get('/flights/my-stats'),
  retryAutoApprove:  (id)          => post(`/flights/${id}/retry-auto-approve`, {}),
  rejectApproved:    (id, reason)   => patch(`/flights/${id}/reject-approved`, { reason }),
  approveRejected:   (id)            => patch(`/flights/${id}/approve-rejected`, {}),
};

// Pilots
export const pilots = {
  list:             (params = {}) => get(`/pilots?${new URLSearchParams(params)}`),
  stats:            (id)          => get(`/pilots/${id}/stats`),
  pending:          ()            => get('/pilots/pending'),
  rejected:         ()            => get('/pilots/rejected'),
  recruitment:      ()            => get('/pilots/recruitment'),
  get:              (id)          => get(`/pilots/${id}`),
  email:            (id)          => get(`/pilots/${id}/email`),
  updateEmail:      (id, email)   => patch(`/pilots/${id}/email`, { email }),
  approve:          (id)          => patch(`/pilots/${id}/approve`),
  reject:           (id)          => patch(`/pilots/${id}/reject`),
  setRole:          (id, role)    => patch(`/pilots/${id}/role`, { role }),
  updateMe:         (data)        => patch('/pilots/me', data),
  delete:           (id)          => del(`/pilots/${id}`),
  adminUpdate:      (id, data)    => patch(`/pilots/${id}`, data),
  refreshIfLink:    (id)          => post(`/pilots/${id}/refresh-if-link`, {}),
  archived:         ()            => get('/pilots/archived'),
  checkInactivity:  (opts = {})   => post('/pilots/check-inactivity', opts),
  resetPassword:    (id)          => post(`/pilots/${id}/reset-password`, {}),
  discordInvite:    (pilotId)      => post('/pilots/discord-invite', { pilotId }),
  unsuspend:        (id)           => post(`/pilots/${id}/unsuspend`, {}),
  changePassword:   (data)        => post('/pilots/me/change-password', data),
};

// Fleet
export const fleet = {
  list:        ()           => get('/fleet'),
  add:         (data)       => post('/fleet', data),
  remove:      (id)         => del(`/fleet/${id}`),
  updateImage: (id, imgUrl) => patch(`/fleet/${id}`, { image_url: imgUrl }),
  updateIcao:  (id, code)   => patch(`/fleet/${id}`, { icao_code: code }),
};

// Ranks
export const ranks = {
  list:   ()         => get('/ranks'),
  me:     ()         => get('/ranks/me'),
  create: (data)     => post('/ranks', data),
  update: (id, data) => patch(`/ranks/${id}`, data),
  delete: (id)       => del(`/ranks/${id}`),
};

export const badges = {
  list:    ()         => get('/badges'),
  create:  (data)     => post('/badges', data),
  update:  (id, data) => patch(`/badges/${id}`, data),
  delete:  (id)       => del(`/badges/${id}`),
  forPilot: (userId)  => get(`/badges/pilot/${userId}`),
  // Earned but not yet shown in the dashboard's "badge unlocked" popup.
  unseen:  ()         => get('/badges/unseen'),
  markSeen: ()        => post('/badges/seen', {}),
  // Admin: re-check every pilot's IF roles for role badges now (also runs daily).
  syncRoles: ()       => post('/badges/sync-roles', {}),
  // Admin: who has a badge, and assigning or removing it manually.
  holders: (id)       => get(`/badges/${id}/holders`),
  award:   (id, userId) => post(`/badges/${id}/award`, { userId }),
  unaward: (id, userId) => del(`/badges/${id}/award/${userId}`),
};

export const leave = {
  mine:    ()           => get('/leave/mine'),
  request: (data)       => post('/leave', data),
  cancel:  (id)         => del(`/leave/${id}`),
  // admin
  all:     (status)     => get(`/leave${status ? `?status=${status}` : ''}`),
  review:  (id, data)   => patch(`/leave/${id}`, data),
};

export const issues = {
  submit: (data) => post('/issues', data),
};

export const routes = {
  list:    (params = {}) => get(`/routes?${new URLSearchParams(params)}`),
  search:  (q, params={}) => get(`/routes/search?q=${encodeURIComponent(q)}&${new URLSearchParams(params)}`),
  create:  (data)        => post('/routes', data),
  update:  (id, data)    => patch(`/routes/${id}`, data),
  delete:  (id)          => del(`/routes/${id}`),
  request: (data)        => post('/routes/request', data),
};

export const airlines = {
  list:   ()           => get('/airlines'),
  create: (data)       => post('/airlines', data),
  update: (id, data)   => patch(`/airlines/${id}`, data),
  delete: (id)         => del(`/airlines/${id}`),
};

// Stats
export const stats = {
  get:      ()     => get('/stats'),
  detailed: (from) => get('/stats/detailed' + (from ? `?from=${from}` : '')),
};

// Settings
export const settings = {
  list: ()           => get('/settings'),
  save: (key, value) => request('PUT', `/settings/${key}`, { value }),
};

// Routes of the Week
export const rotw = {
  getWeeks:    ()              => get('/rotw/weeks'),
  createWeek:  (week_start)    => request('POST',   '/rotw/weeks', { week_start }),
  deleteWeek:  (id)            => request('DELETE', `/rotw/weeks/${id}`),
  getSlots:    (weekId)        => get(`/rotw/weeks/${weekId}/slots`),
  saveSlots:   (weekId, slots) => request('PUT', `/rotw/weeks/${weekId}/slots`, { slots }),
  publish:     (weekId)        => request('POST', `/rotw/weeks/${weekId}/publish`),
  getSchedule: ()              => get('/rotw/schedule'),
};

// Multipliers
export const multipliers = {
  list:          ()     => get('/multipliers'),
  listAll:       ()     => get('/multipliers/all'),
  create:  (data)       => post('/multipliers', data),
  update:  (id, data)   => patch(`/multipliers/${id}`, data),
  delete:  (id)         => del(`/multipliers/${id}`),
  validatePromo: (code) => get(`/multipliers/promo/${encodeURIComponent(code)}`),
  gifts:   ()           => get('/multipliers/gifts'),
  claims:  (id)         => get(`/multipliers/${id}/claims`),
};

// Infinite Flight proxy
export const infiniteFlight = {
  aircraft:    async ()           => { const d = await get('/if/aircraft');                return { aircraft: d.result || [] }; },
  liveries:    async (id)         => { const d = await get(`/if/aircraft/${id}/liveries`);  return { liveries: d.result || [] }; },
  aircraftLiveryMap: async ()     => { const d = await get('/if/aircraft-livery-map');       return { map: d.map || {} }; },
  userStats:   async (u)          => { const d = await post('/if/users', { discourseNames: [u] }); return { result: d.result }; },
  userFlights: async (userId)     => { const d = await get(`/if/users/${userId}/flights`);   return { result: d.result }; },
  userAtc:     async (userId)     => { const d = await get(`/if/users/${userId}/atc`);        return { result: d.result }; },
  sessions:    async ()           => { const d = await get('/if/sessions');                  return { result: d.result || [] }; },
  world:       async (sessionId)  => { const d = await get(`/if/sessions/${sessionId}/world`); return { result: d.result || [] }; },
  aircraftStats: async ()         => { const d = await get('/if/aircraft-stats');              return { result: d.result || [], totalFlights: d.totalFlights || 0, sessionName: d.sessionName || null }; },
};

// Roles
export const roles = {
  list:   ()                => get('/roles'),
  create: (data)            => post('/roles', data),
  update: (id, data)        => patch(`/roles/${id}`, data),
  delete: (id)              => del(`/roles/${id}`),
  assign: (userId, roleId)  => patch(`/roles/assign/${userId}`, { role_id: roleId }),
};

// Exam
export const exam = {
  assign:     (id)                     => post(`/exam/assign/${id}`, {}),
  reset:      (id)                     => post(`/exam/reset/${id}`, {}),
  stage:      (id, recruitment_status) => patch(`/exam/${id}/stage`, { recruitment_status }),
  transcript: (userId)                 => get(`/exam/transcript/${userId}`),
  questionStats: ()                    => get('/exam/question-stats'),
  config:        ()                    => get('/exam/config'),
  updateConfig:  (data)                => patch('/exam/config', data),
};

export const examTopics = {
  list:   ()               => get('/exam/topics'),
  create: (data)            => post('/exam/topics', data),
  update: (id, data)        => patch(`/exam/topics/${id}`, data),
  delete: (id)               => del(`/exam/topics/${id}`),
};

export const examQuestions = {
  list:   (topicId)         => get(topicId ? `/exam/questions?topic=${topicId}` : '/exam/questions'),
  create: (data)            => post('/exam/questions', data),
  update: (id, data)        => patch(`/exam/questions/${id}`, data),
  delete: (id)               => del(`/exam/questions/${id}`),
};

// Upload
export const upload = {
  fleetImage:   (filename, data, folder = 'heroes') =>
    post('/upload/fleet-image', { filename, data, folder }),
  rankBadge:    (filename, data) => post('/upload/rank-badge', { filename, data }),
  airlineLogo:  (filename, data) => post('/upload/airline-logo', { filename, data }),
  brandAsset:   (key, filename, data) => post('/upload/brand-asset', { key, filename, data }),
  gladysImage:   (filename, data) => post('/upload/gladys-image', { filename, data }),
  gladysGallery: ()               => get('/upload/gladys-gallery'),
  gladysDelete:  (path)           => del(`/upload/gladys-image?path=${encodeURIComponent(path)}`),
};

// NOTAMs
export const news = {
  list:    ()       => get('/news'),
  listAll: ()       => get('/news/all'),
  create:  (data)   => post('/news', data),
  update:  (id, d)  => patch(`/news/${id}`, d),
  remove:  (id)     => del(`/news/${id}`),
};

export const notams = {
  list:    ()         => get('/notams'),
  listAll: ()         => get('/notams/all'),
  create:  (data)     => post('/notams', data),
  update:  (id, data) => patch(`/notams/${id}`, data),
  delete:  (id)       => del(`/notams/${id}`),
};

// Dev / Admin utilities
export const liveMap = {
  flights:     ()                                => get('/livemap'),
  flightPlan:  (sessionId, flightId)             => get(`/livemap/flightplan/${sessionId}/${flightId}`),
  route:       (sessionId, flightId)             => get(`/livemap/route/${sessionId}/${flightId}`),
  pilotFlight: (ifUserId)                        => get(`/livemap/pilot/${ifUserId}`),
  fleet:       ()                                => get('/livemap/fleet'),
};

export const health = {
  get: (params = {}) => get(`/health?${new URLSearchParams(params)}`),
  // The shareable report for the same range, as a PNG Blob
  card: async (params = {}) => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/health/card?${new URLSearchParams(params)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    return res.blob();
  },
};

export const changelog = {
  list:   ()       => get('/changelog'),
  create: (data)   => post('/changelog', data),
  update: (id, d)  => request('PATCH', `/changelog/${id}`, d),
  remove: (id)     => del(`/changelog/${id}`),
};

export const career = {
  status:      ()           => get('/career/status'),
  enroll:      (data)       => post('/career/enroll', data),
  change:      (data)       => post('/career/change', data),
  leave:       ()           => post('/career/leave', {}),
  routes:      ()           => get('/career/routes'),
  hubAircraft: (icao)       => get(`/career/hub/${icao}/aircraft`),
  ferryStatus:       ()     => get('/career/ferry/status'),
  ferryDestinations: ()     => get('/career/ferry/destinations'),
  adminUpdate: (userId, data) => request('PATCH', `/career/admin/${userId}`, data),
};

export const devTools = {
  syncRankRoles:          ()             => post('/admin/sync-rank-roles', {}),
  recalcVaStats:          ()             => post('/va_stats/recalculate', {}),
};

// Audit Logs
export const auditLogs = {
  list:    (params = {}) => get(`/audit-logs?${new URLSearchParams(params)}`),
  actions: ()            => get('/audit-logs/actions'),
  clear:   ()            => del('/audit-logs'),
};

// Staff Applications
export const staffApplications = {
  positions:         ()          => get('/staff-applications/positions'),
  positionsAll:      ()          => get('/staff-applications/positions/all'),
  createPosition:    (data)      => post('/staff-applications/positions', data),
  updatePosition:    (id, data)  => patch(`/staff-applications/positions/${id}`, data),
  deletePosition:    (id)        => del(`/staff-applications/positions/${id}`),
  apply:             (data)      => post('/staff-applications', data),
  listApplications:  (params={}) => get(`/staff-applications?${new URLSearchParams(params)}`),
  updateApplication: (id, data)  => patch(`/staff-applications/${id}`, data),
  deleteApplication: (id)        => del(`/staff-applications/${id}`),
};

export const events = {
  list:          (all = false)       => get(`/events${all ? '?all=1' : ''}`),
  get:           (id)                => get(`/events/${encodeURIComponent(id)}`),
  live:          (id)                => get(`/events/${encodeURIComponent(id)}/live`),
  register:      (id, gate)          => post(`/events/${encodeURIComponent(id)}/register`, { gate }),
  deregister:    (id)                => del(`/events/${encodeURIComponent(id)}/register`),
  // staff (events.manage)
  create:        (data)              => post('/events', data),
  update:        (id, data)          => patch(`/events/${encodeURIComponent(id)}`, data),
  remove:        (id)                => del(`/events/${encodeURIComponent(id)}`),
  removeSignup:  (id, regId)         => del(`/events/${encodeURIComponent(id)}/registrations/${encodeURIComponent(regId)}`),
};

export const challenges = {
  list:         ()            => get('/challenges'),
  get:          (id)          => get(`/challenges/${id}`),
  leaderboard:  (id)          => get(`/challenges/${id}/leaderboard`),
  myEntry:      (id)          => get(`/challenges/${id}/my-entry`),
  enroll:       (id)          => post(`/challenges/${id}/enroll`, {}),
  reset:        (id)          => post(`/challenges/${id}/reset`, {}),
  // admin
  create:       (data)        => post('/challenges', data),
  update:       (id, data)    => patch(`/challenges/${id}`, data),
  remove:       (id)          => del(`/challenges/${id}`),
  createLeg:    (id, data)    => post(`/challenges/${id}/legs`, data),
  updateLeg:    (legId, data) => patch(`/challenges/legs/${legId}`, data),
  deleteLeg:    (legId)       => del(`/challenges/legs/${legId}`),
  adminEntries: (id)          => get(`/challenges/${id}/admin-entries`),
};

export const watchlist = {
  list:   ()          => get('/watchlist'),
  add:    (data)       => post('/watchlist', data),
  update: (id, data)   => patch(`/watchlist/${id}`, data),
  remove: (id)          => del(`/watchlist/${id}`),
};

export const ifLive = {
  status:          ()                  => get('/if-live/status'),
  playground:      (path)              => get(`/if-live/playground?path=${encodeURIComponent(path)}`),
  playgroundV2:    (path, discourseNames) => get(`/if-live/playground-v2?path=${encodeURIComponent(path)}${discourseNames ? `&discourseNames=${encodeURIComponent(discourseNames)}` : ''}`),
  linkStatus:      ()                  => get('/if-live/link-status'),
  link:            (returnTo)          => get(`/if-live/link${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`),
  connect:         (returnTo)          => get(`/if-live/connect${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`),
  disconnect:      ()                  => del('/if-live/disconnect'),
  organizations:   ()                  => get('/if-live/organizations'),
  organization:    (orgId)             => get(`/if-live/organizations/${orgId}`),
  aircraftList:    (orgId)             => get(`/if-live/organizations/${orgId}/aircraft`),
  positions:       (orgId)             => get(`/if-live/organizations/${orgId}/positions`),
  daySchedule:     (orgId, dateStr)    => get(`/if-live/organizations/${orgId}/day-schedule?date=${dateStr}`),
  aircraft:        (acId)              => get(`/if-live/aircraft/${acId}`),
  position:        (acId)              => get(`/if-live/aircraft/${acId}/position`),
  schedules:       (acId)              => get(`/if-live/aircraft/${acId}/schedules`),
  aircraftFlights: (acId, page = 1)    => get(`/if-live/aircraft/${acId}/flights?page=${page}`),
  orgSchedules:    (orgId)             => get(`/if-live/organizations/${orgId}/schedules`),
  // PIREPs flown on the org's Live aircraft (matched by registration), newest first.
  orgHistory:      (orgId, days = 30)  => get(`/if-live/organizations/${orgId}/history?days=${days}`),
  // City/airport names for a list of ICAOs: { airports: { YSSY: { city, name, country } } }.
  airports:        (icaos)             => get(`/if-live/airports?icaos=${encodeURIComponent(icaos.join(','))}`),
  orgMembers:      (orgId)             => get(`/if-live/organizations/${orgId}/members`),
  createSchedule:  (acId, data)        => post(`/if-live/aircraft/${acId}/schedules`, data),
  updateSchedule:  (scheduleId, data)  => request('PUT', `/if-live/schedules/${scheduleId}`, data),
  updateFlightPlan:(scheduleId, flightPlan) => request('PUT', `/if-live/schedules/${scheduleId}/flightplan`, { flightPlan }),
  reorderSchedule: (acId, scheduleId, afterId = null) => request('PUT', `/if-live/aircraft/${acId}/schedules/reorder`, { scheduleId, afterId }),
  deleteSchedule:  (scheduleId)        => del(`/if-live/schedules/${scheduleId}`),
  setPrimaryOrg:   (orgId)             => request('PUT', '/if-live/primary-org', { orgId }),
  fleetImages:     ()                  => get('/if-live/fleet-images'),
  setFleetImage:   (aircraftTypeId, imageUrl) => request('PUT', `/if-live/fleet-images/${encodeURIComponent(aircraftTypeId)}`, { imageUrl }),
};

export const ifLiveBids = {
  list:    (organizationId, { recent = false } = {}) => get(`/if-live/bids?organizationId=${encodeURIComponent(organizationId)}${recent ? '&recent=1' : ''}`),
  mine:    (history = false) => get(`/if-live/bids/mine${history ? '?history=1' : ''}`),
  create:  (data)            => post('/if-live/bids', data),
  quote:   (data)            => post('/if-live/bids/quote', data),
  // More sectors on your booking, flown after its last one (same aircraft).
  addLegs: (id, legs)        => post(`/if-live/bids/${id}/legs`, { legs }),
  approve: (id)                => post(`/if-live/bids/${id}/approve`, {}),
  deny:    (id, reason)         => post(`/if-live/bids/${id}/deny`, { reason }),
  cancel:  (id)                 => del(`/if-live/bids/${id}`),
  // Move a timed booking's departure (every leg shifts by the same amount).
  changeTime: (id, departureUtc) => request('PATCH', `/if-live/bids/${id}/time`, { departureUtc }),
  filePirep: (bidId, legIndex, data) => post(`/if-live/bids/${bidId}/legs/${legIndex}/file-pirep`, data),
  // Push a started leg's deadline back an hour (up to 3 times, if nobody's booked after)
  extend: (bidId, legIndex) => post(`/if-live/bids/${bidId}/legs/${legIndex}/extend`, {}),
  landedLegs: () => get('/if-live/bids/landed-legs'),
  crewCandidates: () => get('/if-live/crew-candidates'),
  addCrew:        (bidId, pilotId) => post(`/if-live/bids/${bidId}/crew`, { pilotId }),
  removeCrew:     (bidId, pilotId) => del(`/if-live/bids/${bidId}/crew/${pilotId}`),
};

export const ifLiveStats = {
  mine:        ()  => get('/if-live/stats/mine'),
  leaderboard: ()  => get('/if-live/stats/leaderboard'),
  // Crew centre totals per Live aircraft, keyed by aircraft id (Fleet page)
  aircraft:    ()  => get('/if-live/stats/aircraft'),
  overview:    ()  => get('/if-live/stats/overview'),
  members:     ()  => get('/if-live/members'),
};

export const ifLiveAdmin = {
  overview:     ()                    => get('/if-live/admin/overview'),
  editLeg:      (bidId, i, data)      => request('PATCH', `/if-live/admin/bids/${bidId}/legs/${i}`, data),
  retry:        (bidId, withoutFlightPlan = false) => post(`/if-live/admin/bids/${bidId}/retry`, { withoutFlightPlan }),
  scheduleLeg:  (bidId, i, withoutFlightPlan = false) => post(`/if-live/admin/bids/${bidId}/legs/${i}/schedule`, { withoutFlightPlan }),
  linkPirep:    (bidId, i, flightId)  => post(`/if-live/admin/bids/${bidId}/legs/${i}/link-pirep`, { flightId }),
  unlinkPirep:  (bidId, i)            => post(`/if-live/admin/bids/${bidId}/legs/${i}/unlink-pirep`, {}),
  cancelLeg:    (bidId, i)            => post(`/if-live/admin/bids/${bidId}/legs/${i}/cancel`, {}),
  merge:        (bidId, intoBidId)    => post(`/if-live/admin/bids/${bidId}/merge`, { intoBidId }),
  close:        (bidId)               => post(`/if-live/admin/bids/${bidId}/close`, {}),
  cancel:       (bidId)               => post(`/if-live/admin/bids/${bidId}/cancel`, {}),
  history:      (bidId)               => get(`/if-live/admin/bids/${bidId}/history`),
  pilotPireps:  (pilotId)             => get(`/if-live/admin/pilots/${pilotId}/pireps`),
  abandoned:    ()                    => get('/if-live/admin/abandoned'),
  giveBack:     (bidId, i, hours)     => post(`/if-live/admin/bids/${bidId}/legs/${i}/give-back`, { hours }),
  reassign:     (bidId, i, pilotId, hours) => post(`/if-live/admin/bids/${bidId}/legs/${i}/reassign`, { pilotId, hours }),
  abandon:      (bidId, i, notify)    => post(`/if-live/admin/bids/${bidId}/legs/${i}/abandon`, { notify }),
  pilots:       ()                    => get('/if-live/admin/pilots'),
  pilot:        (pilotId)             => get(`/if-live/admin/pilots/${pilotId}`),
  setAccess:    (pilotId, liveAccess) => request('PATCH', `/if-live/admin/pilots/${pilotId}`, { liveAccess }),
  aircraft:     ()                    => get('/if-live/admin/aircraft'),
  updateAircraft: (aircraftId, data)  => request('PATCH', `/if-live/admin/aircraft/${aircraftId}`, data),
  book:         (data)                => post('/if-live/admin/bookings', data),
  recent:       (days = 7)            => get(`/if-live/admin/bookings/recent?days=${days}`),
  activity:     (hours = 24)          => get(`/if-live/admin/activity?hours=${hours}`),
};

// Import (Admin › Import)
export const importer = {
  run: (type, rows, dryRun = true) => post(`/import/${type}`, { rows, dryRun }),
};

// Plugins (Admin › Plugins)
export const plugins = {
  list: ()              => get('/plugins'),
  set:  (id, enabled)   => request('PUT', `/plugins/${id}`, { enabled }),
};

// Connections (Admin › Connections)
export const connections = {
  get:         ()           => get('/admin/connections'),
  save:        (values)     => post('/admin/connections', { values }),
  discord:     (guild = '') => get(`/admin/connections/discord${guild ? `?guild=${encodeURIComponent(guild)}` : ''}`),
  testWebhook: (key, value) => post('/admin/connections/test-webhook', { key, value }),
};

// Updates (Admin › Updates)
export const updates = {
  status: ()        => get('/updates'),
  run:    ()        => get('/updates/run'),
  apply:  (version) => post('/updates/apply', { version }),
};
