/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Starts the API (node src/boot.js) or the bot (node src/boot.js bot) with the
// settings saved in Admin › Connections laid over .env.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('./config/runtime').load().finally(() => {
  require(process.argv[2] === 'bot' ? './bot' : './index');
});
