/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Settings that admins can change from Admin › Connections after install.
// They're stored in the settings collection as "config.<KEY>" and laid over
// process.env when the API and the bot start, so a saved value wins over .env
// and Fly secrets. Saving restarts both processes so every module picks it up.

const PREFIX = 'config.';

const id = (key, label, hint) => ({ key, label, hint, kind: key.includes('_ROLE_') ? 'role' : key.includes('_CHANNEL_') ? 'channel' : 'text' });
const hook = (key, label, hint) => ({ key, label, hint, kind: 'webhook', secret: true });

const GROUPS = [
  {
    id: 'server', title: 'Discord server',
    fields: [
      { key: 'DISCORD_GUILD_ID', label: 'Server ID', hint: 'Right-click the server icon › Copy Server ID', kind: 'text' },
      { key: 'DISCORD_DEV_IDS', label: 'Developer user IDs', hint: 'Comma-separated. These users can run the bot\'s developer commands.', kind: 'text' },
    ],
  },
  {
    id: 'roles', title: 'Roles',
    fields: [
      id('DISCORD_VERIFIED_ROLE_ID', 'Verified', 'Given when a pilot links their account with /verify'),
      id('DISCORD_UNVERIFIED_ROLE_ID', 'Unverified', 'Given to everyone who joins, removed on /verify'),
      id('DISCORD_STAFF_ROLE_ID', 'Staff', 'Can use the staff commands'),
      id('DISCORD_SUSPENDED_ROLE_ID', 'Suspended', 'Given when a pilot is suspended'),
      id('DISCORD_RECRUITMENT_ROLE_ID', 'Recruitment', 'Pinged for new applications and passed exams'),
      id('DISCORD_IFATC_ROLE_ID', 'IFATC', 'Given to pilots who are IFATC'),
      id('DISCORD_IFAET_ROLE_ID', 'IFAET', 'Given to pilots who are IFAET'),
      id('DISCORD_ROTW_ROLE_ID', 'Routes of the Week', 'Pinged when the routes are posted'),
      id('DISCORD_CHALLENGES_ROLE_ID', 'Challenges', 'Pinged for new challenges'),
      id('DISCORD_ACTIVITY_WARNING_ROLE_ID', 'Activity warning', 'Given to pilots who are close to being archived'),
      id('DISCORD_LIVE_ROLE_ID', 'Live Mode', 'Given to pilots with Live Mode access'),
    ],
  },
  {
    id: 'channels', title: 'Channels',
    fields: [
      id('DISCORD_RANKUP_CHANNEL_ID', 'Rank-ups', 'Promotions are announced here'),
      id('DISCORD_ROTW_CHANNEL_ID', 'Routes of the Week', 'The weekly routes are posted here'),
      id('DISCORD_LEADERBOARD_CHANNEL_ID', 'Leaderboard', 'The weekly leaderboard is posted here'),
      id('DISCORD_CHALLENGES_CHANNEL_ID', 'Challenges', 'New challenges and reminders'),
      id('DISCORD_ACTIVITY_WARNING_CHANNEL_ID', 'Activity warnings', 'Inactive pilots are warned here'),
      id('DISCORD_INVITE_CHANNEL_ID', 'Invites', 'New pilots\' invite links point to this channel'),
      id('DISCORD_IFLIVE_CHANNEL_ID', 'Live Mode', 'Landing prompts. Leave blank to use the Live Mode webhook\'s channel.'),
    ],
  },
  {
    id: 'webhooks', title: 'Webhooks',
    fields: [
      hook('DISCORD_WEBHOOK_PIREPS', 'PIREPs', 'Filed and approved flights'),
      hook('DISCORD_WEBHOOK_REGISTRATIONS', 'Registrations', 'Applications and exam results'),
      hook('DISCORD_WEBHOOK_PILOTS', 'Pilots', 'Rank changes and pilot updates'),
      hook('DISCORD_WEBHOOK_ACTIVITY', 'Activity', 'Activity checks'),
      hook('DISCORD_WEBHOOK_EVENTS', 'Events', 'Event announcements'),
      hook('DISCORD_WEBHOOK_IFLIVE', 'Live Mode', 'Bookings and landings'),
      hook('DISCORD_WEBHOOK_ADMIN', 'Staff alerts', 'Errors and things staff should look at'),
    ],
  },
  {
    id: 'other', title: 'Other',
    fields: [
      { key: 'IF_LIVE_ORG_ID', label: 'Infinite Flight organisation ID', hint: 'Your VA\'s organisation in Live Mode', kind: 'text' },
      { key: 'GITHUB_TOKEN', label: 'GitHub token', hint: 'Used for image uploads, bug reports and one-click updates', kind: 'text', secret: true },
      { key: 'GITHUB_IMAGES_REPO', label: 'Images repository', hint: 'owner/name', kind: 'text' },
      { key: 'GITHUB_ISSUES_REPO', label: 'Bug reports repository', hint: 'owner/name', kind: 'text' },
      { key: 'GITHUB_CREWCENTRE_REPO', label: 'Crew centre repository', hint: 'owner/name, for one-click updates', kind: 'text' },
    ],
  },
];

const FIELDS = GROUPS.flatMap(g => g.fields);
const KEYS = new Set(FIELDS.map(f => f.key));
const VERSION_KEY = 'config_version';

let loadedVersion = null;

async function readStored(pb) {
  const records = await pb.collection('settings').getFullList({ filter: `key ~ "${PREFIX}%" || key = "${VERSION_KEY}"`, requestKey: null });
  const values = {};
  let version = null;
  for (const r of records) {
    if (r.key === VERSION_KEY) version = r.value;
    else if (KEYS.has(r.key.slice(PREFIX.length))) values[r.key.slice(PREFIX.length)] = r.value ?? '';
  }
  return { values, version, records };
}

// Called once at start-up, before anything reads process.env
async function load({ timeoutMs = 8000 } = {}) {
  const { getAdminClient } = require('./pocketbase');
  const work = (async () => {
    const pb = await getAdminClient();
    const { values, version } = await readStored(pb);
    for (const [k, v] of Object.entries(values)) process.env[k] = v;
    await require('./plugins').load(pb);
    loadedVersion = version;
    return Object.keys(values).length;
  })();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), timeoutMs).unref());
  try {
    const n = await Promise.race([work, timeout]);
    if (n) console.log(`[config] ${n} setting${n === 1 ? '' : 's'} from Admin › Connections`);
  } catch (err) {
    console.warn(`[config] Couldn't read saved settings (${err.message}); using .env only`);
  }
}

// Tells the bot (and any other process) that something it reads at start-up changed
async function bumpVersion(pb) {
  const r = await pb.collection('settings').getFirstListItem(`key = "${VERSION_KEY}"`, { requestKey: null }).catch(() => null);
  const value = String(Date.now());
  if (r) await pb.collection('settings').update(r.id, { value });
  else await pb.collection('settings').create({ key: VERSION_KEY, value });
}

// The bot runs in its own process: when the settings change it exits and pm2
// starts it again with the new ones
function restartOnChange({ everyMs = 60 * 1000 } = {}) {
  if (process.env.pm_id === undefined) return;
  const { getAdminClient } = require('./pocketbase');
  setInterval(async () => {
    try {
      const pb = await getAdminClient();
      const r = await pb.collection('settings').getFirstListItem(`key = "${VERSION_KEY}"`, { requestKey: null }).catch(() => null);
      if (r && r.value !== loadedVersion) {
        console.log('[config] Settings changed in Admin › Connections, restarting');
        process.exit(0);
      }
    } catch {}
  }, everyMs).unref();
}

module.exports = { restartOnChange, bumpVersion, PREFIX, GROUPS, FIELDS, KEYS, VERSION_KEY, readStored, load, loadedVersion: () => loadedVersion };
