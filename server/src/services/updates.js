/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const path = require('path');
const { version: CURRENT } = require('../../package.json');

const UPSTREAM = process.env.CREWCENTRE_UPSTREAM || 'EvO1324/longreach';
const WORKFLOW = 'crewcentre-update.yml';
const CHECK_EVERY_MS = 30 * 60 * 1000;

function gh(pathname, { method = 'GET', body, token } = {}) {
  return fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'crewcentre',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// "v1.10.2" -> [1, 10, 2]
const parts = v => String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

let cache = null; // { at, releases }
async function releases() {
  if (cache && Date.now() - cache.at < CHECK_EVERY_MS) return cache.releases;
  // a private upstream (while it's in testing) needs a token that can read it
  const res = await gh(`/repos/${UPSTREAM}/releases?per_page=30`, { token: process.env.CREWCENTRE_UPSTREAM_TOKEN });
  if (!res.ok) throw new Error(`Couldn't reach ${UPSTREAM} on GitHub (${res.status})`);
  const list = (await res.json())
    .filter(r => !r.draft && !r.prerelease && /^v?\d+\.\d+/i.test(r.tag_name))
    .map(r => ({ version: r.tag_name, name: r.name || r.tag_name, notes: r.body || '', date: r.published_at, url: r.html_url }));
  cache = { at: Date.now(), releases: list };
  return list;
}

const repo = () => (process.env.GITHUB_CREWCENTRE_REPO || '').trim();
const canApply = () => !!(process.env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(repo()));

async function status() {
  const all = await releases();
  const ahead = all.filter(r => newer(r.version, CURRENT)).sort((a, b) => (newer(a.version, b.version) ? -1 : 1));
  return {
    current: CURRENT,
    latest: ahead[0]?.version || all[0]?.version || CURRENT,
    available: ahead,
    upstream: UPSTREAM,
    canApply: canApply(),
    repo: repo() || null,
  };
}

// Starts the update workflow in the VA's repository
async function apply(version) {
  if (!canApply()) throw new Error('One-click updates need GITHUB_TOKEN and GITHUB_CREWCENTRE_REPO (npm run setup, Services › GitHub).');
  const all = await releases();
  if (!all.some(r => r.version === version)) throw new Error(`${version} isn't a release of ${UPSTREAM}`);
  const r = repo();
  const info = await gh(`/repos/${r}`, { token: process.env.GITHUB_TOKEN });
  if (!info.ok) throw new Error(`GitHub can't find ${r} with this token (${info.status})`);
  const branch = (await info.json()).default_branch || 'main';
  const res = await gh(`/repos/${r}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', token: process.env.GITHUB_TOKEN,
    body: { ref: branch, inputs: { version, upstream: UPSTREAM } },
  });
  if (res.status === 404) throw new Error(`${r} doesn't have .github/workflows/${WORKFLOW} yet. Copy it from the crew centre's repository.`);
  if (!res.ok) throw new Error(`GitHub refused to start the update (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return { started: true, branch };
}

// The newest run of the update workflow: queued, in_progress or completed
async function lastRun() {
  if (!canApply()) return null;
  const res = await gh(`/repos/${repo()}/actions/workflows/${WORKFLOW}/runs?per_page=1`, { token: process.env.GITHUB_TOKEN });
  if (!res.ok) return null;
  const run = (await res.json()).workflow_runs?.[0];
  return run ? { status: run.status, conclusion: run.conclusion, started: run.created_at, url: run.html_url, title: run.display_title } : null;
}

// Release notes (GitHub markdown) -> What's New entries. Headings pick the tag:
// "## New", "## Changed", "## Fixed", "## Removed". Bullets become entries.
const TAGS = [
  [/new|add|feature/i, 'new'],
  [/fix|bug/i, 'fixed'],
  [/remov|drop|deprecat/i, 'removed'],
  [/chang|improv|updat|tweak/i, 'improved'],
];
const plain = t => t
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/(\*\*|__|`)/g, '')
  .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,!?])/g, '$1$2')
  .trim();

function notesToEntries(notes) {
  const out = [];
  let tag = 'improved';
  for (const raw of String(notes || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = line.match(/^\s*#{1,6}\s+(.+)$/) || line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (heading) {
      const found = TAGS.find(([re]) => re.test(heading[1]));
      if (found) tag = found[1];
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (!bullet) continue;
    const text = plain(bullet[2]);
    if (!text) continue;
    // an indented bullet adds detail to the one above it
    if (bullet[1].length >= 2 && out.length) out[out.length - 1].text += ` (${text})`;
    else out.push({ tag, text });
  }
  return out;
}

// Releases up to the installed version, shaped like changelog records
async function installedReleases() {
  const all = await releases();
  return all
    .filter(r => !newer(r.version, CURRENT))
    .map(r => {
      const version = r.version.replace(/^v/i, '');
      const title = r.name && r.name !== r.version && r.name.replace(/^v/i, '') !== version ? r.name : 'Crew centre update';
      return { id: `release-${version}`, source: 'release', version, title, date: r.date, entries: notesToEntries(r.notes) };
    })
    .filter(r => r.entries.length);
}

async function syncSchema(pb) {
  const KEY = 'schema_version';
  const rec = await pb.collection('settings').getFirstListItem(`key = "${KEY}"`, { requestKey: null }).catch(() => null);
  if (rec?.value === CURRENT) return { skipped: true };
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'schema.json'), 'utf8'));
  await pb.collections.import(schema, false);
  if (rec) await pb.collection('settings').update(rec.id, { value: CURRENT });
  else await pb.collection('settings').create({ key: KEY, value: CURRENT });
  console.log(`[updates] database brought up to date for ${CURRENT}`);
  return { synced: true };
}

module.exports = { status, apply, lastRun, syncSchema, newer, notesToEntries, installedReleases, CURRENT, UPSTREAM };
