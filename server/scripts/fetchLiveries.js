#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Run once to generate src/data/ifLiveries.json
// Usage: node server/scripts/fetchLiveries.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');

async function main() {
  const key = process.env.IF_API_KEY;
  if (!key) { console.error('IF_API_KEY not set'); process.exit(1); }

  console.log('Fetching liveries from Infinite Flight API...');
  const res  = await fetch(`https://api.infiniteflight.com/public/v2/aircraft/liveries?apikey=${key}`);
  const data = await res.json();
  if (data.errorCode !== 0) { console.error('IF API error', data.errorCode); process.exit(1); }

  // Build compact lookup: { liveryId: "Aircraft Name - Livery Name" }
  const lookup = {};
  for (const l of data.result) {
    lookup[l.id] = `${l.aircraftName} - ${l.liveryName}`;
  }

  const outPath = path.join(__dirname, '../../src/data/ifLiveries.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(lookup, null, 2));
  console.log(`Wrote ${Object.keys(lookup).length} liveries to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
