/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const fs = require('fs');
const va = require('../config/brand');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { getAdminClient } = require('../config/pocketbase');
const { escFilterValue } = require('../utils/pbFilter');
const { lookupAirport } = require('../utils/airports');
const { lookupLivery } = require('../utils/ifLiveryLookup');

const FONT = 'Jakarta';
// The VA's icon (va.config.json logos.icon, copied to server/assets/brand by
// npm run brand)
let logoPromise = null;
const loadLogo = () => (logoPromise ||= (async () => loadImage(fs.readFileSync(va.logoPath('icon'))))().catch(() => null));

const fontDir = path.join(path.dirname(require.resolve('@fontsource/plus-jakarta-sans/package.json')), 'files');
for (const weight of [400, 700, 800]) {
  GlobalFonts.registerFromPath(path.join(fontDir, `plus-jakarta-sans-latin-${weight}-normal.woff2`), FONT);
}

const W = 640;          // logical size; drawn at SCALE
const PHOTO_H = 120;
const BAND_H = 56;      // in place of the photo when there isn't one
const BODY_H = 156;     // plus NEXT_H when there's a line underneath
const NEXT_H = 36;
const STRIP_H = 6;
const PAD = 24;
const RADIUS = 16;
const SCALE = 2;
const START_WINDOW_MS = 4 * 60 * 60 * 1000;

const INK_RGB = va.colors.primaryDark.match(/\w\w/g).map(h => parseInt(h, 16)).join(', ');
const C = {
  cream: '#fdf6e3', green: va.colors.primary, greenDark: va.colors.primaryDark, gold: va.colors.accent,
  label: `rgba(${INK_RGB}, 0.62)`, rule: `rgba(${INK_RGB}, 0.16)`,
};

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

function cityName(icao) {
  const city = lookupAirport(icao)?.city;
  return city ? city.replace(/\s*\(.*\)\s*$/, '') : '';
}

function shortType(type) {
  return (type || '')
    .replace(/^(Airbus|Boeing|Embraer|Bombardier|De Havilland( Canada)?|ATR)\s+/i, '')
    .replace(/\s+NEO\b/i, 'neo')
    .replace(/^Dash 8-?/i, '')
    .trim();
}

const zulu = ms => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}:${String(new Date(ms).getUTCMinutes()).padStart(2, '0')}Z`;
const dayLabel = ms => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();

// Shrinks text until it fits `maxWidth`
function fitText(ctx, text, weight, size, maxWidth, min = 10) {
  let s = size;
  ctx.font = font(weight, s);
  while (s > min && ctx.measureText(text).width > maxWidth) ctx.font = font(weight, --s);
  return text;
}

function label(ctx, text, x, y) {
  ctx.fillStyle = C.label;
  ctx.font = font(700, 9.5);
  ctx.letterSpacing = '1px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function value(ctx, text, x, y, maxWidth) {
  ctx.fillStyle = C.greenDark;
  fitText(ctx, text, 700, 15, maxWidth);
  ctx.fillText(text, x, y);
}

function sub(ctx, text, x, y, maxWidth) {
  if (!text) return;
  ctx.fillStyle = C.green;
  fitText(ctx, text, 400, 11.5, maxWidth);
  ctx.fillText(text, x, y);
}

function rule(ctx, y) {
  ctx.fillStyle = C.rule;
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
}

function githubRaw(url) {
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}` : null;
}

async function fetchImage(url) {
  for (const src of [url, githubRaw(url)].filter(Boolean)) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(5000) });
      if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) continue;
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch { /* try the next source */ }
  }
  return null; // no photo is fine: the card gets the green band instead
}

function brand(ctx, logo, x, cy, { size, color }) {
  const r = size * 1.3;
  let textX = x;
  if (logo) {
    const d = r * 2 * 1.02;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + r, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // 512 px down to ~60: the default filter blurs it
    ctx.drawImage(logo, x + r - d / 2, cy - d / 2, d, d);
    ctx.restore();
    textX = x + r * 2 + 9;
  }
  ctx.fillStyle = color;
  ctx.font = font(800, size);
  ctx.letterSpacing = '1.5px';
  ctx.textBaseline = 'middle';
  ctx.fillText(va.name.toUpperCase(), textX, cy + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
}

// Draws `img` to cover the box, cropped from the centre
function drawCover(ctx, img, x, y, w, h) {
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawNext(ctx, next, top) {
  rule(ctx, top - 6);
  const ny = top + 18;
  label(ctx, next.label, PAD, ny);
  ctx.font = font(700, 9.5);
  ctx.letterSpacing = '1px';
  let x = PAD + ctx.measureText(next.label.toUpperCase()).width + 14;
  ctx.letterSpacing = '0px';
  const legs = next.legs || [];
  const shown = legs.slice(0, 2);
  shown.forEach((leg, i) => {
    const text = `${leg.flightNumber || ''}  ${leg.originIcao}-${leg.destIcao}`.trim();
    ctx.fillStyle = C.greenDark;
    ctx.font = font(700, 13);
    ctx.fillText(text, x, ny + 1);
    x += ctx.measureText(text).width;
    const city = cityName(leg.destIcao);
    if (city) {
      ctx.fillStyle = C.green;
      ctx.font = font(400, 12);
      ctx.fillText(`  ${city}`, x, ny + 1);
      x += ctx.measureText(`  ${city}`).width;
    }
    if (i < shown.length - 1) x += 22;
  });
  if (legs.length > shown.length) {
    ctx.fillStyle = C.gold;
    ctx.font = font(700, 11.5);
    ctx.fillText(`+${legs.length - shown.length} more`, x + 16, ny + 1);
  }
  if (!legs.length) {
    ctx.fillStyle = C.greenDark;
    ctx.font = font(700, 13);
    ctx.fillText(next.text, x, ny + 1);
  }
}

// Status pill, top right: green on a photo, gold on the green band
function pill(ctx, text, top, onPhoto) {
  ctx.font = font(800, 10.5);
  ctx.letterSpacing = '1px';
  const pillW = ctx.measureText(text).width + 22;
  ctx.fillStyle = onPhoto ? C.green : C.gold;
  ctx.beginPath();
  ctx.roundRect(W - 18 - pillW, top, pillW, 22, 11);
  ctx.fill();
  ctx.fillStyle = onPhoto ? C.cream : C.greenDark;
  ctx.fillText(text, W - 18 - pillW + 11, top + 15);
  ctx.letterSpacing = '0px';
}

async function renderCard(card) {
  const [img, logo] = await Promise.all([card.imageUrl ? fetchImage(card.imageUrl) : null, loadLogo()]);
  const topH = img ? PHOTO_H : BAND_H;
  const next = card.next && (card.next.legs?.length || card.next.text) ? card.next : null;
  const H = topH + BODY_H + (next ? NEXT_H : 0) + STRIP_H;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // Card shape with rounded corners; everything below is clipped to it
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, RADIUS);
  ctx.clip();
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);

  // Top: photo, or a green band
  if (img) {
    drawCover(ctx, img, 0, 0, W, topH);
    const shade = ctx.createLinearGradient(0, 0, 0, topH);
    shade.addColorStop(0, 'rgba(0,0,0,0.35)');
    shade.addColorStop(0.35, 'rgba(0,0,0,0)');
    shade.addColorStop(0.6, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, topH);
    brand(ctx, logo, 16, 23, { size: 11, color: '#fff' });
    ctx.fillStyle = '#fff';
    ctx.font = font(700, 16);
    ctx.fillText([card.registration, card.aircraft].filter(Boolean).join('  ·  '), 18, topH - 16);
  } else {
    ctx.fillStyle = C.green;
    ctx.fillRect(0, 0, W, topH);
    brand(ctx, logo, 16, topH / 2, { size: 12, color: C.cream });
  }
  pill(ctx, card.status, img ? 12 : topH / 2 - 11, img);

  // Body
  const y0 = topH;
  const origin = card.originIcao || '????';
  const dest = card.destIcao || '????';

  ctx.fillStyle = C.greenDark;
  ctx.font = font(800, 30);
  ctx.fillText(origin, PAD, y0 + 46);
  const originW = ctx.measureText(origin).width;
  ctx.textAlign = 'right';
  ctx.fillText(dest, W - PAD, y0 + 46);
  const destW = ctx.measureText(dest).width;
  ctx.font = font(400, 12);
  ctx.fillStyle = C.green;
  ctx.fillText(cityName(card.destIcao), W - PAD, y0 + 64);
  ctx.textAlign = 'left';
  ctx.fillText(cityName(card.originIcao), PAD, y0 + 64);

  const lx0 = PAD + originW + 22;
  const lx1 = W - PAD - destW - 22;
  const ly = y0 + 35;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx0, ly);
  ctx.lineTo(lx1, ly);
  ctx.stroke();
  ctx.fillStyle = C.gold;
  for (const x of [lx0, lx1]) {
    ctx.beginPath();
    ctx.arc(x, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = C.greenDark;
  ctx.font = font(800, 13);
  ctx.fillText(card.flightNumber || '', (lx0 + lx1) / 2, ly - 9);
  ctx.fillStyle = C.green;
  ctx.font = font(400, 11.5);
  ctx.fillText(dayLabel(card.dayMs || Date.now()), (lx0 + lx1) / 2, ly + 20);
  ctx.textAlign = 'left';

  // Details in four columns
  rule(ctx, y0 + 80);
  const colW = (W - PAD * 2) / 4;
  card.cols.forEach(([k, v, extra], i) => {
    const x = PAD + colW * i;
    label(ctx, k, x, y0 + 102);
    value(ctx, v, x, y0 + 121, colW - 12);
    sub(ctx, extra, x, y0 + 137, colW - 12);
  });

  // The line underneath: legs, or plain text
  if (next) drawNext(ctx, next, y0 + BODY_H);

  // Gold strip along the bottom
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, H - STRIP_H, W, STRIP_H);

  return canvas.encode('png');
}

async function aircraftImage(typeId) {
  if (!typeId) return null;
  const pb = await getAdminClient();
  const id = escFilterValue(typeId);
  const live = await pb.collection('if_live_fleet_images')
    .getFirstListItem(`aircraft_type_id = "${id}"`, { requestKey: null }).catch(() => null);
  if (live?.image_url) return live.image_url;
  const fleet = await pb.collection('fleet')
    .getFirstListItem(`livery_id = "${id}" || aircraft_id = "${id}"`, { requestKey: null, fields: 'image_url' }).catch(() => null);
  return fleet?.image_url || null;
}

// "Benson B.", the same short form the bot uses everywhere else
const pilotName = pilot => [pilot?.first_name, pilot?.last_name ? `${pilot.last_name[0]}.` : null].filter(Boolean).join(' ');

const hoursText = h => { const mins = Math.round((Number(h) || 0) * 60); return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`; };

async function bookingPass({ pilot, aircraftRegistration, aircraftTypeId, legs }) {
  const leg = (legs || [])[0];
  if (!leg) return null;
  const offBlocksMs = leg.departureUtc ? Date.parse(leg.departureUtc) : null;
  const holdStartMs = leg.holdStartUtc ? Date.parse(leg.holdStartUtc) : null;
  const startFrom = offBlocksMs ?? (holdStartMs && holdStartMs > Date.now() ? holdStartMs : Date.now());
  const aircraft = shortType(lookupLivery(aircraftTypeId)?.aircraftName);
  return renderCard({
    status: 'BOOKED',
    flightNumber: leg.flightNumber,
    originIcao: leg.originIcao,
    destIcao: leg.destIcao,
    aircraft,
    registration: aircraftRegistration,
    dayMs: offBlocksMs ?? startFrom,
    cols: [
      ['Aircraft', aircraft || '—', aircraftRegistration],
      ['Pilot', pilotName(pilot) || '—', pilot?.callsign],
      ['Off blocks', offBlocksMs ? zulu(offBlocksMs) : 'Anytime', offBlocksMs ? null : 'timeless booking'],
      ['Start by', zulu(startFrom + START_WINDOW_MS), null],
    ],
    next: { label: 'Then', legs: legs.slice(1) },
    imageUrl: await aircraftImage(aircraftTypeId).catch(() => null),
  });
}

const LANDED_BODY_H = 148;
const RUNWAY_H = 84;    // added to the landed card when IF gave a touchdown point

function drawRunway(ctx, x, y, w, h, { dist, centerline }) {
  const MIN_M = -100, MAX_M = 500, MAX_CL = 25;
  const stripe = '#d8d0b0';
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = stripe;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x, y, w, 3);
  ctx.fillRect(x, y + h - 3, w, 3);
  // threshold stripes
  ctx.globalAlpha = 0.85;
  const n = 6, gap = 2.5, sh = (h - 10 - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) ctx.fillRect(x + 8, y + 5 + i * (sh + gap), 22, sh);
  // centreline
  ctx.globalAlpha = 0.4;
  for (let cx = x + 40; cx + 18 < x + w - 6; cx += 30) ctx.fillRect(cx, y + h / 2 - 1.5, 18, 3);
  // touchdown zone bars at the marker
  const mToX = m => x + ((Math.max(MIN_M, Math.min(MAX_M, m)) - MIN_M) / (MAX_M - MIN_M)) * w;
  const markerX = mToX(0);
  ctx.globalAlpha = 0.85;
  ctx.fillRect(markerX - 18, y + 3, 36, 8);
  ctx.fillRect(markerX - 18, y + h - 11, 36, 8);
  ctx.globalAlpha = 1;
  // 1000 ft marker
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(markerX, y);
  ctx.lineTo(markerX, y + h);
  ctx.stroke();
  ctx.setLineDash([]);
  // the touchdown point
  const cl = Number.isFinite(centerline) ? Math.max(-MAX_CL, Math.min(MAX_CL, centerline)) : 0;
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mToX(dist), y + h / 2 + (cl / MAX_CL) * (h / 2 - 9), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

async function landedCard({ pilot, leg, aircraftRegistration, aircraftTypeId, flightTimeHours, landingStats, fuelUsedKg, availableToBook, nextLeg }) {
  const landing = (landingStats || []).at(-1);
  const fpm = Number.isFinite(landing?.verticalSpeed) ? Math.round(Math.abs(landing.verticalSpeed) * 196.85) : null;
  const landedMs = landing?.timestamp ? Date.parse(landing.timestamp) : Date.now();
  const aircraft = shortType(lookupLivery(aircraftTypeId)?.aircraftName);
  const touchdown = Number.isFinite(landing?.distanceFrom1kftMarker)
    ? { dist: landing.distanceFrom1kftMarker, centerline: landing.centerlineDistance }
    : null;
  const next = availableToBook ? { label: 'Next', text: 'Free to book' }
    : nextLeg ? { label: 'Next', legs: [nextLeg] } : { label: 'Next', text: 'Already booked' };

  const logo = await loadLogo();
  const bodyH = LANDED_BODY_H + (touchdown ? RUNWAY_H : 0);
  const H = BAND_H + bodyH + NEXT_H + STRIP_H;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, RADIUS);
  ctx.clip();
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, W, BAND_H);
  brand(ctx, logo, 16, BAND_H / 2, { size: 12, color: C.cream });
  pill(ctx, 'LANDED', BAND_H / 2 - 11, false);

  // "Landed at YMML" and the city, with the aircraft and pilot on the right
  const y0 = BAND_H;
  const dest = leg.destIcao || '????';
  ctx.fillStyle = C.green;
  ctx.font = font(400, 26);
  ctx.fillText('Landed at ', PAD, y0 + 42);
  const lead = ctx.measureText('Landed at ').width;
  ctx.fillStyle = C.greenDark;
  ctx.font = font(800, 30);
  ctx.fillText(dest, PAD + lead, y0 + 42);
  ctx.fillStyle = C.green;
  ctx.font = font(400, 12.5);
  ctx.fillText(cityName(leg.destIcao), PAD, y0 + 62);

  ctx.textAlign = 'right';
  ctx.fillStyle = C.greenDark;
  ctx.font = font(700, 14);
  ctx.fillText([aircraftRegistration, aircraft].filter(Boolean).join('  ·  '), W - PAD, y0 + 36);
  ctx.fillStyle = C.green;
  ctx.font = font(400, 12);
  ctx.fillText([pilotName(pilot), pilot?.callsign].filter(Boolean).join('  ·  '), W - PAD, y0 + 55);
  ctx.textAlign = 'left';

  // How it went
  rule(ctx, y0 + 76);
  const colW = (W - PAD * 2) / 4;
  const cols = [
    ['Touchdown', fpm != null ? `${fpm} fpm` : '—', landing?.maxGForce ? `${landing.maxGForce.toFixed(2)} g` : null],
    ['Flight', leg.flightNumber || '—', leg.originIcao ? `from ${leg.originIcao}` : null],
    ['Flight time', flightTimeHours ? hoursText(flightTimeHours) : '—', fuelUsedKg ? `${Math.round(fuelUsedKg).toLocaleString('en-AU')} kg fuel` : null],
    ['Landed', zulu(landedMs), dayLabel(landedMs).replace(/\b(\w)(\w+)/g, (m, a, b) => a + b.toLowerCase())],
  ];
  cols.forEach(([k, v, extra], i) => {
    const x = PAD + colW * i;
    label(ctx, k, x, y0 + 98);
    value(ctx, v, x, y0 + 117, colW - 12);
    sub(ctx, extra, x, y0 + 133, colW - 12);
  });

  // Where it touched down
  if (touchdown) {
    const ry = y0 + LANDED_BODY_H;
    rule(ctx, ry - 6);
    label(ctx, 'Touchdown point', PAD, ry + 14);
    drawRunway(ctx, PAD, ry + 24, W - PAD * 2, 46, touchdown);
  }

  drawNext(ctx, next, y0 + bodyH);

  ctx.fillStyle = C.gold;
  ctx.fillRect(0, H - STRIP_H, W, STRIP_H);
  return canvas.encode('png');
}

module.exports = { renderCard, bookingPass, landedCard, fetchImage };
