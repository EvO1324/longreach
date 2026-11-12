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

const BASE = 'https://airportsapi.com/api';
const PAGE_SIZE = 100;
const PAUSE_MS = 150;
const SAVE_EVERY_N_PAGES = 10; // how often progress is checkpointed to disk
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000; // doubles each retry: 2s, 4s, 8s, 16s

const OUT_PATH = path.join(__dirname, '..', 'airportsapi-data.json');
const PROGRESS_PATH = path.join(__dirname, '..', '.airportsapi-progress.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(cursor) {
  const url = new URL(`${BASE}/airports`);
  url.searchParams.set('include', 'country,region');
  url.searchParams.set('page[size]', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('page[cursor]', cursor);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`  attempt ${attempt}/${MAX_RETRIES} failed (${err.message}) — retrying in ${delay / 1000}s…`);
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

function saveProgress(cursor, allAirports, page) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ cursor, page, airports: allAirports }));
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    console.log('Progress file exists but is corrupted — starting fresh.');
    return null;
  }
}

function writeFinalOutput(allAirports) {
  const withIcao = allAirports.filter(a => a.icao);
  const skipped = allAirports.length - withIcao.length;
  fs.writeFileSync(OUT_PATH, JSON.stringify(withIcao, null, 2));

  console.log(`\n${withIcao.length} airports (with an ICAO code) written to ${OUT_PATH}`);
  if (skipped > 0) console.log(`(${skipped} entries had no ICAO code and were skipped)`);

  const withCountry = withIcao.filter(a => a.country).length;
  const withRegion = withIcao.filter(a => a.region).length;
  console.log(`Country populated: ${withCountry}/${withIcao.length}`);
  console.log(`Region populated:  ${withRegion}/${withIcao.length}`);
  if (withIcao.length > 0 && withCountry === 0 && withRegion === 0) {
    console.log('\n⚠ Country and region came back empty for everything — check the sample logged above against the ASSUMED shape in the comments at the top of this script.');
  }
}

async function main() {
  const resumed = loadProgress();
  let allAirports = resumed?.airports || [];
  let cursor = resumed?.cursor || null;
  let page = resumed?.page || 0;
  let loggedSample = allAirports.length > 0; // don't bother re-logging the sample on a resumed run

  if (resumed) console.log(`Resuming from page ${page + 1} (${allAirports.length} airports already saved)…`);

  try {
    do {
      page++;
      const body = await fetchPage(cursor);
      const included = body.included || [];

      if (!loggedSample && included.length > 0) {
        console.log('\n--- Sample `included` entries from page 1 (check this matches the ASSUMED shape) ---');
        console.log(JSON.stringify(included.slice(0, 2), null, 2));
        console.log('--- end sample ---\n');
        loggedSample = true;
      }

      const countryById = {};
      const regionById = {};
      for (const item of included) {
        if (item.type === 'countries') countryById[item.id] = item.attributes?.name; // ASSUMED shape
        if (item.type === 'regions') regionById[item.id] = item.attributes?.name;    // ASSUMED shape
      }

      for (const a of body.data) {
        const countryId = a.relationships?.country?.data?.id;
        const regionId = a.relationships?.region?.data?.id;
        allAirports.push({
          icao: a.attributes.icao_code || a.attributes.code || null,
          iata: a.attributes.iata_code || null,
          name: a.attributes.name || null,
          lat: a.attributes.latitude != null ? parseFloat(a.attributes.latitude) : null,
          lng: a.attributes.longitude != null ? parseFloat(a.attributes.longitude) : null,
          elevation: a.attributes.elevation ?? null,
          airportType: a.attributes.type || null,
          country: countryId ? (countryById[countryId] || null) : null,
          region: regionId ? (regionById[regionId] || null) : null,
        });
      }

      cursor = body.meta?.next_cursor || null;
      console.log(`Page ${page}: fetched ${body.data.length} (total so far: ${allAirports.length})${cursor ? '' : ' — last page'}`);

      if (page % SAVE_EVERY_N_PAGES === 0) {
        saveProgress(cursor, allAirports, page);
        console.log(`  (progress checkpointed — ${allAirports.length} airports saved so far)`);
      }

      if (cursor) await sleep(PAUSE_MS);
    } while (cursor);
  } catch (err) {
    saveProgress(cursor, allAirports, page - 1); // page-1: this page didn't complete, don't count it as done
    console.error(`\nFailed on page ${page}: ${err.message}`);
    console.error(`Progress saved (${allAirports.length} airports) — just run this script again to resume from here.`);
    process.exit(1);
  }

  writeFinalOutput(allAirports);
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
}

main().catch(err => { console.error('\nUnexpected failure:', err.message); process.exit(1); });
