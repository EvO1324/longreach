/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const path = require('path');
const brand = require('../config/brand');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { getAdminClient } = require('../config/pocketbase');
const { fetchImage } = require('./boardingPass');
const { lookupAirport } = require('../utils/airports');

const FONT = 'Jakarta';
const fontDir = path.join(path.dirname(require.resolve('@fontsource/plus-jakarta-sans/package.json')), 'files');
for (const weight of [400, 600, 700, 800]) {
  GlobalFonts.registerFromPath(path.join(fontDir, `plus-jakarta-sans-latin-${weight}-normal.woff2`), FONT);
}

const C = {
  page: '#f6f4f0', card: '#ffffff', border: '#e2dfd8', text: '#1c1c1a', muted: '#6b6b63',
  dots: '#cbc6b9', green: brand.colors.primary, goldDark: brand.colors.accentDark, goldPale: brand.colors.accentPale,
};

const W = 560;          // logical size; drawn at SCALE
const SCALE = 2;
const PAD = 8;          // page showing around the ticket
const STUB_W = 84;
const ROW_H = 46;
const TICKET_PAD = 10;
const RADIUS = 12;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

function fmtMins(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

function airlineCode(flightNumber) {
  const m = String(flightNumber || '').match(/^([A-Z]{2,3})|^([A-Z0-9]{2})(?=\d)/);
  return (m?.[1] || m?.[2]) || '';
}

// "9 - 15 November 2026", or "30 Nov - 6 Dec 2026" across a month end
function fmtRange(start) {
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const year = end.getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString('en-AU', { month: 'long' })} ${year}`;
  }
  const short = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return `${short(start)} - ${short(end)} ${year}`;
}

// "Sydney" for YSSY, falling back to the code
function city(icao) {
  const c = lookupAirport(icao)?.city;
  return c ? c.replace(/\s*\(.*\)\s*$/, '') : icao;
}

// Monday of the week holding `weekStart` ('YYYY-MM-DD'), like fmtWeekLabel
function mondayOf(weekStart) {
  const d = new Date(`${String(weekStart).slice(0, 10)}T00:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Trims text with an ellipsis until it fits
function clip(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// A small side-on plane pointing right, centred on (cx, cy)
function plane(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = C.card;
  ctx.fillRect(-11, -7, 22, 14); // a gap in the dotted line
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-7.5, 0); ctx.lineTo(7.5, 0);                      // fuselage
  ctx.moveTo(2, 0); ctx.lineTo(-2, -5.5);                       // wings
  ctx.moveTo(2, 0); ctx.lineTo(-2, 5.5);
  ctx.moveTo(-6, 0); ctx.lineTo(-8, -3);                        // tail
  ctx.moveTo(-6, 0); ctx.lineTo(-8, 3);
  ctx.stroke();
  ctx.restore();
}

function drawLogo(ctx, img, code, x, cy, size) {
  if (img) {
    const s = Math.min(size / img.width, size / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x + (size - w) / 2, cy - h / 2, w, h);
    return;
  }
  roundRect(ctx, x, cy - size / 2, size, size, 6);
  ctx.fillStyle = C.page;
  ctx.fill();
  ctx.fillStyle = C.muted;
  ctx.font = font(800, 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code || '—', x + size / 2, cy + 0.5);
  ctx.textAlign = 'left';
}

function drawTicket(ctx, day, logos) {
  const top = PAD;
  const h = TICKET_PAD * 2 + day.flights.length * ROW_H;
  const x = PAD, w = W - PAD * 2;

  roundRect(ctx, x + 0.5, top + 0.5, w - 1, h - 1, RADIUS);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Notches where the tear line meets the edges
  const nx = x + STUB_W;
  for (const [ny, a0, a1] of [[top, 0, Math.PI], [top + h, Math.PI, Math.PI * 2]]) {
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, Math.PI * 2);
    ctx.fillStyle = C.page;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(nx, ny, 7, a0, a1);
    ctx.strokeStyle = C.border;
    ctx.stroke();
  }

  // Tear line
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nx, top + 11);
  ctx.lineTo(nx, top + h - 11);
  ctx.stroke();
  ctx.restore();

  // Stub: MON / 9 / NOV
  const mid = top + h / 2;
  const sx = x + STUB_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.muted;
  ctx.font = font(700, 13);
  ctx.letterSpacing = '1.5px';
  ctx.fillText(day.name.slice(0, 3).toUpperCase(), sx, mid - 16);
  ctx.fillText(day.date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase(), sx, mid + 32);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = C.green;
  ctx.font = font(800, 32);
  ctx.fillText(String(day.date.getDate()), sx, mid + 15);
  ctx.textAlign = 'left';

  // Flights
  const x0 = nx + 16;
  const right = x + w - 16;
  const flightX = x0 + 38;
  const depRight = flightX + 146;  // right edge of the departure code
  const pathL = depRight + 8, pathR = pathL + 58;
  const arrX = pathR + 8;

  day.flights.forEach((f, i) => {
    const cy = top + TICKET_PAD + i * ROW_H + ROW_H / 2;

    drawLogo(ctx, logos[f.airline], f.airline, x0, cy, 28);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.font = font(700, 17);
    ctx.fillText(f.flightNumber, flightX, cy + 1);
    if (f.airlineName) {
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 12);
      ctx.fillText(clip(ctx, f.airlineName, depRight - 48 - flightX), flightX, cy + 15);
    }

    ctx.fillStyle = C.text;
    ctx.font = font(600, 17);
    ctx.textAlign = 'right';
    ctx.fillText(f.dep, depRight, cy + 6);
    ctx.textAlign = 'left';
    ctx.fillText(f.arr, arrX, cy + 6);

    ctx.save();
    ctx.setLineDash([0.1, 4.5]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.dots;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pathL, cy);
    ctx.lineTo(pathR, cy);
    ctx.stroke();
    ctx.restore();
    plane(ctx, (pathL + pathR) / 2, cy);

    // Right-aligned: block time, then the bonus pill
    let rx = right;
    if (f.multiplier) {
      const t = `×${f.multiplier}`;
      ctx.font = font(700, 14);
      const pw = ctx.measureText(t).width + 12;
      roundRect(ctx, rx - pw, cy - 11, pw, 22, 5);
      ctx.fillStyle = C.goldPale;
      ctx.fill();
      ctx.fillStyle = C.goldDark;
      ctx.fillText(t, rx - pw + 6, cy + 5);
      rx -= pw + 8;
    }
    const dur = fmtMins(f.minutes);
    if (dur) {
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 15);
      ctx.textAlign = 'right';
      ctx.fillText(dur, rx, cy + 5.5);
      ctx.textAlign = 'left';
    }
  });

  return h;
}

async function loadAirlines(codes) {
  let records = [];
  try {
    const pb = await getAdminClient();
    records = await pb.collection('airlines').getFullList({ requestKey: null });
  } catch (err) {
    console.warn('[rotwCard] airlines lookup failed:', err.message);
  }
  const byCode = Object.fromEntries(records.map(a => [String(a.code).toUpperCase(), a]));
  const names = {}, logos = {};
  await Promise.all([...codes].map(async code => {
    const a = byCode[code];
    if (!a) return;
    names[code] = a.name;
    if (a.logo_url) logos[code] = await fetchImage(a.logo_url);
  }));
  return { names, logos };
}

// The week's days that have routes, each with its date and flights
function buildDays(weekStart, schedule, routeMap, multMap) {
  const monday = mondayOf(weekStart);
  return DAYS.map((name, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i);
    const flights = (schedule[name] || [])
      .map(item => (typeof item === 'string' ? { routeId: item } : item))
      .filter(s => routeMap[s.routeId])
      .map(s => {
        const r = routeMap[s.routeId];
        return {
          flightNumber: r.flight_number,
          airline: airlineCode(r.flight_number),
          dep: r.departure_icao,
          arr: r.arrival_icao,
          minutes: Number(r.duration_minutes || r.duration) || 0, // stored as text on some routes
          multiplier: s.multiplierId ? multMap[s.multiplierId]?.value : null,
        };
      });
    return { name, date, flights };
  }).filter(d => d.flights.length);
}

async function rotwDayCards({ weekStart, schedule, routeMap, multMap = {} }) {
  const days = buildDays(weekStart, schedule, routeMap, multMap);
  const all = days.flatMap(d => d.flights);
  const airlines = await loadAirlines(new Set(all.map(f => f.airline)));
  for (const f of all) f.airlineName = airlines.names[f.airline] || '';

  for (const day of days) {
    const H = PAD * 2 + TICKET_PAD * 2 + day.flights.length * ROW_H;
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = C.page;
    ctx.fillRect(0, 0, W, H);
    drawTicket(ctx, day, airlines.logos);
    day.png = canvas.toBuffer('image/png');
  }

  return { title: fmtRange(mondayOf(weekStart)), flights: all.length, days };
}

function rotwMessageText({ title, flights, days }, roleId) {
  const all = days.flatMap(d => d.flights.map(f => ({ ...f, day: d.name })));
  const bonus = all.filter(f => f.multiplier);
  const route = f => `**${f.flightNumber}** ${city(f.dep)} → ${city(f.arr)}`;

  const lines = [
    '## Routes of the Week',
    `**${title}** · ${flights} flight${flights === 1 ? '' : 's'} across ${days.length} day${days.length === 1 ? '' : 's'}`,
  ];
  if (roleId) lines.push(`<@&${roleId}>`);
  lines.push('', bonus.length
    ? `This week's featured routes are up. Fly any of them in any aircraft, whatever your rank, and ${bonus.length} of them earn bonus hours.`
    : "This week's featured routes are up. Fly any of them in any aircraft, whatever your rank.");

  if (bonus.length) {
    const byValue = {};
    for (const f of bonus) byValue[f.multiplier] = (byValue[f.multiplier] || 0) + 1;
    const tiers = Object.entries(byValue).sort((a, b) => b[0] - a[0])
      .map(([v, n]) => `×${v} on ${n} flight${n === 1 ? '' : 's'}`);
    lines.push('', '**Bonus hours**', tiers.join(' · '));
  }

  const timed = all.filter(f => f.minutes);
  const highlights = [];
  if (timed.length > 1) {
    const longest = timed.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    const shortest = timed.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    highlights.push(`Longest: ${route(longest)}, ${fmtMins(longest.minutes)} on ${longest.day}`);
    highlights.push(`Shortest: ${route(shortest)}, ${fmtMins(shortest.minutes)} on ${shortest.day}`);
  }
  if (bonus.length) {
    const top = Math.max(...bonus.map(f => Number(f.multiplier)));
    const perDay = days.map(d => [d.name, d.flights.filter(f => Number(f.multiplier) === top).length]);
    const [bestDay, n] = perDay.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (n > 1) highlights.push(`Best day for points: ${bestDay}, with ${n} flights on ×${top}`);
  }
  if (highlights.length) lines.push('', '**Highlights**', ...highlights);

  const site = (brand.frontendUrl).replace(/\/$/, '');
  lines.push('', `-# Book and file your PIREP from the ROTW page: <${site}/rotw>`);
  return lines.join('\n');
}

module.exports = { rotwDayCards, rotwMessageText, fmtMins };
