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

const version = String(process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release -- 1.2.0');
  process.exit(1);
}
for (const file of ['package.json', 'server/package.json']) {
  const p = path.join(__dirname, '..', file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  data.version = version;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
console.log(`Version set to ${version}. To publish it:

  git commit -am "Release v${version}"
  git tag v${version}
  git push && git push --tags
  gh release create v${version} --title "v${version}" --notes "What's new…"

The release notes are what VA admins read before they update, so write them
for VA staff. If the database changed, check server/schema.json is current.`);
