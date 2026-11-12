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

const args = process.argv.slice(2);
const live = args.includes('--live');
const envAt = args.indexOf('--env');
const envFile = envAt >= 0 ? path.resolve(args[envAt + 1]) : path.join(__dirname, '..', 'server', '.env');
const skipAt = args.indexOf('--skip');
const skip = new Set(skipAt >= 0 ? String(args[skipAt + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : []);

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const describe = v => (v === null ? 'admin only' : v === '' ? 'ANYONE' : `"${v}"`);

(async () => {
  if (!fs.existsSync(envFile)) throw new Error(`No ${envFile}`);
  const env = readEnv(envFile);
  const url = String(env.POCKETBASE_URL || '').replace(/\/+$/, '');
  if (!url) throw new Error(`POCKETBASE_URL isn't set in ${envFile}`);

  const auth = await fetch(`${url}/api/admins/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!auth.ok) throw new Error(`PocketBase admin sign-in failed (${auth.status})`);
  const { token } = await auth.json();
  const headers = { Authorization: token, 'Content-Type': 'application/json' };

  const list = await (await fetch(`${url}/api/collections?perPage=500`, { headers })).json();
  const open = list.items.filter(c => !c.system && !skip.has(c.name) && (RULES.some(r => c[r] !== null) || (c.type === 'auth' && c.options?.manageRule)));

  console.log(`${url}: ${list.items.length} tables, ${open.length} with open rules${skip.size ? ` (skipping ${[...skip].join(', ')})` : ''}${live ? '' : ' (dry run: add --live to lock them)'}\n`);
  for (const c of open) {
    const now = RULES.filter(r => c[r] !== null).map(r => `${r.replace('Rule', '')}: ${describe(c[r])}`).join(', ');
    console.log(`  ${c.name.padEnd(28)} ${now}`);
    if (!live) continue;
    const body = Object.fromEntries(RULES.map(r => [r, null]));
    if (c.type === 'auth') body.options = { ...c.options, manageRule: null };
    const res = await fetch(`${url}/api/collections/${c.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${c.name}: PocketBase answered ${res.status} ${await res.text()}`);
  }
  console.log(live ? `\nLocked ${open.length} tables.` : '');
})().catch(err => { console.error(err.message); process.exit(1); });
