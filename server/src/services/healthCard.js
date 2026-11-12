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

const FONT = 'Jakarta';
const fontDir = path.join(path.dirname(require.resolve('@fontsource/plus-jakarta-sans/package.json')), 'files');
for (const weight of [400, 600, 700, 800]) {
  GlobalFonts.registerFromPath(path.join(fontDir, `plus-jakarta-sans-latin-${weight}-normal.woff2`), FONT);
}
let logoPromise = null;
const loadLogo = () => (logoPromise ||= (async () => loadImage(fs.readFileSync(va.logoPath('icon'))))().catch(() => null));

const W = 1200, H = 675, SCALE = 2, M = 56, GAP = 20;
const INK_RGB = va.colors.primaryDark.match(/\w\w/g).map(h => parseInt(h, 16)).join(', ');
const C = {
  page: '#fbf6ea', panel: '#ffffff', line: `rgba(${INK_RGB}, 0.10)`, grid: `rgba(${INK_RGB}, 0.08)`,
  ink: va.colors.primaryDark, green: va.colors.primary, soft: `rgba(${INK_RGB}, 0.58)`, gold: va.colors.accent, goldSoft: `rgba(${va.colors.accentRgb}, 0.22)`,
  up: '#2e7d4f', upBg: 'rgba(46, 125, 79, 0.10)', down: '#b4442f', downBg: 'rgba(180, 68, 47, 0.10)',
};
const font = (weight, size) => `${weight} ${size}px ${FONT}`;
const num = n => Number(n || 0).toLocaleString('en-AU');
const hours = h => `${Math.round(Number(h) || 0).toLocaleString('en-AU')}h`;
// "6h 31m", for averages
const hm = h => { const m = Math.round((Number(h) || 0) * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

function day(iso, withYear) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
// "27 Oct to 2 Nov 2026", or "3 Nov 2026" for a single day
function periodText({ from, to }) {
  if (from === to) return day(to, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${day(from, !sameYear)} to ${day(to, true)}`;
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx, text, x, y) {
  ctx.fillStyle = C.soft;
  ctx.font = font(700, 11.5);
  ctx.letterSpacing = '1.2px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function changePill(ctx, cur, prev, x, y) {
  if (!prev) return;
  const pct = Math.round(((cur - prev) / prev) * 100) || 0;
  const up = pct >= 0;
  const text = `${up ? '+' : ''}${pct}%`;
  ctx.font = font(700, 13);
  const w = ctx.measureText(text).width + 30;
  ctx.fillStyle = up ? C.upBg : C.downBg;
  ctx.beginPath();
  ctx.roundRect(x, y - 15, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = up ? C.up : C.down;
  const tx = x + 10, ty = y - 4;
  ctx.beginPath();
  if (up) { ctx.moveTo(tx, ty + 3.5); ctx.lineTo(tx + 8, ty + 3.5); ctx.lineTo(tx + 4, ty - 3.5); }
  else { ctx.moveTo(tx, ty - 3.5); ctx.lineTo(tx + 8, ty - 3.5); ctx.lineTo(tx + 4, ty + 3.5); }
  ctx.closePath();
  ctx.fill();
  ctx.fillText(text, x + 22, y + 0.5);
  return w;
}

function brand(ctx, logo, x, cy) {
  const r = 22;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + r, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, x + r - r * 1.02, cy - r * 1.02, r * 2.04, r * 2.04);
    ctx.restore();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + r, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tx = x + r * 2 + 14;
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 15);
  ctx.letterSpacing = '1.8px';
  ctx.fillText(va.name.toUpperCase(), tx, cy - 3);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 13.5);
  ctx.fillText('Network report', tx, cy + 16);
}

function barChart(ctx, data, x, y, w, h) {
  const max = Math.max(1, ...data.map(d => d.count));
  const step = max <= 4 ? 1 : Math.ceil(max / 4 / 5) * 5 || 1;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const axisW = 34, plotX = x + axisW, plotW = w - axisW, plotH = h - 26;
  ctx.font = font(600, 11);
  ctx.textAlign = 'right';
  for (let v = 0; v <= top; v += step) {
    const gy = y + plotH - (v / top) * plotH;
    ctx.fillStyle = C.grid;
    ctx.fillRect(plotX, Math.round(gy), plotW, 1);
    ctx.fillStyle = C.soft;
    ctx.fillText(String(v), plotX - 10, gy + 4);
  }
  ctx.textAlign = 'left';
  const n = data.length || 1;
  const slot = plotW / n;
  const bw = Math.max(3, Math.min(34, slot * 0.62));
  const peak = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0);
  data.forEach((d, i) => {
    const bh = (d.count / top) * plotH;
    if (bh <= 0) return;
    ctx.fillStyle = i === peak ? C.gold : C.green;
    ctx.beginPath();
    ctx.roundRect(plotX + i * slot + (slot - bw) / 2, y + plotH - bh, bw, bh, [Math.min(5, bw / 2), Math.min(5, bw / 2), 0, 0]);
    ctx.fill();
  });
  ctx.fillStyle = C.soft;
  ctx.font = font(600, 11.5);
  const marks = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  [...new Set(marks)].forEach((i, k, all) => {
    const cx = plotX + i * slot + slot / 2;
    ctx.textAlign = k === 0 && all.length > 1 ? 'left' : k === all.length - 1 && all.length > 1 ? 'right' : 'center';
    const ax = ctx.textAlign === 'left' ? plotX + i * slot + (slot - bw) / 2 : ctx.textAlign === 'right' ? plotX + i * slot + (slot + bw) / 2 : cx;
    ctx.fillText(data[i].label, ax, y + h - 4);
  });
  ctx.textAlign = 'left';
}

// "Airbus A321 NEO" -> "A321neo", "Bombardier Dash 8-Q400" -> "Dash 8-Q400"
function shortType(name) {
  return String(name || '')
    .replace(/^(Airbus|Boeing|Embraer|Bombardier|De Havilland( Canada)?|ATR|Cessna)\s+/i, '')
    .replace(/\s+NEO\b/i, 'neo')
    .trim();
}

function rankedList(ctx, rows, x, y, w, rowH, drawTitle) {
  const max = rows[0]?.count || 1;
  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    drawTitle(row, x, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.soft;
    ctx.font = font(600, 13);
    ctx.fillText(num(row.count), x + w, ry);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.grid;
    ctx.beginPath(); ctx.roundRect(x, ry + 9, w, 4, 2); ctx.fill();
    ctx.fillStyle = i === 0 ? C.gold : C.green;
    ctx.beginPath(); ctx.roundRect(x, ry + 9, Math.max(4, w * (row.count / max)), 4, 2); ctx.fill();
  });
}

function arrow(ctx, x, y, len = 16) {
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + len - 4.5, y - 4);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x + len - 4.5, y + 4);
  ctx.stroke();
}

/** Renders the card from a VA Health result (routes/va.js). Resolves to a PNG. */
async function renderHealthCard(h) {
  const logo = await loadLogo();
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, W, H);
  // a thin green band across the very top
  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, W, 6);

  // Header
  brand(ctx, logo, M, 78);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 22);
  ctx.fillText(periodText(h.range), W - M, 76);
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 13.5);
  ctx.fillText(`Compared with the previous ${h.range.days} ${h.range.days === 1 ? 'day' : 'days'}`, W - M, 96);
  ctx.textAlign = 'left';

  // Headline figures: the same six as the top of the VA Health page
  const kpiY = 120, kpiH = 150, kGap = 14, pad = 18;
  const kpiW = (W - M * 2 - kGap * 5) / 6;
  const compare = (cur, prev, fmt) => ({ cur, prev, fmt });
  const kpis = [
    { k: 'Flights', v: num(h.pireps.inRange), change: compare(h.pireps.inRange, h.pireps.prevPeriod, num) },
    { k: 'Hours flown', v: hours(h.pireps.totalHours), change: compare(h.pireps.totalHours, h.pireps.prevHours, hours) },
    { k: 'Pilots flying', v: num(h.pireps.uniquePilots), change: compare(h.pireps.uniquePilots, h.pireps.prevUniquePilots, num) },
    { k: 'New members', v: num(h.signups.inRange), change: compare(h.signups.inRange, h.signups.prevPeriod, num) },
    { k: 'Active pilots', v: `${h.pilots.activePct}%`, lines: [`${num(h.pilots.activeCount)} of ${num(h.pilots.total)}`, 'flew in 30 days'] },
    { k: 'To review', v: num(h.pireps.pending), lines: h.pireps.pending ? [`PIREP${h.pireps.pending === 1 ? '' : 's'} pending`] : ['Queue is clear'] },
  ];
  kpis.forEach(({ k, v, change, lines }, i) => {
    const x = M + i * (kpiW + kGap);
    panel(ctx, x, kpiY, kpiW, kpiH);
    ctx.fillStyle = i === 0 ? C.gold : C.green;
    ctx.fillRect(x + pad, kpiY + 20, 20, 3);
    label(ctx, k, x + pad, kpiY + 44);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 34);
    ctx.fillText(v, x + pad, kpiY + 84);
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 12.5);
    if (change) {
      // the change as a pill, and what it's compared with underneath
      if (changePill(ctx, change.cur, change.prev, x + pad, kpiY + 112)) {
        ctx.fillStyle = C.soft;
        ctx.font = font(400, 12.5);
        ctx.fillText(`from ${change.fmt(change.prev)}`, x + pad, kpiY + 134);
      } else {
        ctx.fillText('New this period', x + pad, kpiY + 112);
      }
    } else {
      lines.forEach((line, j) => ctx.fillText(line, x + pad, kpiY + 112 + j * 20));
    }
  });

  // Flights per day, routes, aircraft
  const lowY = kpiY + kpiH + 18, lowH = 290;
  const sideW = 286;
  const chartW = W - M * 2 - (sideW + GAP) * 2;
  panel(ctx, M, lowY, chartW, lowH);
  label(ctx, h.range.days > 60 ? 'Flights per week' : 'Flights per day', M + 24, lowY + 34);
  const busiest = Math.max(0, ...(h.dailyTrend || []).map(d => d.count));
  ctx.textAlign = 'right';
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 12.5);
  ctx.fillText(`Busiest ${h.range.days > 60 ? 'week' : 'day'}: ${num(busiest)}`, M + chartW - 24, lowY + 34);
  ctx.textAlign = 'left';
  barChart(ctx, h.dailyTrend || [], M + 24, lowY + 58, chartW - 48, lowH - 80);

  // Routes, with the top pilot underneath
  const sideX = M + chartW + GAP;
  panel(ctx, sideX, lowY, sideW, lowH);
  label(ctx, 'Most flown routes', sideX + 24, lowY + 34);
  const routes = (h.topRoutes || []).slice(0, 4);
  rankedList(ctx, routes, sideX + 24, lowY + 68, sideW - 48, 34, (r, x, ry) => {
    ctx.fillStyle = C.ink;
    ctx.font = font(700, 15);
    ctx.fillText(r.departure_icao, x, ry);
    const dw = ctx.measureText(r.departure_icao).width;
    arrow(ctx, x + dw + 9, ry - 5, 14);
    ctx.fillText(r.arrival_icao, x + dw + 31, ry);
  });
  if (!routes.length) {
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 14);
    ctx.fillText('No flights in this period', sideX + 24, lowY + 70);
  }

  // Aircraft used: every PIREP in the period, by type, with its share
  const acX = sideX + sideW + GAP;
  panel(ctx, acX, lowY, sideW, lowH);
  label(ctx, 'Aircraft used', acX + 24, lowY + 34);
  const aircraft = (h.topAircraft || []).slice(0, 6);
  const flights = h.pireps.inRange || 0;
  rankedList(ctx, aircraft, acX + 24, lowY + 68, sideW - 48, 36, (a, x, ry) => {
    ctx.fillStyle = C.ink;
    ctx.font = font(700, 15);
    const name = shortType(a.name);
    ctx.fillText(name, x, ry);
    if (flights) {
      const nw = ctx.measureText(name).width;
      ctx.fillStyle = C.soft;
      ctx.font = font(400, 12.5);
      ctx.fillText(`${Math.round((a.count / flights) * 100)}%`, x + nw + 8, ry);
    }
  });
  if (!aircraft.length) {
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 14);
    ctx.fillText('No flights in this period', acX + 24, lowY + 70);
  }

  const pilot = (h.topPilots || [])[0];
  const py = lowY + lowH - 86;
  ctx.fillStyle = C.line;
  ctx.fillRect(sideX + 24, py - 8, sideW - 48, 1);
  label(ctx, 'Top pilot', sideX + 24, py + 18);
  if (pilot) {
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 18);
    ctx.fillText(pilot.callsign || pilot.name || 'Unknown', sideX + 24, py + 46);
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 13);
    ctx.fillText(`${num(pilot.flights)} ${pilot.flights === 1 ? 'flight' : 'flights'} and ${hours(pilot.hours)} flown`, sideX + 24, py + 66);
  }

  // Footer
  const fy = H - 34;
  ctx.fillStyle = C.gold;
  ctx.fillRect(M, fy - 22, 40, 2);
  ctx.fillStyle = C.green;
  ctx.font = font(700, 13);
  ctx.letterSpacing = '1px';
  ctx.fillText((va.urls?.website || va.frontendUrl).replace(/^https?:\/\//, '').replace(/\/$/, '').toUpperCase(), M, fy);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 13);
  ctx.fillText(`Average ${hm(h.pireps.avgFlightTime)} per flight and ${h.pireps.pirepsPerPilot} flights per pilot`, W - M, fy);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}

module.exports = { renderHealthCard };
