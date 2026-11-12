/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import config from './config.generated.json';
import core from './brandCore';

const brand = config;
export const callsign = core.callsignTools(config.callsign);
// Which plugins are on. Starts from va.config.json and is updated from
// Admin › Plugins when the site loads (see App.js).
export const features = { ...(config.features || {}) };
export const colors = config.colors;
export const logoFor = darkMode => (darkMode ? config.logos.dark : config.logos.light);

export default brand;
