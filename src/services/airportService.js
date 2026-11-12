/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

let airportPromise = null;

const loadAirports = () => {
  if (!airportPromise) {
    airportPromise = fetch('/airports.min.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(({ fields, rows }) => {
        const col = Object.fromEntries(fields.map((f, i) => [f, i]));
        const map = {};
        for (const row of rows) {
          const icao = String(row[col.icao]).toUpperCase();
          map[icao] = {
            icao,
            iata: row[col.iata] || null,
            name: row[col.name],
            city: row[col.city],
            country: row[col.country] || null,
            lat: row[col.lat],
            lng: row[col.lng],
            elevation: row[col.elevation] ?? null,
            timezone: row[col.timezone] || null,
            has3dBuildings: !!row[col.has3d],
            hasJetbridges: !!row[col.hasJetbridges],
          };
        }
        return map;
      })
      .catch(error => {
        airportPromise = null; // let the next call try again
        console.error('Error loading airports:', error);
        throw new Error('Failed to load airport database');
      });
  }
  return airportPromise;
};

// Every airport keyed by ICAO, for pages that need the whole list (maps).
export const loadAirportDb = loadAirports;

export const getAirport = async (icao) => {
  const airports = await loadAirports();
  return airports[icao.toUpperCase()] || null;
};

export const getAirportDistance = async (departureICAO, arrivalICAO) => {
  try {
    const airports = await loadAirports();
    
    const depAirport = airports[departureICAO.toUpperCase()];
    const arrAirport = airports[arrivalICAO.toUpperCase()];

    if (!depAirport) throw new Error(`Airport ${departureICAO} not found in database`);
    if (!arrAirport) throw new Error(`Airport ${arrivalICAO} not found in database`);

    const distance = calculateDistance(depAirport.lat, depAirport.lng, arrAirport.lat, arrAirport.lng);
    return Math.round(distance);
  } catch (error) {
    console.error('Error calculating distance:', error);
    throw error;
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (degrees) => degrees * (Math.PI / 180);

export const estimateFlightTime = (distanceNM) => {
  const averageSpeed = 480;
  const hoursInAir = distanceNM / averageSpeed;
  const totalHours = hoursInAir + 0.5;
  return Math.round(totalHours * 60);
};
