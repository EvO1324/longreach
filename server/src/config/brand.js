/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const path = require('path');
const fs = require('fs');
const core = require('./brandCore');

function load() {
  const generated = path.join(__dirname, 'brand.generated.json');
  if (fs.existsSync(generated)) return JSON.parse(fs.readFileSync(generated, 'utf8'));
  // Not generated yet (npm run brand hasn't run): the defaults still work
  const { config, colors } = core.resolve({});
  return { ...config, colors: { ...config.colors, ...colors }, logos: {} };
}

const config = load();
const trimSlash = s => String(s || '').replace(/\/+$/, '');

const brand = {
  ...config,
  callsign: core.callsignTools(config.callsign),
  callsignConfig: config.callsign,
  get frontendUrl() { return trimSlash(process.env.FRONTEND_URL || config.urls?.crewCentre); },
  get apiUrl() { return trimSlash(process.env.BACKEND_URL || config.urls?.api); },
  footer: section => (section ? `${config.shortName} · ${section}` : config.shortName),
  // hex like brand.embedColor('primary') for Discord embeds
  embedColor: (key = 'primary') => parseInt(String(config.colors[key] || config.colors.primary).slice(1), 16),
  logoPath: (kind = 'light') => {
    const p = config.logos?.[kind] || config.logos?.light;
    return p ? path.join(__dirname, '..', '..', p) : null;
  },
  // Path of the app icon on the crew centre site, for push notifications
  appIcon: config.publicLogos?.icon192 || '/brand/icon-192.png',
  emoji: () => config.discord?.logoEmoji || '✈️',
};

module.exports = brand;
