/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

module.exports = {
  apps: [
    {
      name: 'api',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bot',
      script: 'src/bot.js',
      env: { NODE_ENV: 'production' },
    },
  ],
};
