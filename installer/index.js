#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawnSync } = require('child_process');
const core = require('../scripts/brandCore');

const ROOT = path.join(__dirname, '..');
const rel = p => path.join(ROOT, p);
const PORT = Number(process.env.SETUP_PORT) || 4848;

// In GitHub Codespaces the page is opened through the codespace's private
// forwarded address, which only the codespace's owner can reach
const CODESPACE_HOST = process.env.CODESPACES && process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ? `${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : null;

// .env files

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function writeEnv(file, values, heading) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  const done = new Set();
  const quote = v => (/[\s#"'=]/.test(v) ? JSON.stringify(v) : v);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in values) { lines[i] = `${m[1]}=${quote(values[m[1]])}`; done.add(m[1]); }
  }
  const fresh = Object.keys(values).filter(k => !done.has(k));
  if (fresh.length) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(`# ${heading} (npm run setup)`);
    for (const k of fresh) lines.push(`${k}=${quote(values[k])}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

const SERVER_ENV = [
  // core
  { key: 'POCKETBASE_URL' }, { key: 'POCKETBASE_ADMIN_EMAIL' }, { key: 'POCKETBASE_ADMIN_PASSWORD', secret: true },
  { key: 'IF_API_KEY', secret: true }, { key: 'DEVELOPER_EMAILS' },
  // Discord
  { key: 'DISCORD_BOT_TOKEN', secret: true }, { key: 'DISCORD_CLIENT_ID' }, { key: 'DISCORD_CLIENT_SECRET', secret: true },
  { key: 'DISCORD_GUILD_ID' }, { key: 'DISCORD_VERIFIED_ROLE_ID' }, { key: 'DISCORD_UNVERIFIED_ROLE_ID' }, { key: 'DISCORD_STAFF_ROLE_ID' },
  { key: 'DISCORD_SUSPENDED_ROLE_ID' }, { key: 'DISCORD_RECRUITMENT_ROLE_ID' }, { key: 'DISCORD_IFATC_ROLE_ID' }, { key: 'DISCORD_IFAET_ROLE_ID' },
  { key: 'DISCORD_RANKUP_CHANNEL_ID' }, { key: 'DISCORD_ROTW_CHANNEL_ID' }, { key: 'DISCORD_ROTW_ROLE_ID' },
  { key: 'DISCORD_LEADERBOARD_CHANNEL_ID' }, { key: 'DISCORD_INVITE_CHANNEL_ID' }, { key: 'DISCORD_CHALLENGES_CHANNEL_ID' },
  { key: 'DISCORD_ACTIVITY_WARNING_CHANNEL_ID' }, { key: 'DISCORD_ACTIVITY_WARNING_ROLE_ID' },
  { key: 'DISCORD_WEBHOOK_PIREPS', secret: true }, { key: 'DISCORD_WEBHOOK_REGISTRATIONS', secret: true },
  { key: 'DISCORD_WEBHOOK_ADMIN', secret: true }, { key: 'DISCORD_WEBHOOK_ACTIVITY', secret: true },
  { key: 'DISCORD_WEBHOOK_PILOTS', secret: true }, { key: 'DISCORD_WEBHOOK_EVENTS', secret: true },
  { key: 'DISCORD_WEBHOOK_IFLIVE', secret: true },
  // optional extras
  { key: 'GITHUB_TOKEN', secret: true }, { key: 'GITHUB_IMAGES_REPO' }, { key: 'GITHUB_ISSUES_REPO' }, { key: 'GITHUB_CREWCENTRE_REPO' },
  { key: 'IF_OAUTH_CLIENT_ID' }, { key: 'IF_OAUTH_CLIENT_SECRET', secret: true }, { key: 'IF_OAUTH_REDIRECT_URI' }, { key: 'IF_LIVE_ORG_ID' },
];
const SECRET = new Set(SERVER_ENV.filter(e => e.secret).map(e => e.key));

function envState() {
  const server = readEnv(rel('server/.env'));
  const values = {};
  const set = {};
  for (const { key } of SERVER_ENV) {
    if (SECRET.has(key)) set[key] = !!server[key];
    else values[key] = server[key] || '';
  }
  return { values, set };
}

// HTTP helpers

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('Upload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('Bad JSON')); }
    });
    req.on('error', reject);
  });
}

async function fetchJson(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

const trimUrl = u => String(u || '').trim().replace(/\/+$/, '');

// PocketBase

async function pbAdmin(url, email, password) {
  url = trimUrl(url);
  if (!/^https?:\/\//.test(url)) throw new Error('The PocketBase address should start with http:// or https://');
  const health = await fetchJson(`${url}/api/health`).catch(err => { throw new Error(`Can't reach ${url}: ${err.message}`); });
  if (!health.ok) throw new Error(`${url} answered ${health.status}; is that a PocketBase server?`);
  const auth = await fetchJson(`${url}/api/admins/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (auth.status === 404) {
    const su = await fetchJson(`${url}/api/collections/_superusers/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
    });
    if (su.ok || su.status === 400) throw new Error('This is PocketBase 0.23 or newer. The crew centre runs on PocketBase 0.22 (the version in server/Dockerfile); please use 0.22.x.');
    throw new Error('PocketBase admin sign-in isn\'t available at this address.');
  }
  if (!auth.ok) throw new Error('PocketBase rejected the admin email or password.');
  return { url, token: auth.data.token };
}

async function pbCollections({ url, token }) {
  const r = await fetchJson(`${url}/api/collections?perPage=500`, { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`Couldn't list collections (${r.status})`);
  return r.data.items || [];
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.json'), 'utf8'));
}

async function pbImportSchema(admin) {
  const schema = loadSchema();
  const r = await fetchJson(`${admin.url}/api/collections/import`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: admin.token },
    body: JSON.stringify({ collections: schema, deleteMissing: false }),
  }, 60000);
  if (!r.ok) {
    const detail = r.data?.data ? JSON.stringify(r.data.data).slice(0, 400) : (r.data?.message || r.status);
    throw new Error(`PocketBase didn't accept the collections: ${detail}`);
  }
  return schema.length;
}

async function pbCreateOwner(admin, owner, config) {
  const cs = core.callsignTools(config.callsign);
  const body = {
    email: owner.email.trim().toLowerCase(),
    emailVisibility: false,
    password: owner.password,
    passwordConfirm: owner.password,
    first_name: owner.firstName.trim(),
    last_name: (owner.lastName || '').trim(),
    callsign: cs.format(cs.min),
    role: 'admin',
    status: 'approved',
    recruitment_status: 'approved',
    onboarding_complete: true,
    tos_accepted_at: new Date().toISOString(),
    total_flights: 0,
    total_hours: 0,
  };
  const r = await fetchJson(`${admin.url}/api/collections/users/records`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: admin.token }, body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = r.data?.data ? Object.entries(r.data.data).map(([k, v]) => `${k}: ${v.message}`).join(', ') : r.status;
    throw new Error(`Couldn't create the admin account (${detail})`);
  }
  return body.callsign;
}

// Install

const DATA_URL = /^data:(image\/(png|svg\+xml|jpeg|webp));base64,(.+)$/;
const EXT = { 'image/png': '.png', 'image/svg+xml': '.svg', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function saveLogo(dataUrl, name) {
  const m = String(dataUrl || '').match(DATA_URL);
  if (!m) return null;
  const file = `brand/${name}${EXT[m[1]]}`;
  fs.mkdirSync(rel('brand'), { recursive: true });
  for (const old of fs.readdirSync(rel('brand'))) {
    if (old.replace(/\.[^.]+$/, '') === name) fs.rmSync(rel(`brand/${old}`));
  }
  fs.writeFileSync(rel(file), Buffer.from(m[3], 'base64'));
  return file;
}

function currentConfig() {
  for (const name of ['va.config.json', 'va.config.example.json']) {
    if (fs.existsSync(rel(name))) {
      try { return { exists: name === 'va.config.json', config: JSON.parse(fs.readFileSync(rel(name), 'utf8')) }; } catch {}
    }
  }
  return { exists: false, config: {} };
}

function logoDataUrl(p) {
  // the generic placeholders: the page draws the VA's own instead
  if (!p || p.startsWith('brand/default/') || !fs.existsSync(rel(p))) return null;
  const ext = path.extname(p).toLowerCase();
  const type = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
  return type ? `data:${type};base64,${fs.readFileSync(rel(p)).toString('base64')}` : null;
}

async function install(body) {
  const log = [];
  const step = (text, ok = true) => log.push({ text, ok });

  // 1. Config
  const { config, errors } = core.resolve(body.config || {});
  if (errors.length) return { ok: false, log: errors.map(e => ({ text: e, ok: false })) };

  // 2. Logos (the page sends data: URLs; icons already sized to PNG)
  const logos = body.logos || {};
  const light = saveLogo(logos.light, 'logo-light');
  const dark = saveLogo(logos.dark, 'logo-dark');
  const icon = saveLogo(logos.icon, 'icon');
  saveLogo(logos.icon192, 'icon-192');
  saveLogo(logos.icon512, 'icon-512');
  saveLogo(logos.favicon, 'favicon');
  if (light) config.logos.light = light;
  if (dark) config.logos.dark = dark;
  if (icon) config.logos.icon = icon;
  if (light || dark || icon) step('Saved the logos in brand/');

  // only what the VA chose goes in the file; defaults fill the rest at build
  const out = { ...config };
  fs.writeFileSync(rel('va.config.json'), JSON.stringify(out, null, 2) + '\n');
  step('Wrote va.config.json');

  // 3. .env files
  const env = body.env || {};
  const existing = readEnv(rel('server/.env'));
  const serverValues = {};
  for (const { key } of SERVER_ENV) {
    const v = env[key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (SECRET.has(key) && !s) continue; // blank secret: keep what's there
    if (!s && !(key in existing)) continue; // nothing to say about an unused setting
    serverValues[key] = s;
  }
  const frontendUrl = trimUrl(config.urls.crewCentre);
  const apiUrl = trimUrl(config.urls.api);
  Object.assign(serverValues, {
    FRONTEND_URL: frontendUrl,
    BACKEND_URL: apiUrl,
    CORS_ORIGINS: existing.CORS_ORIGINS && existing.CORS_ORIGINS.split(',').includes(frontendUrl)
      ? existing.CORS_ORIGINS
      : [frontendUrl, ...(frontendUrl.includes('localhost') ? [] : ['http://localhost:3000'])].join(','),
  });
  if (!existing.JWT_SECRET) serverValues.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  if (!existing.PORT) serverValues.PORT = '3001';
  if (!existing.VAPID_PUBLIC_KEY) {
    try {
      const webpush = require(rel('server/node_modules/web-push'));
      const k = webpush.generateVAPIDKeys();
      serverValues.VAPID_PUBLIC_KEY = k.publicKey;
      serverValues.VAPID_PRIVATE_KEY = k.privateKey;
      serverValues.VAPID_EMAIL = config.legal.contact || serverValues.POCKETBASE_ADMIN_EMAIL || existing.POCKETBASE_ADMIN_EMAIL || '';
      step('Generated push notification keys');
    } catch {
      step('Push notification keys not generated (run npm install in server/ and run setup again)', false);
    }
  }
  writeEnv(rel('server/.env'), serverValues, 'Crew centre settings');
  step('Wrote server/.env');

  writeEnv(rel('.env'), {
    REACT_APP_API_URL: `${apiUrl}/api`,
    REACT_APP_DEVELOPER_EMAILS: serverValues.DEVELOPER_EMAILS ?? existing.DEVELOPER_EMAILS ?? '',
    REACT_APP_IF_LIVE_ORG_ID: serverValues.IF_LIVE_ORG_ID ?? existing.IF_LIVE_ORG_ID ?? '',
  }, 'Crew centre site settings');
  step('Wrote .env (the site\'s settings)');

  // 4. Brand
  const b = spawnSync(process.execPath, [rel('scripts/brand.js')], { cwd: ROOT, encoding: 'utf8' });
  if (b.status !== 0) {
    step(`npm run brand failed: ${(b.stderr || b.stdout).trim()}`, false);
    return { ok: false, log };
  }
  step(b.stdout.trim().split('\n')[0].replace(/^✓ /, 'Applied the brand: '));

  // 5. Database
  const db = body.db || {};
  if (db.createCollections || db.owner) {
    const merged = { ...existing, ...serverValues };
    let admin;
    try {
      admin = await pbAdmin(merged.POCKETBASE_URL, merged.POCKETBASE_ADMIN_EMAIL, merged.POCKETBASE_ADMIN_PASSWORD);
    } catch (err) {
      step(err.message, false);
      return { ok: false, log };
    }
    if (db.createCollections) {
      try {
        const n = await pbImportSchema(admin);
        step(`Created the database collections (${n})`);
      } catch (err) {
        step(err.message, false);
        return { ok: false, log };
      }
    }
    if (db.owner?.email && db.owner?.password) {
      try {
        const callsign = await pbCreateOwner(admin, db.owner, config);
        step(`Created the admin account ${db.owner.email} (${callsign})`);
      } catch (err) {
        step(err.message, false);
        return { ok: false, log };
      }
    }
  }
  return { ok: true, log };
}

// Routes

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && host !== CODESPACE_HOST) return send(res, 403, { error: 'Forbidden' });
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && origin !== `http://localhost:${PORT}` && origin !== `http://127.0.0.1:${PORT}` && origin !== `https://${CODESPACE_HOST}`) {
    return send(res, 403, { error: 'Forbidden' });
  }

  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/brandCore.js') {
    return send(res, 200, fs.readFileSync(rel('scripts/brandCore.js'), 'utf8'), 'application/javascript');
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const { exists, config } = currentConfig();
    const { config: resolved } = core.resolve(config);
    return send(res, 200, {
      exists,
      config: resolved,
      logos: {
        light: logoDataUrl(resolved.logos.light),
        dark: logoDataUrl(resolved.logos.dark),
        icon: logoDataUrl(resolved.logos.icon),
      },
      env: envState(),
      collections: loadSchema().length,
      serverDeps: fs.existsSync(rel('server/node_modules')),
    });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (err) { return send(res, 400, { error: err.message }); }
    const env = { ...readEnv(rel('server/.env')) };
    // a blank secret in the form means "the one already saved"
    const pick = (key) => (body[key] ? String(body[key]).trim() : env[key] || '');

    try {
      if (url.pathname === '/api/test/pocketbase') {
        const admin = await pbAdmin(pick('POCKETBASE_URL'), pick('POCKETBASE_ADMIN_EMAIL'), pick('POCKETBASE_ADMIN_PASSWORD'));
        const cols = await pbCollections(admin);
        const names = new Set(cols.map(c => c.name));
        const schema = loadSchema();
        const missing = schema.filter(c => !names.has(c.name)).length;
        let users = 0;
        if (names.has('users')) {
          const r = await fetchJson(`${admin.url}/api/collections/users/records?perPage=1&fields=id`, { headers: { Authorization: admin.token } });
          users = r.data?.totalItems || 0;
        }
        return send(res, 200, { ok: true, collections: cols.filter(c => !c.system).length, missing, total: schema.length, users });
      }
      if (url.pathname === '/api/test/if') {
        const key = pick('IF_API_KEY');
        if (!key) return send(res, 200, { ok: false, error: 'Enter the API key first.' });
        const r = await fetchJson(`https://api.infiniteflight.com/public/v2/sessions?apikey=${encodeURIComponent(key)}`);
        if (r.ok && r.data?.errorCode === 0) {
          return send(res, 200, { ok: true, sessions: (r.data.result || []).map(s => s.name) });
        }
        return send(res, 200, { ok: false, error: r.status === 401 || r.data?.errorCode ? 'Infinite Flight didn\'t accept that key.' : `Infinite Flight answered ${r.status}.` });
      }
      if (url.pathname === '/api/test/webhook') {
        const hook = pick(body.key);
        if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(hook)) {
          return send(res, 200, { ok: false, error: 'That isn\'t a Discord webhook URL.' });
        }
        const r = await fetchJson(hook); // reads the webhook's details, posts nothing
        return send(res, 200, r.ok ? { ok: true, name: r.data.name, channel: r.data.channel_id } : { ok: false, error: 'Discord doesn\'t know that webhook (deleted, or a typo).' });
      }
      if (url.pathname === '/api/test/discord-bot') {
        const token = pick('DISCORD_BOT_TOKEN');
        if (!token) return send(res, 200, { ok: false, error: 'Enter the bot token first.' });
        const me = await fetchJson('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
        if (!me.ok) return send(res, 200, { ok: false, error: 'Discord didn\'t accept that bot token.' });
        const guildId = pick('DISCORD_GUILD_ID');
        let guild = null;
        if (guildId) {
          const g = await fetchJson(`https://discord.com/api/v10/guilds/${guildId}`, { headers: { Authorization: `Bot ${token}` } });
          guild = g.ok ? g.data.name : false;
        }
        return send(res, 200, { ok: true, bot: me.data.username, guild });
      }
      if (url.pathname === '/api/install') {
        return send(res, 200, await install(body));
      }
      if (url.pathname === '/api/quit') {
        send(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 200);
        return;
      }
    } catch (err) {
      return send(res, 200, { ok: false, error: err.message });
    }
  }
  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => send(res, 500, { error: err.message }));
});

server.listen(PORT, '127.0.0.1', () => {
  const link = CODESPACE_HOST ? `https://${CODESPACE_HOST}` : `http://localhost:${PORT}`;
  console.log(`\n  Crew centre setup is open at ${link}\n  (Ctrl+C here closes it.)\n`);
  if (!process.argv.includes('--no-open') && !CODESPACE_HOST) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', link] : [link];
    execFile(cmd, args, () => {});
  }
});
server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is busy. Try SETUP_PORT=4849 npm run setup` : err.message);
  process.exit(1);
});
