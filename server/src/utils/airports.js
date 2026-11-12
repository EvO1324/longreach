/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const path = require('path');
const fs   = require('fs');

let _airportMap = null;

function getAirportMap() {
  if (_airportMap) return _airportMap;

  const candidates = [
    path.resolve(__dirname, '../../airports.json'),
    path.resolve(__dirname, '../../../public/airports.json'),
    path.resolve(__dirname, '../../public/airports.json'),
    path.resolve(process.cwd(), 'airports.json'),               // cwd = /app on Fly
    path.resolve(process.cwd(), 'public/airports.json'),
  ];

  let raw = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`[airports] loaded ${raw.length} airports from ${p}`);
      break;
    }
  }

  if (!raw) {
    console.warn('[airports] airports.json not found — distance calculation disabled');
    raw = [];
  }

  _airportMap = {};
  for (const a of raw) {
    if (a.icao && a.lat != null && a.lng != null) {
      _airportMap[a.icao.toUpperCase()] = { lat: a.lat, lng: a.lng, name: a.name, city: a.city, country: a.country };
    }
  }

  const ourAirportsPath = path.resolve(__dirname, '../../airports-ourairports.json');
  if (fs.existsSync(ourAirportsPath)) {
    const ourAirportsData = JSON.parse(fs.readFileSync(ourAirportsPath, 'utf8'));
    let added = 0, overridden = 0;
    for (const a of ourAirportsData) {
      if (!a.icao || a.lat == null || a.lng == null) continue;
      const key = a.icao.toUpperCase();
      if (_airportMap[key]) overridden++; else added++;
      _airportMap[key] = { lat: a.lat, lng: a.lng, name: a.name, city: a.city, country: a.country, region: a.region };
    }
    console.log(`[airports] merged in ${ourAirportsData.length} from airports-ourairports.json (${added} new, ${overridden} overriding base entries)`);
  }

  return _airportMap;
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const R    = 3440.065; // Earth radius in nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Public API

function distanceBetween(depIcao, arrIcao) {
  if (!depIcao || !arrIcao) return null;
  const map = getAirportMap();
  const dep = map[depIcao.toUpperCase()];
  const arr = map[arrIcao.toUpperCase()];
  if (!dep || !arr) return null;
  return Math.round(haversineNm(dep.lat, dep.lng, arr.lat, arr.lng));
}

function lookupAirport(icao) {
  if (!icao) return null;
  return getAirportMap()[icao.toUpperCase()] || null;
}

function nearestAirport(lat, lng, maxNm = 25) {
  if (lat == null || lng == null) return null;
  const map = getAirportMap();
  let best = null;
  for (const [icao, a] of Object.entries(map)) {
    const d = haversineNm(lat, lng, a.lat, a.lng);
    if (!best || d < best.distanceNm) best = { icao, distanceNm: d, name: a.name };
  }
  if (!best || best.distanceNm > maxNm) return null;
  return { icao: best.icao, distanceNm: Math.round(best.distanceNm * 10) / 10, name: best.name };
}

// Pre-warm the map at require time so the first PIREP doesn't pay the load cost
try { getAirportMap(); } catch {}

module.exports = { distanceBetween, lookupAirport, nearestAirport };
