/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const read = file => (fs.existsSync(path.join(root, file)) ? dotenv.parse(fs.readFileSync(path.join(root, file))) : {});
const testHook = read('.env.local').DISCORD_WEBHOOK_IFLIVE || '';
const liveHook = read('.env').DISCORD_WEBHOOK_IFLIVE || '';

const args = process.argv.slice(2);
const fileOnly = args.includes('--file');
const prompt = args.includes('--prompt');
const landed = args.includes('--landed') || prompt;
const rego = args.find(a => !a.startsWith('--'));

if (prompt && !read('.env.local').DISCORD_BOT_TOKEN) {
  console.error('--prompt posts as the bot: add the TEST bot token to server/.env.local as DISCORD_BOT_TOKEN=.');
  process.exit(1);
}
if (!fileOnly && (!testHook || testHook === liveHook)) {
  console.error('Add a webhook for a TEST channel to server/.env.local as DISCORD_WEBHOOK_IFLIVE= (it must differ from .env).');
  console.error('Or run with --file to just save the image.');
  process.exit(1);
}

// .env.local first so it wins, then .env for everything else (PocketBase etc.)
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const { getAdminClient } = require('../src/config/pocketbase');
const { escFilterValue } = require('../src/utils/pbFilter');
const { bookingPass, landedCard } = require('../src/services/boardingPass');
const { notifyBookingCreated, notifyAircraftLanded } = require('../src/routes/discord');
const { postLandingPrompt, replacePromptWithImage } = require('../src/services/landingPrompt');

// Writes the image to a file, or posts it to the test channel
async function output(draw, notify) {
  if (fileOnly) {
    const out = path.join(root, 'boarding-pass-test.png');
    fs.writeFileSync(out, await draw());
    console.log(`Saved ${out}`);
  } else {
    await notify();
    console.log('Posted to the test channel. Check Discord.');
  }
}

// No discord_id, so nobody is pinged
const quiet = p => (p ? { ...p, discord_id: null } : null);

async function testBooked(pb) {
  const bid = await pb.collection('if_live_bids').getFirstListItem(
    rego ? `aircraft_registration = "${escFilterValue(rego)}"` : 'id != ""',
    { sort: '-created', expand: 'pilot', requestKey: null },
  ).catch(() => null);
  if (!bid) {
    // list the aircraft that have bookings to pick from
    const recent = await pb.collection('if_live_bids').getList(1, 200, { sort: '-created', fields: 'aircraft_registration', requestKey: null });
    const regos = [...new Set(recent.items.map(b => b.aircraft_registration).filter(Boolean))].sort();
    throw new Error(`${rego ? `No booking found for ${rego}` : 'No bookings found'}. Aircraft with bookings: ${regos.join(', ')}`);
  }
  const booking = { pilot: quiet(bid.expand?.pilot), aircraftRegistration: bid.aircraft_registration, aircraftTypeId: bid.aircraft_type_id, legs: bid.legs };
  console.log(`Booking: ${bid.aircraft_registration}, ${(bid.legs || []).map(l => `${l.originIcao}-${l.destIcao}`).join(', ')}`);
  await output(() => bookingPass(booking), () => notifyBookingCreated(booking));
}

// The most recent leg with a PIREP, plus that PIREP's landing stats and fuel
async function testLanded(pb) {
  const recent = await pb.collection('if_live_bids').getList(1, 100, {
    filter: rego ? `aircraft_registration = "${escFilterValue(rego)}"` : '',
    sort: '-updated', expand: 'pilot', requestKey: null,
  });
  const bid = recent.items.find(b => (b.legs || []).some(l => l.pirepId));
  if (!bid) {
    const regos = [...new Set(recent.items.filter(b => (b.legs || []).some(l => l.pirepId)).map(b => b.aircraft_registration))].sort();
    throw new Error(`No filed Live leg${rego ? ` on ${rego}` : ''}.${regos.length ? ` Try: ${regos.join(', ')}` : ''}`);
  }
  const legs = bid.legs || [];
  const leg = legs.filter(l => l.pirepId).sort((a, b) => Date.parse(b.loggedAt || 0) - Date.parse(a.loggedAt || 0))[0];
  const flight = await pb.collection('flights').getOne(leg.pirepId, { fields: 'landing_stats,fuel_used_kg,flight_time', requestKey: null }).catch(() => null);
  const nextLeg = legs.find(l => l !== leg && !l.pirepId && !l.expired) || null;
  const landing = {
    pilot: quiet(bid.expand?.pilot),
    leg,
    aircraftRegistration: bid.aircraft_registration,
    aircraftTypeId: bid.aircraft_type_id,
    flightTimeHours: flight?.flight_time ?? leg.pirepFlightTime,
    landingStats: typeof flight?.landing_stats === 'string' ? JSON.parse(flight.landing_stats) : flight?.landing_stats,
    fuelUsedKg: flight?.fuel_used_kg,
    availableToBook: !nextLeg,
    nextLeg,
  };
  console.log(`Landed: ${bid.aircraft_registration}, ${leg.originIcao}-${leg.destIcao}`);
  if (prompt) {
    // a made-up booking id, so pressing the button finds nothing to file
    const where = await postLandingPrompt({ pilot: landing.pilot, bid: { id: 'test-only', aircraft_registration: bid.aircraft_registration, legs: [leg] }, legIndex: 0 });
    console.log('Posted the prompt. Swapping it for the landed image in 10 seconds...');
    await new Promise(r => setTimeout(r, 10000));
    await replacePromptWithImage(where, { name: 'landed.png', buffer: await landedCard(landing) });
    console.log('Swapped. Check Discord.');
    return;
  }
  await output(() => landedCard(landing), () => notifyAircraftLanded(landing));
}

(async () => {
  const pb = await getAdminClient();
  await (landed ? testLanded(pb) : testBooked(pb));
  process.exit(0);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
