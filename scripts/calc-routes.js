/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const path = require('path');

// Config
const AIRPORTS_JSON = path.join(__dirname, '../public/airports.json');
const inputFile  = process.argv[2];
const outputFile = process.argv[3] || 'routes-ready.csv';

if (!inputFile) {
  console.error('Usage: node calc-routes.js input.csv [output.csv]');
  process.exit(1);
}

// Geo math
const toRad = d => d * (Math.PI / 180);

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDuration(distNM) {
  const avgSpeed = 480; // knots
  const totalHours = (distNM / avgSpeed) + 0.5;
  const minutes = Math.round(totalHours * 60);
  return Math.round(minutes / 5) * 5;
}

// CSV parser (aircraft preserved exactly)
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());

  const parseRow = line => {
    const cols = [];
    let cur = '';
    let inQ = false;

    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
        cur += ch; // keep quotes
      } else if (ch === ',' && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  };

  const headers = parseRow(lines[0]).map(h =>
    h.replace(/^"|"$/g, '').toLowerCase().trim()
  );

  const idx = name => headers.indexOf(name);

  return lines.slice(1).map(line => {
    const cols = parseRow(line);

    const clean = (val) =>
      val ? val.replace(/^"|"$/g, '') : '';

    return {
      flight_number: clean(cols[idx('flight_number')]).toUpperCase().trim(),
      departure_icao: clean(cols[idx('departure_icao')]).toUpperCase().trim(),
      arrival_icao: clean(cols[idx('arrival_icao')]).toUpperCase().trim(),

      // 🔥 aircraft preserved exactly as-is
      aircraft: cols[idx('aircraft')] || '',

      active:
        clean(cols[idx('active')] || 'true').toLowerCase() !== 'false',

      distance_nm:
        clean(cols[idx('distance_nm')])
          ? Number(clean(cols[idx('distance_nm')]))
          : null,

      duration:
        clean(cols[idx('duration')])
          ? Number(clean(cols[idx('duration')]))
          : null,
    };
  }).filter(r => r.flight_number && r.departure_icao && r.arrival_icao);
}

// Standard CSV escape (used for all except aircraft)
function escapeCSV(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`;
}

// Main
async function main() {
  console.log('Loading airport database...');

  if (!fs.existsSync(AIRPORTS_JSON)) {
    console.error('airports.json not found at:', AIRPORTS_JSON);
    process.exit(1);
  }

  const airports = {};
  JSON.parse(fs.readFileSync(AIRPORTS_JSON, 'utf8')).forEach(a => {
    if (a.icao) airports[a.icao.toUpperCase()] = a;
  });

  console.log(`Loaded ${Object.keys(airports).length} airports`);

  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }

  const routes = parseCSV(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Found ${routes.length} routes to process`);

  const output = [];
  const headers = [
    'flight_number',
    'departure_icao',
    'arrival_icao',
    'distance_nm',
    'duration',
    'aircraft',
    'active'
  ];
  output.push(headers.join(','));

  let ok = 0;
  let skipped = 0;

  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    process.stdout.write(`\rProcessing ${i + 1}/${routes.length}...`);

    let distance = r.distance_nm;
    let duration = r.duration;

    if (!distance || !duration) {
      const dep = airports[r.departure_icao];
      const arr = airports[r.arrival_icao];

      if (!dep) {
        console.log(`\nSkipping ${r.flight_number}: ${r.departure_icao} not found`);
        skipped++;
        continue;
      }

      if (!arr) {
        console.log(`\nSkipping ${r.flight_number}: ${r.arrival_icao} not found`);
        skipped++;
        continue;
      }

      distance = Math.round(
        calcDistance(dep.lat, dep.lng, arr.lat, arr.lng)
      );

      duration = estimateDuration(distance);
    }

    output.push([
      escapeCSV(r.flight_number),
      escapeCSV(r.departure_icao),
      escapeCSV(r.arrival_icao),
      escapeCSV(distance),
      escapeCSV(duration),

      // 🔥 Aircraft written back EXACTLY as imported
      r.aircraft,

      escapeCSV(r.active ? 'true' : 'false')
    ].join(','));

    ok++;
  }

  console.log(`\nDone! ${ok} routes calculated, ${skipped} skipped.`);
  fs.writeFileSync(outputFile, output.join('\n'));
  console.log(`Output saved to: ${outputFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
