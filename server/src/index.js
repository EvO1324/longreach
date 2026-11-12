/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sortRanks } = require('./services/rankAccess');
const brand = require('./config/brand');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const flightRoutes = require('./routes/flights');
const pilotRoutes = require('./routes/pilots');
const vaRoutes = require('./routes/va');
const airlinesRoutes = require('./routes/airlines');
const settingsRoutes = require('./routes/settings');
const rotwRoutes     = require('./routes/rotw');
const uploadRoutes = require('./routes/upload');
const { router: pushRoutes } = require('./routes/push');
const examRoutes = require('./routes/exam');
const { router: rolesRoutes } = require('./routes/roles');
const cardRoute = require('./routes/card');

const notamsRoutes = require('./routes/notams');
const newsRoutes   = require('./routes/news');
const auditLogsRoutes = require('./routes/auditLogs');
const { router: challengesRoutes } = require('./routes/challenges');
const eventsRoutes = require('./routes/events');
const livemapRoutes = require('./routes/livemap');
const changelogRoutes = require('./routes/changelog');
const careerRoutes = require('./routes/career');
const { notifyServerStart, notifyPocketBaseError } = require('./routes/discord');
const leaveRoutes  = require('./routes/leave');
const ifLiveRoutes = require('./routes/ifLive');
const ifLiveAdminRoutes = require('./routes/ifLiveAdmin'); // admins only: the Admin tab in Live Mode
const docsRoutes = require('./routes/docs');
const watchlistRoutes = require('./routes/watchlist');
const { scheduleActivityCheck } = require('./jobs/activityCheck');
const { scheduleStatsAudit } = require('./jobs/statsAudit');
const { scheduleEventLanding } = require('./jobs/eventLanding');
const { scheduleRotwPoster } = require('./jobs/rotwScheduler');
const { scheduleRecruitmentReminder } = require('./jobs/recruitmentReminder');
const { scheduleStaleExamCleanup } = require('./jobs/staleExamCleanup');
const { schedulePbRestart } = require('./jobs/pbRestart');
const { scheduleLeaderboardPost } = require('./jobs/leaderboardScheduler');
const { scheduleChallengeReminder } = require('./jobs/challengeReminder');
const { scheduleIfLiveBidExpiry } = require('./jobs/ifLiveBidExpiry');
const { scheduleIfLiveTimeWarning } = require('./jobs/ifLiveTimeWarning');
const { scheduleIfLiveNoShow } = require('./jobs/ifLiveNoShow');
const { scheduleIfLiveAutoPirep } = require('./jobs/ifLiveAutoPirep');
const { scheduleIfRoleBadgeSync } = require('./jobs/ifRoleBadgeSync');
const { syncRoleBadgesForPilot } = require('./services/badges');
const { scheduleIfLiveAircraftStatus } = require('./jobs/ifLiveAircraftStatus');
const devMetrics = require('./utils/devMetrics');
const { escFilterValue } = require('./utils/pbFilter');

const app = express();
app.set("trust proxy", 1); // Fly.io sits behind a proxy
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000') === '*'
    ? '*'
    : (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-edit-key'],
}));
app.options('*', cors());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
}));

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const ALLOWED_API_HOSTS = (process.env.ALLOWED_API_HOSTS || hostOf(brand.apiUrl))
  .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);

app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  if (!ALLOWED_API_HOSTS.length) return next();
  const host = (req.hostname || '').toLowerCase(); // req.hostname is Host header minus the port
  if (ALLOWED_API_HOSTS.includes(host)) return next();
  console.warn(`[host-guard] blocked request with Host: ${req.headers.host}`);
  res.status(404).json({ error: 'Not found' });
});

// Stricter limit on auth endpoints to prevent brute force
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
}));

// Middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '15mb' }));

app.use((req, res, next) => {
  const path = req.path;
  const cacheable = ['/fleet', '/ranks', '/routes', '/stats', '/settings', '/multipliers'];
  const isCacheable = cacheable.some(p => path.startsWith(p)) && req.method === 'GET';
  if (isCacheable) {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  devMetrics.runWithRequestContext(() => {
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (!res.headersSent) res.setHeader('X-DB-Queries', String(devMetrics.getQueryCount()));
      return origJson(body);
    };
    res.on('finish', () => {
      if (req.path === '/api/dev/metrics') return;
      devMetrics.recordRequest({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        dbQueries: devMetrics.getQueryCount(),
      });
    });
    next();
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/pilots', pilotRoutes);
app.use('/api', settingsRoutes);
app.use('/api', rotwRoutes);
app.use('/api', vaRoutes);
app.use('/api/airlines', airlinesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/card', cardRoute);
app.use('/api/notams', notamsRoutes);
app.use('/api/news',   newsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api', livemapRoutes);
app.use('/api/changelog', changelogRoutes);
app.use('/api/career', careerRoutes);
app.use('/api/badges', require('./routes/badges'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/leave',  leaveRoutes);
app.use('/api/staff-applications', require('./routes/staffApplications'));
app.use('/api/if-live/admin', ifLiveAdminRoutes);
app.use('/api/if-live', ifLiveRoutes);
app.use('/api', docsRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/import', require('./routes/importer'));
app.use('/api/updates', require('./routes/updates'));

const { requireAdmin } = require('./middleware/auth');

app.get('/api/admin/job-status', requireAdmin, (req, res) => {
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-AU', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) + ' UTC' : 'not yet run';
  res.json({
    jobs: [
      {
        name: 'Activity Check',
        description: 'Warns/kicks inactive pilots',
        schedule: `5:00am ${brand.timezone} daily`,
        next_run: fmt(scheduleActivityCheck._nextRun),
        last_run: fmt(scheduleActivityCheck._lastRun),
      },
      {
        name: 'PocketBase Restart',
        description: 'Restarts PB to clear memory',
        schedule: `3:00am ${brand.timezone} daily`,
        next_run: fmt(schedulePbRestart._nextRun),
        last_run: fmt(schedulePbRestart._lastRun),
      },
      {
        name: 'ROTW Poster',
        description: 'Posts Routes of the Week to Discord',
        schedule: 'Monday 06:00 UTC',
        next_run: fmt(scheduleRotwPoster._nextRun),
        last_run: fmt(scheduleRotwPoster._lastRun),
      },
      {
        name: 'Recruitment Reminder',
        description: 'Reminds staff of pending applications',
        schedule: 'Every hour',
        next_run: fmt(scheduleRecruitmentReminder._nextRun),
        last_run: fmt(scheduleRecruitmentReminder._lastRun),
      },
      {
        name: 'Leaderboard Post',
        description: 'Posts weekly leaderboard to Discord',
        schedule: `Monday 5:00am ${brand.timezone}`,
        next_run: 'see leaderboard_last_fired in PocketBase',
        last_run: 'see leaderboard_last_fired in PocketBase',
      },
      {
        name: 'Stats Audit',
        description: process.env.STATS_AUDIT_MODE === 'fix'
          ? "Checks every pilot's flights, hours and rank, the VA totals and daily stats against the flight records, and fixes any that have drifted"
          : "Report only: checks every pilot's flights, hours and rank, the VA totals and daily stats against the flight records, and posts in #admin what it would fix (STATS_AUDIT_MODE=fix turns fixing on)",
        schedule: `4:30am ${brand.timezone} daily`,
        next_run: fmt(scheduleStatsAudit._nextRun),
        last_run: fmt(scheduleStatsAudit._lastRun),
      },
      {
        name: 'Event Landings',
        description: 'While an event is on, records landings at the arrival and marks them Landed on the event page and its Discord message',
        schedule: 'Every 2 minutes (only does work during events)',
        next_run: fmt(scheduleEventLanding._nextRun),
        last_run: fmt(scheduleEventLanding._lastRun),
      },
      {
        name: 'Stale Exam Cleanup',
        description: 'Deletes applications where the exam was sent but never completed after 30 days',
        schedule: `4:00am ${brand.timezone} daily`,
        next_run: fmt(scheduleStaleExamCleanup._nextRun),
        last_run: fmt(scheduleStaleExamCleanup._lastRun),
      },
      {
        name: 'IF Live Bid Expiry',
        description: 'Frees aircraft from started legs past their deadline (block time + 6h, plus any extensions) once IF no longer shows them flying',
        schedule: 'Every 15 minutes',
        next_run: fmt(scheduleIfLiveBidExpiry._nextRun),
        last_run: fmt(scheduleIfLiveBidExpiry._lastRun),
      },
      {
        name: 'IF Live Time Warning',
        description: 'Warns pilots when 1h of their 4h start window is left, and 1h before a started flight has to be landed and filed (with an Extend button)',
        schedule: 'Every 5 minutes',
        next_run: fmt(scheduleIfLiveTimeWarning._nextRun),
        last_run: fmt(scheduleIfLiveTimeWarning._lastRun),
      },
      {
        name: 'IF Live No-Show',
        description: 'Marks legs started when the pilot is on the Expert Server in the booked aircraft; drops bookings not started within 4h',
        schedule: 'Every 5 minutes',
        next_run: fmt(scheduleIfLiveNoShow._nextRun),
        last_run: fmt(scheduleIfLiveNoShow._lastRun),
      },
      {
        name: 'IF Live Auto-PIREP',
        description: 'Auto-files a Live leg\'s PIREP once a matching flight shows up in the pilot\'s IF logbook (within 36h for bids with a known aircraft type, 2h otherwise)',
        schedule: 'Every 5 minutes',
        next_run: fmt(scheduleIfLiveAutoPirep._nextRun),
        last_run: fmt(scheduleIfLiveAutoPirep._lastRun),
      },
      {
        name: 'IF Live Aircraft Status',
        description: 'Matches booked aircraft with open legs against the Expert Server\'s live flight sessions (by pilot + callsign) so the Fleet page can show "In flight" instead of a stale last-known airport',
        schedule: 'Every hour',
        next_run: fmt(scheduleIfLiveAircraftStatus._nextRun),
        last_run: fmt(scheduleIfLiveAircraftStatus._lastRun),
      },
    ],
  });
});

app.post('/api/admin/sync-rank-roles', requireAdmin, async (req, res) => {
  try {
    const { getAdminClient } = require('./config/pocketbase');
    const pb = await getAdminClient();

    const GUILD_ID          = process.env.DISCORD_GUILD_ID;
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const IF_API_KEY        = process.env.IF_API_KEY;
    const IF_BASE           = 'https://api.infiniteflight.com/public/v2';
    const IFATC_ROLE_ID     = process.env.DISCORD_IFATC_ROLE_ID || null;
    const IFAET_ROLE_ID     = process.env.DISCORD_IFAET_ROLE_ID || null;
    const WARNING_ROLE_ID   = process.env.DISCORD_ACTIVITY_WARNING_ROLE_ID;

    if (!GUILD_ID || !DISCORD_BOT_TOKEN) {
      return res.status(503).json({ error: 'Discord not configured' });
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const discordReq = async (method, path, body, retries = 3) => {
      const r = await fetch(`https://discord.com/api/v10${path}`, {
        method,
        headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 204 || r.status === 200) return null;
      if (r.status === 429 && retries > 0) {
        const retryAfter = parseFloat(r.headers.get('retry-after') || '1') * 1000;
        await sleep(retryAfter + 100);
        return discordReq(method, path, body, retries - 1);
      }
      const data = await r.json().catch(() => ({}));
      throw new Error(`Discord ${r.status}: ${data.message || JSON.stringify(data)}`);
    };

    const [pilots, ranks] = await Promise.all([
      pb.collection('users').getFullList({ requestKey: null }),
      pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null }),
    ]);

    const allRankRoleIds = ranks.map(r => r.discord_role_id).filter(Boolean);
    let synced = 0, skipped = 0, errors = 0, warningRolesCleared = 0;
    const log = [];

    for (const pilot of pilots) {
      if (!pilot.discord_id) { skipped++; log.push(`SKIP ${pilot.callsign || pilot.id} — no discord_id`); continue; }

      if (WARNING_ROLE_ID && !pilot.activity_warned_at) {
        try {
          const memberRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${pilot.discord_id}`, {
            headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` },
          });
          if (memberRes.ok) {
            const member = await memberRes.json();
            if ((member.roles || []).includes(WARNING_ROLE_ID)) {
              await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${WARNING_ROLE_ID}`).catch(() => {});
              warningRolesCleared++;
              log.push(`CLEAR ${pilot.callsign || pilot.id} — removed stale inactivity-warning role`);
            }
          }
        } catch (err) {
          console.warn(`[sync-rank-roles] warning-role check failed for ${pilot.callsign}:`, err.message);
        }
      }

      const hours       = pilot.total_hours || 0;
      const correctRank = sortRanks(ranks).filter(r => hours >= r.hours_required).pop();
      if (!correctRank) { skipped++; log.push(`SKIP ${pilot.callsign} — below rank threshold`); continue; }

      const newRoleId = correctRank.discord_role_id;
      if (!newRoleId) { skipped++; log.push(`SKIP ${pilot.callsign} — rank has no discord_role_id`); continue; }

      try {
        // Add correct rank role
        await discordReq('PUT', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${newRoleId}`);

        // Remove all other rank roles
        for (const roleId of allRankRoleIds.filter(id => id !== newRoleId)) {
          await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${roleId}`).catch(() => {});
        }

        // Sync IFATC/IFAET roles if pilot has IFC username
        if (pilot.ifc_username && IF_API_KEY) {
          try {
            const ifRes = await fetch(`${IF_BASE}/users?apikey=${IF_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ discourseNames: [pilot.ifc_username] }),
            });
            const ifData = await ifRes.json();
            const ifRoles = ifData.result?.[0]?.roles || [];
            if (ifData.result?.[0]) await syncRoleBadgesForPilot(pb, pilot.id, ifRoles);

            if (IFATC_ROLE_ID && ifRoles.includes(64)) {
              await discordReq('PUT', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${IFATC_ROLE_ID}`).catch(() => {});
            } else if (IFATC_ROLE_ID) {
              await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${IFATC_ROLE_ID}`).catch(() => {});
            }

            if (IFAET_ROLE_ID && ifRoles.includes(68)) {
              await discordReq('PUT', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${IFAET_ROLE_ID}`).catch(() => {});
            } else if (IFAET_ROLE_ID) {
              await discordReq('DELETE', `/guilds/${GUILD_ID}/members/${pilot.discord_id}/roles/${IFAET_ROLE_ID}`).catch(() => {});
            }
          } catch (err) {
            console.warn(`[sync-rank-roles] IF role sync failed for ${pilot.callsign}:`, err.message);
          }
        }

        synced++;
        log.push(`OK   ${pilot.callsign} → ${correctRank.name}`);
        console.log(`[sync-rank-roles] ${pilot.callsign} → ${correctRank.name}`);
      } catch (err) {
        errors++;
        log.push(`ERR  ${pilot.callsign}: ${err.message}`);
        console.error(`[sync-rank-roles] ${pilot.callsign}:`, err.message);
      }
      // Small delay to avoid Discord rate limits
      await sleep(500);
    }

    res.json({ synced, skipped, errors, warningRolesCleared, total: pilots.length, log });
  } catch (err) {
    console.error('[sync-rank-roles]', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// 404
app.use((req, res) => res.status(404).json({ error: `Cannot ${req.method} ${req.path}` }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.DISABLE_JOBS === 'true') {
  console.log('[jobs] DISABLE_JOBS=true — scheduled jobs not started');
} else {
  // Start daily activity check job
  scheduleActivityCheck();
  // Start ROTW Monday auto-poster
  scheduleRotwPoster();
  scheduleRecruitmentReminder();
  schedulePbRestart();
  scheduleLeaderboardPost();
  scheduleStaleExamCleanup();
  scheduleChallengeReminder();
  scheduleIfLiveBidExpiry();
  scheduleIfLiveTimeWarning();
  scheduleIfLiveNoShow();
  scheduleIfLiveAutoPirep();
  scheduleIfLiveAircraftStatus();
  scheduleIfRoleBadgeSync();
  scheduleStatsAudit();
  scheduleEventLanding();
}

app.listen(PORT, () => {
  console.log(`\n✈️  ${brand.name} API running on port ${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   PocketBase: ${process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'}\n`);

  // After an update: add the database tables and fields the new version needs
  if (process.env.DISABLE_SCHEMA_SYNC !== 'true') {
    require('./config/pocketbase').getAdminClient()
      .then(pb => require('./services/updates').syncSchema(pb))
      .catch(err => console.error('[updates] database update failed:', err.message));
  }

  // Only notify on production deployments..
  if (process.env.NODE_ENV !== 'development') {
    notifyServerStart({
      port: PORT,
      env: process.env.NODE_ENV || 'production',
      version: require('../package.json').version,
    }).catch(() => {});
  }
});
