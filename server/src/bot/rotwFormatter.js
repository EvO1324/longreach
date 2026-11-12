/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const brand = require('../config/brand');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const FRONTEND_URL = brand.frontendUrl;

/* * * Format duration_minutes into "Xh Ym" */
function fmtMins(mins) {
  if (!mins) return '—';
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

function buildRotwMessage(schedule, routeMap, multMap, weekLabel, rotwRole) {
  const tag = rotwRole ? `<@&${rotwRole}>` : '@everyone';

  const lines = [];

  lines.push(`${brand.emoji()} **Routes of the Week** · ${formatWeekLabel(weekLabel)}`);
  lines.push(tag);
  lines.push('');

  for (const day of DAYS) {
    const slots = (schedule[day] || [])
      .map(item => typeof item === 'string' ? { routeId: item, multiplierId: null } : item)
      .filter(s => routeMap[s.routeId]);

    if (!slots.length) continue;

    lines.push(`**${buildDayLabel(day, weekLabel)}**`);

    for (const { routeId, multiplierId } of slots) {
      const r = routeMap[routeId];
      const mins = r.duration_minutes || r.duration || null;
      const duration = fmtMins(mins);
      const aircraft = parseAircraft(r.aircraft);
      const mult = multiplierId ? multMap[multiplierId] : null;
      const multSuffix = mult ? ` · ×${mult.value}` : '';

      lines.push(`> \`${r.flight_number}\` · ${r.departure_icao} → ${r.arrival_icao} · ${aircraft} · ${duration}${multSuffix}`);
    }

    lines.push('');
  }

  lines.push(`<${FRONTEND_URL}/rotw>`);

  return { content: lines.join('\n') };
}

function parseAircraft(raw) {
  if (!raw) return '—';
  try {
    // If it's already an array
    if (Array.isArray(raw)) {
      return extractAircraftName(raw[0]);
    }
    // If it's a JSON string like '["Airbus A380 - Qantas"]'
    if (typeof raw === 'string' && raw.startsWith('[')) {
      const parsed = JSON.parse(raw);
      return extractAircraftName(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    // Plain string
    return extractAircraftName(raw);
  } catch {
    return String(raw);
  }
}

function extractAircraftName(name) {
  if (!name) return '—';
  // Match common type codes: A380, B738, B77W, A350, E190, etc.
  const match = String(name).match(/\b([AB]\d{3}[A-Z]?|E\d{3}|CRJ\d{3}|ATR\d{2}|Q\d{3}|TBM\d{3})\b/i);
  return match ? match[1].toUpperCase() : String(name).split(' - ')[0].trim();
}

function formatWeekLabel(weekLabel) {
  try {
    return weekLabel.replace(
      /(\d{2})\/(\d{2})\/(\d{4})/g,
      (_, dd, mm, yyyy) => {
        const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    ).replace('→', '—');
  } catch {
    return weekLabel;
  }
}

function buildDayLabel(day, weekLabel) {
  try {
    const match = weekLabel.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return day;

    const [, dd, mm, yyyy] = match;
    const startDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

    const DAY_INDEX = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
    const startDayOfWeek = (startDate.getDay() + 6) % 7; // Monday=0
    const targetOffset = (DAY_INDEX[day] - startDayOfWeek + 7) % 7;

    const targetDate = new Date(startDate);
    targetDate.setDate(startDate.getDate() + targetOffset);

    const dayName = targetDate.toLocaleDateString('en-AU', { weekday: 'long' });
    const monthName = targetDate.toLocaleDateString('en-AU', { month: 'long' });
    return `${dayName} - ${monthName} ${targetDate.getDate()}`;
  } catch {
    return day;
  }
}

async function fetchRotwData(pb) {
  const settingsRecords = await pb.collection('settings').getFullList({ requestKey: null });
  const settings = Object.fromEntries(settingsRecords.map(s => [s.key, s.value]));

  const weekLabel   = settings.week_label || 'This Week';
  const scheduleRaw = settings.weekly_schedule;

  if (!scheduleRaw) return null;

  const schedule = JSON.parse(scheduleRaw);

  // Collect unique route IDs and multiplier IDs
  const allRouteIds = [];
  const allMultIds  = [];
  for (const day of DAYS) {
    for (const item of (schedule[day] || [])) {
      const slot = typeof item === 'string' ? { routeId: item } : item;
      if (slot.routeId && !allRouteIds.includes(slot.routeId)) allRouteIds.push(slot.routeId);
      if (slot.multiplierId && !allMultIds.includes(slot.multiplierId)) allMultIds.push(slot.multiplierId);
    }
  }

  if (!allRouteIds.length) return null;

  const routeFilter = allRouteIds.map(id => `id = "${id}"`).join(' || ');
  const routes = await pb.collection('routes').getFullList({ filter: routeFilter, requestKey: null });
  const routeMap = Object.fromEntries(routes.map(r => [r.id, r]));

  let multMap = {};
  if (allMultIds.length) {
    const multFilter = allMultIds.map(id => `id = "${id}"`).join(' || ');
    const mults = await pb.collection('multipliers').getFullList({ filter: multFilter, requestKey: null });
    multMap = Object.fromEntries(mults.map(m => [m.id, m]));
  }

  return { schedule, routeMap, multMap, weekLabel };
}

module.exports = { buildRotwMessage, fetchRotwData, DAYS };
