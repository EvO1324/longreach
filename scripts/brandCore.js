/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

/* eslint-disable */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrandCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Defaults
  var DEFAULTS = {
    name: 'Example Virtual Airlines',
    shortName: 'Example Virtual',
    abbreviation: 'EVA',
    crewCentreName: 'Crew Centre',
    description: 'A virtual airline flying on Infinite Flight.',
    callsign: { format: 'Example {n}VA', short: 'EVA{n}', min: 100, max: 999, legacy: [] },
    colors: { primary: '#1f5f8b', accent: '#d9a441', neutrals: 'warm' },
    logos: { light: 'brand/default/logo-light.svg', dark: 'brand/default/logo-dark.svg', icon: 'brand/default/icon.svg' },
    timezone: 'UTC',
    // Career mode hubs: where a career can start
    hubs: [{ icao: 'KLAX', name: 'Los Angeles' }, { icao: 'KJFK', name: 'New York' }],
    // Infinite Flight grade needed to sign up
    requirements: { minimumGrade: 3 },
    // ATC hours: airports whose ICAO starts with one of these count (empty: any)
    atc: { airportPrefixes: [], regionName: '' },
    urls: { crewCentre: 'http://localhost:3000', api: 'http://localhost:3001', website: '', discordInvite: '' },
    legal: { operator: '', contact: '', jurisdiction: '', minimumAge: 13 },
    discord: { logoEmoji: '' },
    features: {
      career: true, events: true, challenges: true, routesOfTheWeek: true,
      liveMode: true, atc: true,
    },
    dashboard: {
      greeting: 'Welcome back, {name}',
      stats: ['flights', 'hours', 'lastFlight', 'streak'],
      sections: ['rank', 'activeAtc', 'routesOfTheWeek', 'recentFlights'],
    },
    // The site's typeface, from FONTS
    font: 'Plus Jakarta Sans',
  };

  var NEUTRALS = {
    warm: {
      label: 'Warm',
      light: { bgPrimary: '#ffffff', bgSecondary: '#f6f4f0', bgCard: '#ffffff', bgHover: '#eeebe4', textPrimary: '#1c1c1a', textSecondary: '#6b6b63', border: '#e2dfd8' },
      dark:  { bgPrimary: '#1a1a1a', bgSecondary: '#121212', bgCard: '#252525', bgHover: '#2f2f2f', textPrimary: '#e8e8e8', textSecondary: '#a0a0a0', border: '#3a3a3a' },
    },
    cool: {
      label: 'Cool',
      light: { bgPrimary: '#ffffff', bgSecondary: '#f3f5f8', bgCard: '#ffffff', bgHover: '#e8ecf1', textPrimary: '#1a1d21', textSecondary: '#5f6670', border: '#dde2e8' },
      dark:  { bgPrimary: '#171a1f', bgSecondary: '#111317', bgCard: '#21252b', bgHover: '#2b3038', textPrimary: '#e6e9ed', textSecondary: '#9aa1ab', border: '#353b44' },
    },
    neutral: {
      label: 'Neutral',
      light: { bgPrimary: '#ffffff', bgSecondary: '#f5f5f5', bgCard: '#ffffff', bgHover: '#ebebeb', textPrimary: '#1c1c1c', textSecondary: '#666666', border: '#e0e0e0' },
      dark:  { bgPrimary: '#1a1a1a', bgSecondary: '#121212', bgCard: '#242424', bgHover: '#2e2e2e', textPrimary: '#e8e8e8', textSecondary: '#a0a0a0', border: '#383838' },
    },
  };

  var DASHBOARD_STATS = [
    { key: 'flights', label: 'Flights', desc: 'Approved flights, all time' },
    { key: 'hours', label: 'Hours', desc: 'Total flight hours' },
    { key: 'lastFlight', label: 'Last flight', desc: 'How long since their last flight' },
    { key: 'streak', label: 'Activity streak', desc: 'Days in a row with a flight' },
    { key: 'monthHours', label: 'Hours this month', desc: 'With last month alongside' },
    { key: 'monthFlights', label: 'Flights this month', desc: 'With last month alongside' },
    { key: 'distance', label: 'Distance flown', desc: 'Nautical miles, all time' },
    { key: 'avgFlight', label: 'Average flight', desc: 'Average flight time' },
    { key: 'longest', label: 'Longest flight', desc: 'Their longest flight and its route' },
    { key: 'rank', label: 'Rank', desc: 'Their current rank' },
    { key: 'nextRank', label: 'Next rank', desc: 'Hours to go until the next rank' },
    { key: 'topAircraft', label: 'Favourite aircraft', desc: 'The type they fly most' },
    { key: 'topAirport', label: 'Favourite airport', desc: 'The airport they visit most' },
    { key: 'atcHours', label: 'ATC hours', desc: 'Hours controlling on Infinite Flight' },
  ];
  var DASHBOARD_SECTIONS = [
    { key: 'rank', label: 'Rank progress', desc: 'Their rank and the progress to the next one' },
    { key: 'activeAtc', label: 'Active ATC', desc: 'Who is controlling on the Expert Server now', feature: 'atc' },
    { key: 'routesOfTheWeek', label: 'Routes of the Week', desc: 'Today\'s featured routes', feature: 'routesOfTheWeek' },
    { key: 'recentFlights', label: 'Recent flights', desc: 'Their last five flights' },
  ];
  // Google Fonts the site can use (system: the device's own, nothing to load)
  var FONTS = [
    { name: 'Plus Jakarta Sans', note: 'Friendly and modern (the default)' },
    { name: 'Inter', note: 'Neutral, very readable' },
    { name: 'Manrope', note: 'Rounded and open' },
    { name: 'DM Sans', note: 'Geometric and compact' },
    { name: 'IBM Plex Sans', note: 'Technical, a little formal' },
    { name: 'Source Sans 3', note: 'Classic and plain' },
    { name: 'Work Sans', note: 'Wide and confident' },
    { name: 'System', note: 'The device\'s own font, nothing to download' },
  ];
  function fontStack(name) {
    var system = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    return name === 'System' ? system : '"' + name + '", ' + system;
  }
  function fontImport(name) {
    if (name === 'System') return '';
    return "@import url('https://fonts.googleapis.com/css2?family=" + name.replace(/ /g, '+') + ":wght@400;500;600;700;800&display=swap');";
  }

  function xmlEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function initials(config) {
    var a = String(config.abbreviation || config.shortName || 'VA').replace(/[^A-Za-z0-9]/g, '');
    return a.slice(0, 3).toUpperCase() || 'VA';
  }
  function placeholderLogo(kind, config, colors) {
    var p = colors.primary, ink = colors.onPrimary;
    var font = 'font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-weight="700"';
    var ini = initials(config);
    var iniSize = ini.length > 2 ? 22 : 27;
    if (kind === 'icon') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="' + p + '"/>'
        + '<text x="32" y="' + (32 + iniSize * 0.36) + '" text-anchor="middle" ' + font + ' font-size="' + iniSize + '" fill="' + ink + '">' + xmlEsc(ini) + '</text></svg>';
    }
    var name = String(config.shortName || config.name || 'Your VA');
    var w = Math.round(52 + name.length * 11.2);
    var text = kind === 'dark' ? '#e8e8e8' : '#1c1c1a';
    var mini = ini.length > 2 ? 13 : 16;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' 48"><rect x="0" y="4" width="40" height="40" rx="9" fill="' + p + '"/>'
      + '<text x="20" y="' + (24 + mini * 0.36) + '" text-anchor="middle" ' + font + ' font-size="' + mini + '" fill="' + ink + '">' + xmlEsc(ini) + '</text>'
      + '<text x="52" y="31" ' + font + ' font-size="19" fill="' + text + '">' + xmlEsc(name) + '</text></svg>';
  }

  // Colour maths
  function normalizeHex(hex) {
    var h = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(function (c) { return c + c; }).join('');
    return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
  }
  function hexToRgb(hex) {
    var h = normalizeHex(hex).slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) { return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'); }).join('');
  }
  // amount 0..1 of the way from hex to target
  function mix(hex, target, amount) {
    var a = hexToRgb(hex), b = hexToRgb(target);
    return rgbToHex(a.map(function (v, i) { return v + (b[i] - v) * amount; }));
  }
  function luminance(hex) {
    return hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce(function (sum, v, i) { return sum + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // Everything the CSS and the code need from the two chosen colours
  function deriveColors(colors) {
    colors = colors || {};
    var primary = normalizeHex(colors.primary) || DEFAULTS.colors.primary;
    var accent = normalizeHex(colors.accent) || DEFAULTS.colors.accent;
    var neutralsKey = NEUTRALS[colors.neutrals] ? colors.neutrals : 'warm';
    var onPrimary = contrast(primary, '#ffffff') >= 3 ? '#ffffff' : '#1c1c1a';
    var onAccent = contrast(accent, '#ffffff') >= 3 ? '#ffffff' : '#1c1c1a';
    return {
      primary: primary,
      primaryDark: mix(primary, '#000000', 0.25),
      primaryLight: mix(primary, '#ffffff', 0.18),
      primaryPale: mix(primary, '#ffffff', 0.86),
      primaryRgb: hexToRgb(primary).join(', '),
      onPrimary: onPrimary,
      accent: accent,
      accentDark: mix(accent, '#000000', 0.18),
      accentLight: mix(accent, '#ffffff', 0.22),
      accentPale: mix(accent, '#ffffff', 0.88),
      accentRgb: hexToRgb(accent).join(', '),
      onAccent: onAccent,
      // the dashboard banner: very deep shades of the main colour
      heroFrom: mix(primary, '#000000', 0.66),
      heroMid: mix(primary, '#000000', 0.45),
      heroTo: mix(primary, '#000000', 0.7),
      deep: mix(primary, '#000000', 0.78),
      neutrals: neutralsKey,
      light: NEUTRALS[neutralsKey].light,
      dark: NEUTRALS[neutralsKey].dark,
    };
  }

  function cssFor(c, font) {
    font = font || DEFAULTS.font;
    function block(n) {
      return [
        '  --bg-primary:   ' + n.bgPrimary + ';',
        '  --bg-secondary: ' + n.bgSecondary + ';',
        '  --bg-card:      ' + n.bgCard + ';',
        '  --bg-hover:     ' + n.bgHover + ';',
        '  --text-primary:   ' + n.textPrimary + ';',
        '  --text-secondary: ' + n.textSecondary + ';',
        '  --border-color: ' + n.border + ';',
      ].join('\n');
    }
    return [fontImport(font),
      '/* Generated by npm run brand from va.config.json. Don\'t edit: change the',
      '   config (or run npm run setup) and it\'s rebuilt. */',
      ':root {',
      '  --brand-primary:       ' + c.primary + ';',
      '  --brand-primary-dark:  ' + c.primaryDark + ';',
      '  --brand-primary-light: ' + c.primaryLight + ';',
      '  --brand-primary-pale:  ' + c.primaryPale + ';',
      '  --brand-primary-rgb:   ' + c.primaryRgb + ';',
      '  --brand-on-primary:    ' + c.onPrimary + ';',
      '  --brand-accent:        ' + c.accent + ';',
      '  --brand-accent-dark:   ' + c.accentDark + ';',
      '  --brand-accent-light:  ' + c.accentLight + ';',
      '  --brand-accent-pale:   ' + c.accentPale + ';',
      '  --brand-accent-rgb:    ' + c.accentRgb + ';',
      '  --brand-on-accent:     ' + c.onAccent + ';',
      '  --brand-hero: linear-gradient(135deg, ' + c.heroFrom + ' 0%, ' + c.heroMid + ' 50%, ' + c.heroTo + ' 100%);',
      '  --brand-deep:          ' + c.deep + ';',
      '  --brand-font: ' + fontStack(font) + ';',
      '',
      block(c.light),
      '  --shadow:       rgba(0, 0, 0, 0.06);',
      '  --shadow-hover: rgba(0, 0, 0, 0.13);',
      '}',
      '',
      'body.dark-mode {',
      block(c.dark),
      '  --shadow:       rgba(0, 0, 0, 0.3);',
      '  --shadow-hover: rgba(0, 0, 0, 0.5);',
      '}',
      '',
    ].join('\n');
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function formatToRegexSource(format) {
    var parts = String(format).split('{n}');
    if (parts.length !== 2) return null;
    var side = function (s) { return escapeRe(s).replace(/\s+/g, '\\s+'); };
    return '^' + side(parts[0]) + '(\\d+)' + side(parts[1]);
  }

  function callsignTools(cs) {
    cs = cs || DEFAULTS.callsign;
    var formats = [cs.format].concat(cs.legacy || []).filter(Boolean);
    var res = formats.map(formatToRegexSource).filter(Boolean).map(function (s) { return new RegExp(s, 'i'); });
    var main = res[0];
    function fill(fmt, n) { return String(fmt || '').replace('{n}', String(n)); }
    return {
      // "Australia 123VG"
      format: function (n) { return fill(cs.format, n); },
      // "AVG123": Discord nicknames, bot search
      short: function (n) { return fill(cs.short || cs.format, n); },
      // the pilot number from any accepted format, or null
      number: function (callsign) {
        var s = String(callsign || '').trim();
        for (var i = 0; i < res.length; i++) { var m = s.match(res[i]); if (m) return m[1]; }
        var sm = cs.short && formatToRegexSource(cs.short);
        var m2 = sm && s.match(new RegExp(sm + '$', 'i'));
        return m2 ? m2[1] : null;
      },
      // true for a flight flying under the VA's callsign on Infinite Flight
      isVa: function (callsign) { return !!main && main.test(String(callsign || '').trim()); },
      regexSource: main ? main.source : null,
      min: Number(cs.min) || 1,
      max: Number(cs.max) || 999,
    };
  }

  // Config
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    });
    return out;
  }

  function resolve(input) {
    var config = merge(DEFAULTS, input || {});
    var errors = [], warnings = [];
    ['name', 'shortName', 'abbreviation'].forEach(function (k) {
      if (!String(config[k] || '').trim()) errors.push(k + ' is required');
    });
    if (!normalizeHex(config.colors.primary)) errors.push('colors.primary must be a hex colour like #1f5f8b');
    if (!normalizeHex(config.colors.accent)) errors.push('colors.accent must be a hex colour like #d9a441');
    var fmt = String(config.callsign.format || '');
    if ((fmt.match(/\{n\}/g) || []).length !== 1) errors.push('callsign.format must contain {n} exactly once, e.g. "Example {n}VA"');
    if (config.callsign.short && (String(config.callsign.short).match(/\{n\}/g) || []).length !== 1) errors.push('callsign.short must contain {n} exactly once, e.g. "EVA{n}"');
    var min = Number(config.callsign.min), max = Number(config.callsign.max);
    if (!(min >= 0) || !(max > min)) errors.push('callsign.min and callsign.max must be numbers with max above min');
    if (!Array.isArray(config.hubs) || !config.hubs.length) errors.push('hubs needs at least one career hub, e.g. [{ "icao": "KLAX", "name": "Los Angeles" }]');
    else config.hubs.forEach(function (h, i) {
      if (!h || !/^[A-Z0-9]{4}$/i.test(h.icao || '')) errors.push('hubs[' + i + '].icao must be a 4-letter ICAO code');
    });
    var statKeys = DASHBOARD_STATS.map(function (x) { return x.key; });
    var d = config.dashboard || {};
    if (!Array.isArray(d.stats) || d.stats.length < 2 || d.stats.length > 6) errors.push('dashboard.stats needs 2 to 6 cards');
    else d.stats.forEach(function (k) { if (statKeys.indexOf(k) < 0) errors.push('dashboard.stats: "' + k + '" isn\'t a card (' + statKeys.join(', ') + ')'); });
    var sectionKeys = DASHBOARD_SECTIONS.map(function (x) { return x.key; });
    (Array.isArray(d.sections) ? d.sections : []).forEach(function (k) { if (sectionKeys.indexOf(k) < 0) errors.push('dashboard.sections: "' + k + '" isn\'t a section (' + sectionKeys.join(', ') + ')'); });
    if (FONTS.map(function (f) { return f.name; }).indexOf(config.font) < 0) errors.push('font must be one of: ' + FONTS.map(function (f) { return f.name; }).join(', '));
    try { new Intl.DateTimeFormat('en-US', { timeZone: config.timezone }); }
    catch (e) { errors.push('timezone "' + config.timezone + '" isn\'t a valid IANA time zone (e.g. Australia/Sydney, Europe/London)'); }

    var colors = deriveColors(config.colors);
    if (!errors.length) {
      var onWhite = contrast(colors.primary, '#ffffff');
      if (onWhite < 3) warnings.push('The primary colour is light, so links and headings in it are hard to read on white. A darker shade would work better.');
      if (colors.onPrimary !== '#ffffff') warnings.push('Buttons in the primary colour will use dark text, as white wouldn\'t be readable on it.');
    }
    if (!/^https?:\/\//.test(config.urls.crewCentre || '')) warnings.push('urls.crewCentre should be the full address of the crew centre, e.g. https://crew.example.com');
    return { config: config, colors: colors, errors: errors, warnings: warnings };
  }

  // Plugins: optional parts of the crew centre that admins switch on and off in
  // Admin › Plugins. The id is also the key in va.config.json "features", which
  // sets the starting state. A new plugin ships switched off (on: false) so an
  // update never turns something on by surprise. See PLUGINS.md.
  //   api:      API paths that answer 404 while it's off (apiAllow: except these)
  //   commands: Discord slash commands that are only registered while it's on
  var PLUGINS = [
    { id: 'career', name: 'Career mode', on: true,
      description: 'Pilots pick a hub and work through a structured career, unlocking routes as they go.',
      api: ['/api/career'], commands: ['career'] },
    { id: 'liveMode', name: 'Live Mode', on: true,
      description: 'A shared fleet for Infinite Flight Live Mode. Pilots book aircraft, and landings are filed as PIREPs automatically.',
      api: ['/api/if-live'], apiAllow: ['/api/if-live/auth-start', '/api/if-live/callback', '/api/if-live/disconnect'],
      commands: ['liveboard', 'livebookings', 'liveflights', 'liveleaderboard', 'livestats'] },
    { id: 'routesOfTheWeek', name: 'Routes of the Week', on: true,
      description: 'Staff feature routes each week, with bonus multipliers. Posted to Discord every Monday.',
      api: ['/api/rotw'], commands: ['rotw'] },
    { id: 'events', name: 'Events', on: true,
      description: 'Group flights and events with sign-ups, gates and automatic attendance.',
      api: ['/api/events'], commands: [] },
    { id: 'challenges', name: 'Challenges', on: true,
      description: 'Goals pilots work towards, like a set of routes or hours, with badges for finishing.',
      api: ['/api/challenges'], commands: [] },
    { id: 'atc', name: 'ATC sessions', on: true,
      description: 'Pilots log IFATC sessions alongside their flights, and the dashboard shows who is controlling.',
      api: [], commands: ['atc'] },
  ];

  // Which plugins are on: saved choices first, then va.config.json features,
  // then each plugin's own default
  function pluginState(saved, features) {
    var out = {};
    PLUGINS.forEach(function (p) {
      if (saved && typeof saved[p.id] === 'boolean') out[p.id] = saved[p.id];
      else if (features && typeof features[p.id] === 'boolean') out[p.id] = features[p.id];
      else out[p.id] = p.on !== false;
    });
    return out;
  }

  return {
    PLUGINS: PLUGINS, pluginState: pluginState,
    DEFAULTS: DEFAULTS, NEUTRALS: NEUTRALS,
    normalizeHex: normalizeHex, hexToRgb: hexToRgb, mix: mix, contrast: contrast,
    deriveColors: deriveColors, cssFor: cssFor,
    DASHBOARD_STATS: DASHBOARD_STATS, DASHBOARD_SECTIONS: DASHBOARD_SECTIONS, FONTS: FONTS, fontStack: fontStack,
    callsignTools: callsignTools, formatToRegexSource: formatToRegexSource,
    resolve: resolve, merge: merge, placeholderLogo: placeholderLogo,
  };
});
