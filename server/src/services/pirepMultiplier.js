/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { escFilterValue } = require('../utils/pbFilter');
const { rankForHours } = require('./rankAccess');
const { isGift, findUse } = require('./giftMultipliers');

class MultiplierError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STALE_MESSAGE = 'This multiplier is no longer valid for this flight. Please reload the page and file again.';

function validValue(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 1 ? n : null;
}

const sameIcao = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

async function resolvePromo(pb, userId, promoId) {
  const m = await pb.collection('multipliers').getOne(String(promoId), { requestKey: null }).catch(() => null);
  const value = m && m.active && m.promo_code ? validValue(m.value) : null;
  if (!value) throw new MultiplierError('Invalid or inactive promo code');

  const used = await pb.collection('promo_uses').getFirstListItem(
    `user = "${escFilterValue(userId)}" && multiplier = "${escFilterValue(m.id)}"`,
    { requestKey: null }
  ).catch(() => null);
  if (used) throw new MultiplierError('You have already used this promo code', 409);

  return { value, code: m.promo_code, name: m.name, promoId: m.id };
}

async function resolveGift(pb, userId, giftId) {
  const m = await pb.collection('multipliers').getOne(String(giftId), { requestKey: null }).catch(() => null);
  const value = m && m.active && await isGift(pb, m.id) ? validValue(m.value) : null;
  if (!value) throw new MultiplierError('This gift is no longer available. Please reload the page and file again.');
  if (await findUse(pb, userId, m.id)) throw new MultiplierError("You've already used this gift", 409);
  return { value, code: m.code, name: m.name, promoId: m.id };
}

async function resolveRank(pb, user) {
  const rank   = await rankForHours(pb, user.total_hours || 0);
  const value  = validValue(rank?.pirep_multiplier);
  if (!value) throw new MultiplierError(STALE_MESSAGE);
  return { value, code: 'RANK', name: `${rank.name} benefit` };
}

async function resolveChallengeLeg(pb, legId, claim) {
  const leg   = await pb.collection('challenge_legs').getOne(String(legId), { requestKey: null }).catch(() => null);
  const value = validValue(leg?.multiplier);
  if (!value) throw new MultiplierError(STALE_MESSAGE);
  return { value, code: claim.multiplier_code, name: claim.multiplier_name || claim.multiplier_code };
}

async function resolveRotw(pb, claim) {
  const candidates = (await pb.collection('multipliers').getFullList({
    filter: `code = "${escFilterValue(claim.multiplier_code)}" && active = true`,
    requestKey: null,
  })).filter(m => validValue(m.value));
  if (!candidates.length) throw new MultiplierError(STALE_MESSAGE);

  const idFilter = candidates.map(m => `multiplier = "${escFilterValue(m.id)}" || return_multiplier = "${escFilterValue(m.id)}"`).join(' || ');
  const slots = await pb.collection('rotw_slots').getFullList({
    filter: idFilter,
    expand: 'route,return_route',
    requestKey: null,
  });
  const matchesRoute = r => !!r
    && sameIcao(r.departure_icao, claim.departure_icao)
    && sameIcao(r.arrival_icao, claim.arrival_icao);
  const m = candidates.find(c => slots.some(s =>
    (s.multiplier === c.id && matchesRoute(s.expand?.route)) ||
    (s.return_multiplier === c.id && matchesRoute(s.expand?.return_route))
  ));
  if (!m) throw new MultiplierError(STALE_MESSAGE);

  return { value: validValue(m.value), code: m.code, name: m.name, rotw: true };
}

async function resolveEvent(pb, userId, eventId, claim) {
  const { filingWindow } = require('./events');
  const ev = await pb.collection('events').getOne(String(eventId), { requestKey: null }).catch(() => null);
  if (!ev || ev.status !== 'published') throw new MultiplierError('This event is no longer open.');
  const window = filingWindow(ev);
  if (!window.open) throw new MultiplierError(window.reason);
  const reg = await pb.collection('event_registrations').getFirstListItem(
    `event = "${escFilterValue(ev.id)}" && user = "${escFilterValue(userId)}"`, { requestKey: null },
  ).catch(() => null);
  if (!reg) throw new MultiplierError('Sign up for this event before logging it.', 403);
  if (!sameIcao(ev.departure_icao, claim.departure_icao) || !sameIcao(ev.arrival_icao, claim.arrival_icao)) {
    throw new MultiplierError(`This event is ${ev.departure_icao} → ${ev.arrival_icao}.`);
  }
  const already = await pb.collection('flights').getFirstListItem(
    `event = "${escFilterValue(ev.id)}" && user = "${escFilterValue(userId)}" && status != "rejected"`, { requestKey: null },
  ).catch(() => null);
  if (already) throw new MultiplierError("You've already logged this event.", 409);
  return {
    value: validValue(ev.multiplier) || 1, code: 'EVENT', name: ev.title,
    eventId: ev.id, aircraft: ev.aircraft, flightNumber: ev.flight_number || null,
  };
}

async function resolveMultiplier(pb, user, claim) {
  const { multiplier_promo_id, multiplier_gift_id, multiplier_code, multiplier_value, challenge_leg_id, event_id } = claim;

  // An event flight gets the event's multiplier and nothing else
  if (event_id) return resolveEvent(pb, user.id, event_id, claim);

  if (multiplier_promo_id) return resolvePromo(pb, user.id, multiplier_promo_id);
  if (multiplier_gift_id) return resolveGift(pb, user.id, multiplier_gift_id);

  if (!multiplier_code && !validValue(multiplier_value)) return null;
  if (typeof multiplier_code !== 'string' || !multiplier_code) throw new MultiplierError(STALE_MESSAGE);

  if (multiplier_code === 'RANK') return resolveRank(pb, user);
  if (challenge_leg_id && /^LEG\d+$/.test(multiplier_code)) return resolveChallengeLeg(pb, challenge_leg_id, claim);
  return resolveRotw(pb, claim);
}

module.exports = { resolveMultiplier, MultiplierError };
