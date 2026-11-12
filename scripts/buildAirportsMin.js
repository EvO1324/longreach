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

const src = path.join(__dirname, '../public/airports.json');
const out = path.join(__dirname, '../public/airports.min.json');
const FIELDS = ['icao', 'iata', 'name', 'city', 'country', 'lat', 'lng', 'elevation', 'timezone', 'has3d', 'hasJetbridges'];
const round = n => (typeof n === 'number' ? Math.round(n * 1e5) / 1e5 : n ?? null);

const airports = JSON.parse(fs.readFileSync(src, 'utf8'));
const rows = airports.filter(a => a.icao).map(a => FIELDS.map(f => {
  if (f === 'lat' || f === 'lng') return round(a[f]);
  if (f === 'has3d' || f === 'hasJetbridges') return a[f] ? 1 : 0;
  return a[f] ?? null;
}));
fs.writeFileSync(out, JSON.stringify({ fields: FIELDS, rows }));
console.log(`airports.min.json: ${rows.length} airports, ${Math.round(fs.statSync(out).size / 1024)} KB (from ${Math.round(fs.statSync(src).size / 1024)} KB)`);
