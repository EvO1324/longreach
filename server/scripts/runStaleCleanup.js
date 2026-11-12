#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { runStaleExamCleanup } = require('../src/jobs/staleExamCleanup');

const live = process.argv.includes('--live');

(async () => {
  console.log(live ? 'Running LIVE — matching applications will be deleted.' : 'Running DRY RUN — nothing will be deleted.');
  const result = await runStaleExamCleanup({ dryRun: !live });
  console.log(result);
  process.exit(0);
})();
