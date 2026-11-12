/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const { getServiceUserIdForOrg, ifLiveWrite, invalidateAircraftSchedulesCache, schedulePayloadForLeg, deadlineForLeg } = require('../routes/ifLive');

async function approveBid(bidId) {
  const pb = await getAdminClient();
  let bid;
  try {
    bid = await pb.collection('if_live_bids').getOne(bidId, { requestKey: null, expand: 'pilot' });
  } catch {
    return { ok: false, notFound: true, error: `No bid found with ID \`${bidId}\`.` };
  }

  if (bid.status !== 'pending') {
    return { ok: false, error: `This bid is already **${bid.status}**.` };
  }

  const serviceUserId = await getServiceUserIdForOrg(bid.organization_id);
  if (!serviceUserId) {
    return { ok: false, error: "No connected Infinite Flight Live account is set as this organization's default yet — connect and choose a default org in the admin panel first." };
  }

  const legs = bid.legs || [];
  const createdScheduleIds = [];
  try {
    const createdAt = Date.now();
    for (const [legIndex, leg] of legs.entries()) {
      const schedule = await ifLiveWrite(serviceUserId, 'POST', `/live/aircraft/${encodeURIComponent(bid.aircraft_id)}/schedules`, schedulePayloadForLeg(leg));
      createdScheduleIds.push(schedule.id);
      leg.ifScheduleId = schedule.id;
      leg.deadlineUtc = deadlineForLeg(leg, legIndex, createdAt, legs[legIndex - 1]?.deadlineUtc);
    }
  } catch (writeErr) {
    await Promise.allSettled(createdScheduleIds.map(id =>
      ifLiveWrite(serviceUserId, 'DELETE', `/live/schedules/${encodeURIComponent(id)}`)));
    return { ok: false, error: writeErr.message || 'Failed to create IF Live schedules.' };
  }

  invalidateAircraftSchedulesCache(bid.aircraft_id);
  await pb.collection('if_live_bids').update(bid.id, { legs, status: 'active' });

  return { ok: true, bid: { ...bid, legs, status: 'active' } };
}

async function denyBid(bidId, reason) {
  const pb = await getAdminClient();
  let bid;
  try {
    bid = await pb.collection('if_live_bids').getOne(bidId, { requestKey: null, expand: 'pilot' });
  } catch {
    return { ok: false, notFound: true, error: `No bid found with ID \`${bidId}\`.` };
  }

  if (bid.status !== 'pending') {
    return { ok: false, error: `This bid is already **${bid.status}**.` };
  }

  const trimmedReason = (reason || '').slice(0, 500);
  await pb.collection('if_live_bids').update(bid.id, { status: 'denied', review_note: trimmedReason });

  return { ok: true, bid: { ...bid, status: 'denied', review_note: trimmedReason } };
}

function notifyPilot(client, bid, message) {
  const pilot = bid.expand?.pilot;
  if (!pilot?.discord_id) return;
  client.users.fetch(pilot.discord_id)
    .then(u => u.send(message))
    .catch(() => {});
}

function pilotName(bid) {
  const pilot = bid.expand?.pilot;
  return pilot ? `${pilot.first_name} ${(pilot.last_name || '').charAt(0).toUpperCase()}.` : 'the pilot';
}

module.exports = { approveBid, denyBid, notifyPilot, pilotName };
