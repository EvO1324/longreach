/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { escFilterValue } = require('../utils/pbFilter');

const GIFT_SETTING_KEY = 'gift_multipliers';

async function getGiftIds(pb) {
  const rec = await pb.collection('settings')
    .getFirstListItem(`key = "${GIFT_SETTING_KEY}"`, { requestKey: null })
    .catch(() => null);
  if (!rec?.value) return [];
  try {
    const ids = JSON.parse(rec.value);
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function findUse(pb, userId, multiplierId) {
  return pb.collection('promo_uses').getFirstListItem(
    `user = "${escFilterValue(userId)}" && multiplier = "${escFilterValue(multiplierId)}"`,
    { requestKey: null }
  ).catch(() => null);
}

async function claimMultiplier(pb, userId, multiplierId) {
  try {
    return await pb.collection('promo_uses').create({ user: userId, multiplier: multiplierId, used_at: new Date().toISOString() });
  } catch (err) {
    if (await findUse(pb, userId, multiplierId)) return null;
    throw err;
  }
}

async function attachClaimToFlight(pb, claimId, flightId) {
  try {
    await pb.collection('promo_uses').update(claimId, { flight: flightId });
  } catch (err) {
    console.warn('[gifts] failed to link claim to flight:', err.message);
  }
}

async function releaseClaim(pb, claimId) {
  await pb.collection('promo_uses').delete(claimId).catch(err => console.warn('[gifts] failed to release claim:', err.message));
}

/** Active gifts this pilot hasn't used yet: [{ id, name, code, value, description }] */
async function availableGifts(pb, userId) {
  const ids = await getGiftIds(pb);
  if (!ids.length) return [];
  const gifts = await pb.collection('multipliers').getFullList({
    filter: `active = true && (${ids.map(id => `id = "${escFilterValue(id)}"`).join(' || ')})`,
    requestKey: null,
  });
  const unused = await Promise.all(gifts.map(async g => ((await findUse(pb, userId, g.id)) ? null : g)));
  return unused
    .filter(g => g && parseFloat(g.value) > 1)
    .map(g => ({ id: g.id, name: g.name, code: g.code, value: parseFloat(g.value), description: g.description || '' }));
}

/** Is this multiplier id currently a gift? (used when a PIREP claims one) */
async function isGift(pb, multiplierId) {
  return (await getGiftIds(pb)).includes(String(multiplierId));
}

async function giftForFlight(pb, flight) {
  if (!flight?.multiplier_code) return null;
  const ids = await getGiftIds(pb);
  if (!ids.length) return null;
  return pb.collection('multipliers').getFirstListItem(
    `code = "${escFilterValue(flight.multiplier_code)}" && name = "${escFilterValue(flight.multiplier_name || '')}"`
      + ` && (${ids.map(id => `id = "${escFilterValue(id)}"`).join(' || ')})`,
    { requestKey: null }
  ).catch(() => null);
}

async function returnGift(pb, flight) {
  try {
    const claim = await pb.collection('promo_uses')
      .getFirstListItem(`flight = "${escFilterValue(flight.id)}"`, { requestKey: null })
      .catch(() => null);
    if (claim && await isGift(pb, claim.multiplier)) await pb.collection('promo_uses').delete(claim.id);
  } catch (err) {
    console.warn('[gifts] failed to return gift:', err.message);
  }
}

async function reclaimGift(pb, flight) {
  try {
    const gift = await giftForFlight(pb, flight);
    if (!gift || await findUse(pb, flight.user, gift.id)) return;
    await pb.collection('promo_uses').create({ user: flight.user, multiplier: gift.id, used_at: new Date().toISOString(), flight: flight.id });
  } catch (err) {
    console.warn('[gifts] failed to reclaim gift:', err.message);
  }
}

module.exports = {
  GIFT_SETTING_KEY, getGiftIds, availableGifts, isGift, findUse,
  claimMultiplier, attachClaimToFlight, releaseClaim, returnGift, reclaimGift,
};
