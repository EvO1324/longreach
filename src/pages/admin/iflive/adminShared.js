/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

export const t = v => (v ? new Date(String(v).replace(' ', 'T')).getTime() : NaN);
const pad = n => String(n).padStart(2, '0');

// "14:05Z" today, "4 Nov 14:05Z" another day
export function zulu(v) {
  const ms = t(v);
  if (Number.isNaN(ms)) return '-';
  const d = new Date(ms);
  const now = new Date();
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
  const sameDay = d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  return sameDay ? time : `${d.getUTCDate()} ${d.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })} ${time}`;
}

export function ago(v) {
  const ms = t(v);
  if (Number.isNaN(ms)) return 'never';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

// datetime-local works in local time; these inputs are UTC
export const toInput = v => { const ms = t(v); return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 16); };
export const fromInput = v => (v ? `${v}:00.000Z` : undefined);

export const routeOf = l => `${l.flightNumber ? `${l.flightNumber} ` : ''}${l.originIcao} to ${l.destIcao}`;

export function legState(l) {
  if (l.pirepId) return { label: 'Filed', tone: 'ok' };
  if (l.expired) return { label: l.noShow ? 'No-show' : l.cancelledByAdmin ? 'Cancelled' : l.abandoned || l.startedAt ? 'Abandoned' : 'Expired', tone: '' };
  if (l.landedPromptAt) return { label: 'Landed', tone: 'warn' };
  if (l.startedAt) return { label: 'Flying', tone: 'ok' };
  if (l.windowStartUtc) return { label: 'Due', tone: 'warn' };
  if (t(l.holdStartUtc) > Date.now()) return { label: 'Held', tone: '' };
  return { label: 'Waiting', tone: '' };
}

export function bookingState(b) {
  if (b.status === 'pending') return { label: 'Pending', tone: 'bad' };
  const open = b.legs.filter(l => !l.pirepId && !l.expired);
  if (!open.length) return { label: 'Done', tone: '' };
  return legState(open[0]);
}