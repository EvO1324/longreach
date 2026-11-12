#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'server', '.env');
// Only for running on your own computer
const LOCAL_ONLY = new Set(['DISABLE_JOBS', 'NODE_ENV', 'PORT']);

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('No server/.env yet. Run npm run setup first.');
    process.exit(1);
  }
  const out = [];
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || LOCAL_ONLY.has(m[1])) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
    else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v === '') continue;
    if (/[\r\n]/.test(v)) { console.error(`${m[1]} has a line break in it; set that one by hand with fly secrets set.`); process.exit(1); }
    out.push([m[1], v]);
  }
  return out;
}

function flyctl() {
  const home = path.join(os.homedir(), '.fly', 'bin', process.platform === 'win32' ? 'flyctl.exe' : 'flyctl');
  for (const cmd of ['fly', 'flyctl', home]) {
    const r = spawnSync(cmd, ['version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return null;
}

const pairs = readEnv();
if (process.argv.includes('--print')) {
  for (const [k] of pairs) console.log(`  ${k}`);
  console.log(`\n${pairs.length} settings would be sent.`);
  process.exit(0);
}

const fly = flyctl();
if (!fly) {
  console.error('The Fly.io command line tool isn\'t installed. See https://fly.io/docs/flyctl/install/');
  process.exit(1);
}
const r = spawnSync(fly, ['secrets', 'import', '--stage', '-c', path.join(ROOT, 'server', 'fly.toml')], {
  input: pairs.map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (r.status === 0) console.log(`\nSent ${pairs.length} settings. They apply on the next deploy: cd server && fly deploy`);
process.exit(r.status || 0);
