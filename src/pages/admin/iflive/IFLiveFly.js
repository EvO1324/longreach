/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Plane, Search, X } from 'lucide-react';
import { ifLiveBids, ifLiveStats, routes as routesApi } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import Dropdown from '../../../components/Dropdown';
import { useIFLive } from './IFLiveContext';
import {
  HOUR, LIVE_CSS, MAX_BOOKINGS, MAX_SECTORS, availability, canFly, cityOf, fmtHours, fmtMins, pad, pbDate, placeText, routeMinutes,
  untilText, useAirportNames, useFleetBoard, useLiveFleet, zDay, zDayKey, zTime, zWhen,
} from './liveData';

const HALF = 30 * 60 * 1000;
const SHOW_STEP = 40;
const LENGTHS = [
  { key: 'any', label: 'Any length' },
  { key: 'short', label: 'Under 2h', test: m => m < 120 },
  { key: 'medium', label: '2 to 6h', test: m => m >= 120 && m < 360 },
  { key: 'long', label: '6h+', test: m => m >= 360 },
];
const LANDED_POLL_MS = 60 * 1000;

const FLY_CSS = `
.fly { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; align-items: start; }
@container (min-width: 1000px) { .fly { grid-template-columns: minmax(0, 1fr) 300px; } }
.fly > * { min-width: 0; }

.trip { padding: 0; overflow: hidden; }
.trip-head { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; flex-wrap: wrap; }
.trip-head .lv-thumb { width: 96px; height: 60px; }
.trip-legs { border-top: 1px solid var(--border-color); }
.trip-leg { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto; gap: 0.25rem 1rem; align-items: center; padding: 0.9rem 1.5rem; border-bottom: 1px solid var(--border-color); }
.trip-leg.is-done { opacity: 0.7; }
.trip-flt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
.trip-route { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 1.1rem; white-space: nowrap; }
.trip-right { text-align: right; font-size: 0.875rem; white-space: nowrap; }
.trip-hold { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem 1.5rem; flex-wrap: wrap; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
.trip-hold strong { font-size: 1.05rem; }
.trip-how { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); line-height: 1.55; }
.trip-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; padding: 1rem 1.5rem; }
.trip-actions .lv-spacer { flex: 1; }
.trip-crew { padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); }
@media (max-width: 640px) {
  .trip-head, .trip-leg, .trip-hold, .trip-how, .trip-actions, .trip-crew { padding-left: 1rem; padding-right: 1rem; }
  .trip-head .lv-thumb { width: 64px; height: 42px; }
  .trip-leg { grid-template-columns: minmax(0, 1fr) auto; }
  .trip-leg .trip-flt { grid-column: 1 / -1; }
}

.bk-crumbs { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0 0 1rem; padding: 0; list-style: none; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); }
.bk-crumbs li.is-on { color: var(--text-primary); }
.bk-crumbs li.is-on span { background: var(--avg-green); color: #fff; }
.bk-crumbs span { display: inline-flex; width: 1.4rem; height: 1.4rem; border-radius: 50%; align-items: center; justify-content: center; margin-right: 0.45rem; background: var(--bg-hover); font-size: 0.75rem; }
.bk-when { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
.bk-when .bk-dd { width: 150px; }
.bk-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 0.8rem; }
.bk-tile { display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: 12px; cursor: pointer; font: inherit; color: inherit; text-align: left; transition: border-color .12s, box-shadow .12s; }
.bk-tile:hover { border-color: var(--avg-green); box-shadow: 0 4px 14px rgba(0,0,0,.07); }
.bk-tile:focus-visible { outline: 2px solid var(--avg-green); outline-offset: 2px; }
.bk-tile-img { height: 92px; background: var(--bg-hover) center / cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
.bk-tile-body { padding: 0.75rem 0.95rem 0.9rem; display: flex; flex-direction: column; gap: 0.15rem; }
.bk-tile-reg { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; font-size: 1.15rem; }
.bk-tile-type { font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bk-tile-at { font-size: 0.875rem; font-weight: 600; margin-top: 0.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bk-tile-foot { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--border-color); font-size: 0.82rem; font-weight: 600; }
.bk-section { margin-top: 1.5rem; }
.bk-section-h { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.6rem; font-weight: 700; }
.bk-section-h span { font-weight: 500; font-size: 0.85rem; color: var(--text-secondary); }
.bk-busy { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
.bk-busy-row { display: grid; grid-template-columns: 7rem minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: 0.65rem 1rem; border-top: 1px solid var(--border-color); font-size: 0.875rem; }
.bk-busy-row:first-child { border-top: none; }
.bk-picked { display: flex; align-items: center; gap: 1rem; padding: 0.8rem; border: 1.5px solid var(--avg-green); border-radius: 12px; margin-bottom: 1.25rem; flex-wrap: wrap; }
.bk-picked .lv-thumb { width: 88px; height: 56px; }
.bk-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.bk-chip { padding: 0.35rem 0.8rem; border: 1.5px solid var(--border-color); border-radius: 999px; background: var(--bg-card); font: inherit; font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.bk-chip.is-on { border-color: var(--avg-green); color: var(--text-primary); }
.bk-list { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; margin-top: 1rem; }
.bk-row { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) 5.5rem auto; align-items: center; gap: 1rem; width: 100%; padding: 0.8rem 1rem; border: none; border-top: 1px solid var(--border-color); background: var(--bg-card); font: inherit; color: inherit; text-align: left; cursor: pointer; }
.bk-row:first-child { border-top: none; }
.bk-row:hover { background: var(--bg-hover); }
.bk-row:hover .bk-go { border-color: var(--avg-green); }
.bk-flt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
.bk-city { display: block; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bk-codes { display: block; font-size: 0.8rem; color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.bk-time { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bk-go { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.8rem; border: 1.5px solid var(--border-color); border-radius: 8px; font-weight: 700; font-size: 0.85rem; white-space: nowrap; }
.bk-more { display: block; width: 100%; margin-top: 0.75rem; padding: 0.65rem; border: 1.5px dashed var(--border-color); border-radius: 10px; background: none; font: inherit; font-weight: 600; color: var(--text-primary); cursor: pointer; }
.bk-leg { display: flex; align-items: center; gap: 1rem; padding: 0.9rem 1rem; border: 1.5px solid var(--border-color); border-radius: 12px; }
.bk-leg + .bk-leg { margin-top: 0.6rem; }
.bk-leg-big { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.3rem; font-weight: 800; white-space: nowrap; }
.bk-toggle { display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem 1rem; border: 1.5px dashed var(--border-color); border-radius: 12px; cursor: pointer; }
.bk-toggle.is-on { border-style: solid; border-color: var(--avg-green); }
.bk-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.bk-foot { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1.25rem; flex-wrap: wrap; }
@media (max-width: 700px) {
  .bk-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.2rem 0.75rem; }
  .bk-row .bk-time { grid-column: 2; grid-row: 1; text-align: right; }
  .bk-row .bk-go { grid-column: 2; grid-row: 2 / span 2; }
  .bk-busy-row { grid-template-columns: minmax(0, 1fr) auto; }
  .bk-busy-row > :nth-child(2) { display: none; }
  .bk-grid2 { grid-template-columns: 1fr; }
}

.side-stat { display: flex; gap: 2.5rem; }
.side-big { font-size: 1.9rem; font-weight: 700; line-height: 1.1; color: var(--text-primary); }
.side-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 0; border-top: 1px solid var(--border-color); font-size: 0.9rem; }
.side-row:first-of-type { border-top: none; }
`;

function Thumb({ ac, fleetImages, size = 18, className = 'lv-thumb', style }) {
  const img = fleetImages?.[ac?.aircraftId];
  return <span className={className} style={{ ...(img ? { backgroundImage: `url(${img})` } : {}), ...style }}>{!img && <Plane size={size} />}</span>;
}

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); showToast(`${label} copied`, 'success'); } catch { showToast("Couldn't copy", 'error'); }
}

// Page

export default function IFLiveFly({ focusAircraftId = null, onNavigate = () => {} }) {
  const { orgId, typeNames, fleetImages, fleetNameById } = useIFLive();
  const fleet = useLiveFleet(orgId);
  const board = useFleetBoard(fleet.aircraft, fleet.bids, fleet.schedules);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [landed, setLanded] = useState([]);
  const typeOf = ac => (ac && typeNames?.[ac.aircraftId]) || '';

  useEffect(() => {
    routesApi.list({ fields: 'id,flight_number,departure_icao,arrival_icao,aircraft,distance_nm,duration' })
      .then(d => setRoutes(d.routes || [])).catch(() => setRoutes([]));
    ifLiveStats.leaderboard().then(d => setLeaderboard(d.leaderboard || [])).catch(() => setLeaderboard([]));
  }, []);
  useEffect(() => { ifLiveStats.mine().then(setStats).catch(() => {}); }, [fleet.updatedAt]);

  const myBids = useMemo(() => (fleet.bids || []).filter(b => b.isMine && (b.status === 'pending'
    || (b.status === 'active' && (b.legs || []).some(l => !l.pirepId && !l.expired)))), [fleet.bids]);

  // Most recent leg of mine logged in the last 6 hours, for a line above the booking flow.
  const lastLogged = useMemo(() => {
    const cutoff = Date.now() - 6 * HOUR;
    return (fleet.bids || []).filter(b => b.isMine).flatMap(b => (b.legs || []).map(l => ({ b, l })))
      .filter(x => x.l.pirepId && x.l.loggedAt && pbDate(x.l.loggedAt).getTime() > cutoff)
      .sort((x, y) => pbDate(y.l.loggedAt) - pbDate(x.l.loggedAt))[0] || null;
  }, [fleet.bids]);

  // Landed-but-not-filed legs, so the trip card can say "Landed".
  const hasOpen = myBids.some(b => b.status === 'active');
  useEffect(() => {
    if (!hasOpen) { setLanded([]); return undefined; }
    const check = () => ifLiveBids.landedLegs().then(d => setLanded(d.landed || [])).catch(() => {});
    check();
    const t = setInterval(check, LANDED_POLL_MS);
    return () => clearInterval(t);
  }, [hasOpen, fleet.updatedAt]);

  const booted = fleet.aircraft !== null;

  // Adding sectors to your booking (from its trip card).
  const [extending, setExtending] = useState(null); // { bid, seed }
  const openExtend = bid => setExtending(e => ({ bid, seed: (e?.seed || 0) + 1 }));

  // Yours in the order you'll fly them.
  const startOf = bid => Math.min(...(board.get(bid.aircraftId)?.queue || []).filter(q => q.bid.id === bid.id).map(q => q.start), pbDate(bid.created).getTime());
  const ordered = [...myBids].sort((a, b) => startOf(a) - startOf(b));
  const canExtend = bid => {
    const q = board.get(bid.aircraftId)?.queue || [];
    return bid.status === 'active' && q.length > 0 && q[q.length - 1].bid.id === bid.id && (bid.legs || []).length < MAX_SECTORS;
  };
  const focusIsMine = focusAircraftId && myBids.some(b => b.aircraftId === focusAircraftId);
  const atLimit = myBids.length >= MAX_BOOKINGS;
  const [another, setAnother] = useState(null); // null: not touched, 'open', 'closed'
  const showAnother = another === 'open' || (another === null && !!focusAircraftId && !focusIsMine);
  const myAircraftIds = myBids.map(b => b.aircraftId);

  return (
    <div className="lv">
      <style>{LIVE_CSS}{FLY_CSS}</style>
      {fleet.error && !booted && <div className="lv-note is-bad" style={{ marginBottom: '1rem' }}>{fleet.error}</div>}
      <div className="fly">
        <div>
          {!booted ? <p className="lv-sub">Loading…</p>
            : myBids.length > 0 ? (
              <>
                {ordered.map(bid => (
                  <TripCard
                    key={bid.id} bid={bid} row={board.get(bid.aircraftId)} landed={landed}
                    typeOf={typeOf} fleetImages={fleetImages} onChanged={fleet.reload}
                    onAddSector={canExtend(bid) ? () => openExtend(bid) : null}
                  />
                ))}
                {extending && (
                  <Booker
                    key={`x${extending.seed}`}
                    orgId={orgId} board={board} routes={routes} typeOf={typeOf}
                    fleetImages={fleetImages} fleetNameById={fleetNameById}
                    focusAircraftId={extending.bid.aircraftId} extendBid={extending.bid}
                    onClose={() => setExtending(null)}
                    onBooked={() => { setExtending(null); fleet.reload(); }}
                  />
                )}
                {!extending && (atLimit ? (
                  focusAircraftId && !focusIsMine && (
                    <div className="lv-note">You can have up to {MAX_BOOKINGS} aircraft booked at a time. Fly or cancel one before booking another.</div>
                  )
                ) : showAnother ? (
                  <Booker
                    key={`another-${focusIsMine ? 'x' : focusAircraftId || 'book'}`}
                    orgId={orgId} board={board} routes={routes} typeOf={typeOf}
                    fleetImages={fleetImages} fleetNameById={fleetNameById}
                    focusAircraftId={focusIsMine ? null : focusAircraftId}
                    excludeAircraftIds={myAircraftIds}
                    onClose={() => setAnother('closed')}
                    onBooked={() => { setAnother('closed'); fleet.reload(); }}
                  />
                ) : (
                  <button className="lv-btn" style={{ marginTop: '1rem' }} onClick={() => setAnother('open')}>
                    <Plane size={14} />Book another aircraft
                  </button>
                ))}
              </>
            ) : (
              <>
                {lastLogged && (
                  <div className="lv-note is-ok" style={{ marginBottom: '1rem' }}>
                    <strong>{lastLogged.l.flightNumber} {lastLogged.l.originIcao} to {lastLogged.l.destIcao} is logged</strong>
                    {lastLogged.l.pirepFlightTime ? `, ${fmtHours(Number(lastLogged.l.pirepFlightTime))}` : ''}. Book your next flight below.
                  </div>
                )}
                <Booker
                  key={focusAircraftId || 'book'}
                  orgId={orgId} board={board} routes={routes} typeOf={typeOf}
                  fleetImages={fleetImages} fleetNameById={fleetNameById}
                  focusAircraftId={focusAircraftId} onBooked={fleet.reload}
                />
              </>
            )}
        </div>

        <aside>
          <section className="lv-panel">
            <h3 className="lv-h" style={{ marginBottom: '0.75rem' }}>Your Live flying</h3>
            <div className="side-stat">
              <div><div className="side-big">{stats ? stats.flights : '–'}</div><div className="lv-sub">flights</div></div>
              <div><div className="side-big">{stats ? stats.hours : '–'}</div><div className="lv-sub">hours</div></div>
            </div>
            <button className="lv-link" style={{ marginTop: '0.9rem' }} onClick={() => onNavigate('logbook')}>Your logbook</button>
          </section>
          <section className="lv-panel">
            <h3 className="lv-h" style={{ marginBottom: '0.5rem' }}>Top pilots</h3>
            {!leaderboard ? <p className="lv-sub">Loading…</p>
              : leaderboard.length === 0 ? <p className="lv-sub">No Live flights logged yet.</p>
              : leaderboard.slice(0, 5).map((e, i) => (
                <div key={e.pilotId} className="side-row">
                  <span className="lv-muted" style={{ width: '1.2rem', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{e.callsign || e.name}</span>
                  <span className="lv-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.hours}h</span>
                </div>
              ))}
            <button className="lv-link" style={{ marginTop: '0.75rem' }} onClick={() => onNavigate('pilots')}>Full leaderboard</button>
          </section>
        </aside>
      </div>
    </div>
  );
}

// Your trip

function TripCard({ bid, row, landed, typeOf, fleetImages, onChanged, onAddSector }) {
  const ac = row?.ac || { registration: bid.aircraftRegistration };
  const legs = bid.legs || [];
  const names = useAirportNames(legs.flatMap(l => [l.originIcao, l.destIcao]));
  const [pirepLeg, setPirepLeg] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [changing, setChanging] = useState(false);

  const mineInQueue = (row?.queue || []).filter(q => q.bid.id === bid.id);
  const current = mineInQueue[0] || null;
  const currentIdx = current ? current.legIndex : legs.findIndex(l => !l.pirepId && !l.expired);
  const currentLeg = legs[currentIdx] || legs[0];
  const isLanded = i => landed.some(l => l.bidId === bid.id && l.legIndex === i);
  const ahead = current ? (row.queue || []).filter(q => q.bid.id !== bid.id && q.start < current.start) : [];
  const before = ahead[ahead.length - 1] || null; // the booking straight before this one
  const started = !!current?.started;
  const timed = legs.length > 0 && legs.every(l => l.departureUtc) && legs.every(l => !l.pirepId && !l.expired);

  let status;
  if (bid.status === 'pending') status = { label: 'Waiting on staff', cls: 'lv-warn' };
  else if (current?.flying || started) status = { label: 'In flight', cls: 'lv-ok' };
  else if (isLanded(currentIdx)) status = { label: 'Landed', cls: 'lv-ok' };
  else if (before?.isMine) status = { label: `After your ${before.leg.flightNumber}`, cls: 'lv-info' };
  else if (before) status = { label: 'Queued', cls: 'lv-warn' };
  else if (currentLeg?.departureUtc && new Date(currentLeg.departureUtc).getTime() - Date.now() > HALF) status = { label: `Departs ${zWhen(new Date(currentLeg.departureUtc).getTime())}`, cls: 'lv-info' };
  else status = { label: 'Ready to fly', cls: 'lv-ok' };

  const legState = (l, i) => {
    if (l.pirepId) return <span className="lv-ok" style={{ fontWeight: 700 }}>Logged{l.pirepFlightTime ? `, ${fmtHours(Number(l.pirepFlightTime))}` : ''}</span>;
    if (l.expired) return <span className="lv-muted">Not flown in time</span>;
    if (bid.status === 'pending') return null;
    const q = mineInQueue.find(x => x.legIndex === i);
    if (q?.flying || q?.started) return <span className="lv-ok" style={{ fontWeight: 700 }}>In flight</span>;
    if (isLanded(i)) return <span className="lv-ok" style={{ fontWeight: 700 }}>Landed, filing</span>;
    if (i !== currentIdx) return <span className="lv-muted">After {legs[i - 1]?.flightNumber || 'the first'}</span>;
    return q && q.start > Date.now() + 60 * 1000
      ? <span className="lv-warn" style={{ fontWeight: 700 }}>From {zWhen(q.start)}</span>
      : <span className="lv-ok" style={{ fontWeight: 700 }}>Ready</span>;
  };

  const cancel = async () => {
    try {
      await ifLiveBids.cancel(bid.id);
      showToast('Booking cancelled', 'success');
      setCancelling(false);
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't cancel", 'error');
    }
  };

  const windowOpen = !!currentLeg?.windowStartUtc;
  const startBy = current?.startBy || null;
  const left = startBy ? startBy - Date.now() : null;

  return (
    <section className="lv-panel trip">
      <div className="trip-head">
        <Thumb ac={ac} fleetImages={fleetImages} size={22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lv-reg" style={{ fontSize: '1.45rem' }}>{bid.aircraftRegistration}</div>
          <div className="lv-sub">{typeOf(ac) || 'Aircraft'}</div>
        </div>
        <span className={`lv-chip ${status.cls}`}><span className="lv-dot" />{status.label}</span>
      </div>

      <div className="trip-legs">
        {legs.map((l, i) => (
          <div key={i} className={`trip-leg${l.pirepId || l.expired ? ' is-done' : ''}`}>
            <span className="trip-flt">{l.flightNumber}</span>
            <span style={{ minWidth: 0 }}>
              <span className="trip-route">{l.originIcao} <ArrowRight size={15} style={{ verticalAlign: -2, opacity: 0.55 }} /> {l.destIcao}</span>
              <span className="lv-sub" style={{ display: 'block' }}>
                {cityOf(names, l.originIcao) && cityOf(names, l.destIcao) ? `${cityOf(names, l.originIcao)} to ${cityOf(names, l.destIcao)}` : ' '}
              </span>
            </span>
            <span className="trip-right">
              <span style={{ display: 'block', fontWeight: 700 }}>
                {l.departureUtc ? `${zTime(new Date(l.departureUtc))} to ${zTime(new Date(l.arrivalUtc))}` : 'Any time'}
              </span>
              {legState(l, i)}
            </span>
          </div>
        ))}
      </div>

      {bid.status === 'pending' ? (
        <div className="trip-how">
          The Live schedule couldn't be created automatically, so staff will finish it off. It'll show as ready here once they have.
        </div>
      ) : (
        <>
          {current && (started ? (
            <LandBy bid={bid} legIndex={currentIdx} leg={currentLeg}
              bookedAfter={(row?.queue || []).some(q => q.bid.id !== bid.id)} onChanged={onChanged} />
          ) : before ? (
            <div className="trip-hold">
              <span>You'll have <strong>4 hours</strong> to start once {before.isMine ? `your ${before.leg.flightNumber} is logged` : 'the booking before yours ends'}.</span>
            </div>
          ) : (
            <div className="trip-hold">
              <span>
                Start by <strong>{zTime(new Date(startBy))}</strong>
                {zDayKey(new Date(startBy)) !== zDayKey(new Date()) && <span className="lv-muted"> on {zDay(new Date(startBy))}</span>}
                <span className="lv-muted"> or the booking is cancelled</span>
              </span>
              {windowOpen && (
                <span className={left < HOUR ? 'lv-bad' : 'lv-muted'} style={{ fontWeight: left < HOUR ? 700 : 400 }}>
                  {left > 0 ? `${untilText(startBy)} left` : 'Checking'}
                </span>
              )}
            </div>
          ))}
          {(before || isLanded(currentIdx)) && (
            <div className="trip-how">
              {before?.isMine ? (
                <>Flies after your <strong className="lv-mono">{before.leg.flightNumber}</strong> lands at {before.leg.destIcao}. Once that's logged, fly <strong className="lv-mono">{currentLeg.flightNumber}</strong> from {currentLeg.originIcao}.</>
              ) : before ? (
                <>{ahead[ahead.length - 1].pilot} has {bid.aircraftRegistration} until <strong>{zWhen(ahead[ahead.length - 1].end)}</strong>. Yours starts as soon as they're done, from {currentLeg.originIcao}. If they land early, it's yours early and you'll get a ping.</>
              ) : (
                <>Found your landing at {currentLeg.destIcao}. The PIREP files itself in a few minutes, or file it now.</>
              )}
            </div>
          )}
          {changing && <ChangeTime bid={bid} onDone={() => { setChanging(false); onChanged(); }} onCancel={() => setChanging(false)} />}
        </>
      )}

      <div className="trip-actions">
        {legs[0]?.flightPlan && <button className="lv-btn" onClick={() => copyText(legs[0].flightPlan, 'Flight plan')}><Copy size={14} />Flight plan</button>}
        {bid.status === 'active' && currentIdx >= 0 && !ahead.length && (
          <button className={isLanded(currentIdx) ? 'btn btn-primary' : 'lv-btn'} onClick={() => setPirepLeg(currentIdx)}>File PIREP</button>
        )}
        <span className="lv-spacer" />
        {onAddSector && <button className="lv-link" onClick={onAddSector}>Add a sector</button>}
        {timed && bid.status === 'active' && !changing && <button className="lv-link" onClick={() => setChanging(true)}>Change time</button>}
        <button className="lv-link is-bad" onClick={() => setCancelling(true)}>Cancel booking</button>
      </div>

      <Crew bid={bid} onChanged={onChanged} />

      {pirepLeg != null && <PirepModal bid={bid} legIndex={pirepLeg} onClose={() => setPirepLeg(null)} onFiled={() => { setPirepLeg(null); onChanged(); }} />}
      {cancelling && (
        <ConfirmModal
          title="Cancel this booking?"
          message={`${bid.aircraftRegistration} goes back to the fleet and every sector you haven't flown comes off Infinite Flight Live.`}
          confirmLabel="Cancel booking"
          cancelLabel="Keep it"
          danger
          onConfirm={cancel}
          onClose={() => setCancelling(false)}
        />
      )}
    </section>
  );
}

const ZULU_TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${pad((i % 2) * 30)}`);
const dayOptions = () => [0, 1, 2, 3].map(n => {
  const d = new Date(Date.now() + n * 24 * HOUR);
  return { value: zDayKey(d), label: n === 0 ? `Today, ${zDay(d)}` : n === 1 ? `Tomorrow, ${zDay(d)}` : zDay(d) };
});

function ChangeTime({ bid, onDone, onCancel }) {
  const first = new Date(bid.legs[0].departureUtc);
  const [day, setDay] = useState(zDayKey(first));
  const [time, setTime] = useState(`${pad(first.getUTCHours())}:${pad(first.getUTCMinutes() < 30 ? 0 : 30)}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await ifLiveBids.changeTime(bid.id, new Date(`${day}T${time}:00Z`).toISOString());
      showToast('Time changed', 'success');
      onDone();
    } catch (err) {
      setError(err.message || "Couldn't change the time");
      setSaving(false);
    }
  };
  return (
    <div className="trip-how">
      <div className="bk-when">
        <div className="bk-dd" style={{ width: 190 }}><Dropdown value={day} onChange={setDay} options={dayOptions()} /></div>
        <div className="bk-dd" style={{ width: 120 }}><Dropdown value={time} onChange={setTime} searchPlaceholder="Type a time, e.g. 0730" options={ZULU_TIMES.map(t => ({ value: t, label: `${t.replace(':', '')}Z` }))} /></div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="lv-link" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      {bid.legs.length > 1 && <p className="lv-sub" style={{ marginTop: '0.5rem' }}>The second flight moves by the same amount.</p>}
      {error && <div className="lv-note is-bad" style={{ marginTop: '0.6rem' }}>{error}</div>}
    </div>
  );
}

function Crew({ bid, onChanged }) {
  const [candidates, setCandidates] = useState(null);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const crew = bid.crew || [];
  const options = (candidates || []).filter(c => !crew.some(x => x.pilotId === c.id))
    .map(c => ({ value: c.id, label: `${c.callsign || c.name}${c.ifUsername ? ` (${c.ifUsername})` : ''}` }));

  const open = () => {
    setPicking(true);
    if (!candidates) ifLiveBids.crewCandidates().then(d => setCandidates(d.candidates || [])).catch(() => setCandidates([]));
  };
  const invite = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await ifLiveBids.addCrew(bid.id, pick);
      showToast('First Officer added', 'success');
      setPicking(false);
      setPick('');
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't add them", 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (pilotId) => {
    try {
      await ifLiveBids.removeCrew(bid.id, pilotId);
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't remove them", 'error');
    }
  };

  return (
    <div className="trip-crew">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem 1rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>Crew</span>
        <span>You <span className="lv-muted">Captain</span></span>
        {crew.map(c => (
          <span key={c.pilotId} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            {c.name || c.ifUsername || 'Pilot'} <span className="lv-muted">First Officer</span>
            <button onClick={() => remove(c.pilotId)} aria-label={`Remove ${c.name || 'crew member'}`} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2 }}><X size={14} /></button>
          </span>
        ))}
        {!picking && crew.length < 2 && <button className="lv-link" onClick={open}>Add a First Officer</button>}
      </div>
      {picking && (
        <div className="bk-when" style={{ marginTop: '0.75rem' }}>
          <div style={{ flex: '1 1 240px', maxWidth: 360 }}>
            <Dropdown value={pick} onChange={setPick} placeholder={!candidates ? 'Loading pilots…' : options.length ? 'Choose a pilot' : 'No pilots available'} searchPlaceholder="Search pilots" options={options} disabled={!options.length} />
          </div>
          <button className="btn btn-primary" onClick={invite} disabled={!pick || busy}>{busy ? 'Adding…' : 'Add'}</button>
          <button className="lv-link" onClick={() => { setPicking(false); setPick(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function PirepModal({ bid, legIndex, onClose, onFiled }) {
  const leg = bid.legs[legIndex];
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await ifLiveBids.filePirep(bid.id, legIndex, { notes });
      showToast('PIREP filed', 'success');
      onFiled();
    } catch (err) {
      setError(err.message || "Couldn't file the PIREP");
      setBusy(false);
    }
  };
  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1.5rem' }}>
      <div className="lv" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="File PIREP" style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 440, padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <h3 className="lv-h">File PIREP for {leg.flightNumber}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={18} /></button>
        </div>
        <p className="lv-sub" style={{ marginBottom: '1rem' }}>
          {leg.originIcao} to {leg.destIcao} on {bid.aircraftRegistration}. We match it against your Infinite Flight logbook and take the flight time from there.
        </p>
        <div className="lv-field">
          <label htmlFor="pirep-notes">Notes <span className="lv-muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <textarea id="pirep-notes" rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        {error && <div className="lv-note is-bad" style={{ marginTop: '0.75rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
          <button onClick={onClose} disabled={busy} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ flex: 1 }}>{busy ? 'Checking…' : 'File PIREP'}</button>
        </div>
      </div>
    </div>
  );
}

// Booking

// Next half hour at least 30 minutes out.
const defaultLater = () => Math.ceil((Date.now() + HOUR) / HALF) * HALF;

function Booker({ orgId, board, routes, typeOf, fleetImages, fleetNameById, focusAircraftId, onBooked, onClose, extendBid = null, excludeAircraftIds = [] }) {
  const ref = useRef(null);
  useEffect(() => { if (onClose) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const focusRow = focusAircraftId ? board.get(focusAircraftId) : null;
  const focusLater = focusRow && !availability(focusRow, null).ok && focusRow.freeFrom
    ? Math.ceil(focusRow.freeFrom / HALF) * HALF : null;
  const [mode, setMode] = useState(focusLater ? 'later' : 'now');
  const initial = new Date(focusLater || defaultLater());
  const [day, setDay] = useState(zDayKey(initial));
  const [time, setTime] = useState(`${pad(initial.getUTCHours())}:${pad(initial.getUTCMinutes())}`);
  const when = mode === 'later' ? new Date(`${day}T${time}:00Z`).getTime() : null;
  const whenInPast = when != null && when < Date.now();

  const [acId, setAcId] = useState(focusAircraftId);
  const [picked, setPicked] = useState(null); // { route } or { custom: true }

  // Every active-slot aircraft with whether it can be booked for `when`.
  const rows = useMemo(() => [...board.values()]
    .filter(r => r.ac.isFleetActiveSlot && !excludeAircraftIds.includes(r.ac.id))
    .map(r => ({ ...r, avail: availability(r, when) })), [board, when, excludeAircraftIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = rows.find(r => r.ac.id === acId) || null;
  const chosenOk = chosen?.avail.ok;

  // Each aircraft's routes from where it'll be.
  const routesByAc = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const at = r.avail.ok ? r.avail.at : null;
      map.set(r.ac.id, at ? routes.filter(rt => rt.departure_icao === at && canFly(r.ac, rt, fleetNameById)) : []);
    }
    return map;
  }, [rows, routes, fleetNameById]);

  const names = useAirportNames(useMemo(() => [
    ...rows.map(r => r.avail.at || r.freeAt),
    ...(chosen ? (routesByAc.get(chosen.ac.id) || []).map(r => r.arrival_icao) : []),
  ], [rows, chosen, routesByAc]));

  const step = !chosen || !chosenOk ? 1 : !picked ? 2 : 3;
  const whenText = when == null ? 'flying now' : `off blocks ${zWhen(when)}${zDayKey(new Date(when)) === zDayKey(new Date()) ? ' today' : ''}`;

  return (
    <section className="lv-panel" ref={ref} style={{ scrollMarginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <ol className="bk-crumbs" style={{ flex: 1 }}>
          {['Aircraft', 'Destination', 'Confirm'].map((l, i) => <li key={l} className={step === i + 1 ? 'is-on' : ''}><span>{i + 1}</span>{l}</li>)}
        </ol>
        {onClose && <button className="lv-link" onClick={onClose}>Close</button>}
      </div>

      {step === 1 && (
        <>
          <h3 className="lv-h" style={{ marginBottom: '0.75rem' }}>When are you flying?</h3>
          <div className="bk-when">
            <div className="lv-seg">
              <button className={mode === 'now' ? 'is-on' : ''} onClick={() => setMode('now')}>Now</button>
              <button className={mode === 'later' ? 'is-on' : ''} onClick={() => setMode('later')}>Later</button>
            </div>
            {mode === 'later' && (
              <>
                <div className="bk-dd" style={{ width: 200 }}><Dropdown value={day} onChange={setDay} options={dayOptions()} /></div>
                <div className="bk-dd" style={{ width: 120 }}><Dropdown value={time} onChange={setTime} searchPlaceholder="Type a time, e.g. 0730" options={ZULU_TIMES.map(t => ({ value: t, label: `${t.replace(':', '')}Z` }))} /></div>
              </>
            )}
          </div>
          <p className="lv-sub" style={{ marginTop: '0.5rem' }}>
            {mode === 'now'
              ? 'Book now and you have 4 hours to start the flight on the Expert Server, or the booking is cancelled.'
              : whenInPast ? <span className="lv-bad">That time has passed. Pick a later one.</span>
              : 'Off-blocks time in Zulu. You have 4 hours from then to start. Only aircraft free by then are shown.'}
          </p>
          {!whenInPast && (
            <AircraftStep rows={rows} routesByAc={routesByAc} names={names} typeOf={typeOf} fleetImages={fleetImages} later={mode === 'later'}
              onChoose={id => { setAcId(id); setPicked(null); }}
              onLater={r => {
                const t = new Date(Math.ceil(r.avail.until / HALF) * HALF);
                setMode('later');
                setDay(zDayKey(t));
                setTime(`${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`);
                setAcId(r.ac.id);
                setPicked(null);
              }} />
          )}
        </>
      )}

      {step >= 2 && (
        <div className="bk-picked">
          <Thumb ac={chosen.ac} fleetImages={fleetImages} size={20} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="lv-reg" style={{ display: 'block', fontSize: '1.1rem' }}>{chosen.ac.registration}</span>
            <span className="lv-sub" style={{ display: 'block' }}>{typeOf(chosen.ac) || 'Aircraft'}</span>
            <span style={{ display: 'block', fontSize: '0.875rem', marginTop: 2 }}>
              From {placeText(names, chosen.avail.at)}, {chosen.avail.afterMine
                ? <>after your <span className="lv-mono">{chosen.queue[chosen.queue.length - 1].leg.flightNumber}</span></>
                : chosen.avail.after ? <>after {chosen.queue[chosen.queue.length - 1].pilot}'s booking ends at <strong>{zWhen(chosen.avail.after)}</strong></> : whenText}
            </span>
          </span>
          {!extendBid && <button className="lv-link" onClick={() => { setAcId(null); setPicked(null); }}>Change</button>}
        </div>
      )}

      {step === 2 && (
        <RouteStep
          ac={chosen.ac} at={chosen.avail.at} routes={routesByAc.get(chosen.ac.id) || []} names={names}
          onPick={r => setPicked({ route: r })} onCustom={() => setPicked({ custom: true })}
        />
      )}

      {step === 3 && (
        <ConfirmStep
          orgId={orgId} row={chosen} picked={picked} when={when} routes={routes} fleetNameById={fleetNameById} extendBid={extendBid}
          onBack={() => setPicked(null)} onBooked={onBooked}
        />
      )}
    </section>
  );
}

function AircraftStep({ rows, routesByAc, names, typeOf, fleetImages, later, onChoose, onLater }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [at, setAt] = useState('');
  const [showBusy, setShowBusy] = useState(false);

  const types = useMemo(() => [...new Set(rows.map(r => typeOf(r.ac)).filter(Boolean))].sort(), [rows, typeOf]);
  const airports = useMemo(() => [...new Set(rows.filter(r => r.avail.ok).map(r => r.avail.at).filter(Boolean))].sort(), [rows]);
  const q = query.trim().toLowerCase();
  const match = r => (!type || typeOf(r.ac) === type)
    && (!at || r.avail.at === at)
    && (!q || [r.ac.registration, typeOf(r.ac), r.avail.at, r.freeAt, cityOf(names, r.avail.at)].filter(Boolean).join(' ').toLowerCase().includes(q));
  const sortKey = (a, b) => (!a.avail.at) - (!b.avail.at) || String(a.avail.at).localeCompare(String(b.avail.at)) || a.ac.registration.localeCompare(b.ac.registration);

  const ready = rows.filter(r => r.avail.ok && !r.avail.after && match(r)).sort(sortKey);
  const yours = rows.filter(r => r.avail.ok && r.avail.afterMine && match(r)).sort(sortKey);
  const soon = rows.filter(r => r.avail.ok && r.avail.after && !r.avail.afterMine && match(r)).sort((a, b) => a.avail.after - b.avail.after);
  const busy = rows.filter(r => !r.avail.ok && match(r)).sort((a, b) => (a.avail.until || Infinity) - (b.avail.until || Infinity));

  const tile = r => {
    const n = (routesByAc.get(r.ac.id) || []).length;
    const city = cityOf(names, r.avail.at);
    return (
      <button key={r.ac.id} className="bk-tile" onClick={() => onChoose(r.ac.id)}>
        <Thumb ac={r.ac} fleetImages={fleetImages} size={26} className="bk-tile-img" />
        <span className="bk-tile-body">
          <span className="bk-tile-reg">{r.ac.registration}</span>
          <span className="bk-tile-type" title={typeOf(r.ac)}>{typeOf(r.ac) || 'Aircraft'}</span>
          <span className="bk-tile-at">{r.avail.at ? <>{city || r.avail.at} <span className="lv-mono lv-muted" style={{ fontWeight: 500 }}>{city ? r.avail.at : ''}</span></> : 'Location unknown'}</span>
          {r.avail.afterMine
            ? <span className="lv-info" style={{ fontSize: '0.82rem', fontWeight: 700 }}>After your {r.queue[r.queue.length - 1].leg.flightNumber}</span>
            : r.avail.after
            ? <span className="lv-warn" style={{ fontSize: '0.82rem', fontWeight: 700 }}>Free from {zWhen(r.avail.after)}</span>
            : <span className="lv-ok" style={{ fontSize: '0.82rem', fontWeight: 700 }}>{later ? 'Free then' : 'Free now'}</span>}
          <span className="bk-tile-foot">
            <span>{r.avail.at ? `${n} route${n === 1 ? '' : 's'}` : 'Custom flight'}</span>
            <span className="lv-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>Choose <ArrowRight size={13} /></span>
          </span>
        </span>
      </button>
    );
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="lv-bar">
        <div className="lv-search">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Registration, type or airport" aria-label="Search aircraft" />
        </div>
        {airports.length > 1 && (
          <div style={{ width: 210 }}>
            <Dropdown value={at} onChange={setAt} searchPlaceholder="Search airports"
              options={[{ value: '', label: 'Any airport' }, ...airports.map(i => ({ value: i, label: placeText(names, i) }))]} />
          </div>
        )}
        {types.length > 1 && (
          <div style={{ width: 210 }}>
            <Dropdown value={type} onChange={setType} searchPlaceholder="Search types"
              options={[{ value: '', label: 'Any type' }, ...types.map(t => ({ value: t, label: t }))]} />
          </div>
        )}
      </div>

      {yours.length > 0 && (
        <div className="bk-section">
          <div className="bk-section-h">Your aircraft <span>{yours.length}</span></div>
          <p className="lv-sub" style={{ margin: '-0.3rem 0 0.75rem' }}>Add another sector, flown from where your last one lands.</p>
          <div className="bk-tiles">{yours.map(tile)}</div>
        </div>
      )}

      <div className="bk-section">
        <div className="bk-section-h">{later ? 'Free at that time' : 'Free now'} <span>{ready.length}</span></div>
        {ready.length ? <div className="bk-tiles">{ready.map(tile)}</div>
          : <p className="lv-sub">{rows.some(r => r.avail.ok) ? 'Nothing matches your search.' : later ? 'Nothing is free at that time. Try a later time.' : 'Everything is booked right now.'}</p>}
      </div>

      {soon.length > 0 && (
        <div className="bk-section">
          <div className="bk-section-h">Free soon <span>{soon.length}</span></div>
          <p className="lv-sub" style={{ margin: '-0.3rem 0 0.75rem' }}>Someone else has these right now. Book one and yours starts as soon as they're done.</p>
          <div className="bk-tiles">{soon.map(tile)}</div>
        </div>
      )}

      {busy.length > 0 && (
        <div className="bk-section">
          <div className="bk-section-h">
            Available later <span>{busy.length}</span>
            <button className="lv-link" style={{ marginLeft: 'auto' }} onClick={() => setShowBusy(s => !s)}>{showBusy ? 'Hide' : 'Show'}</button>
          </div>
          {showBusy && (
            <div className="bk-busy">
              {busy.map(r => {
                const last = r.queue[r.queue.length - 1];
                return (
                  <div key={r.ac.id} className="bk-busy-row">
                    <span className="lv-reg">{r.ac.registration}</span>
                    <span className="lv-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeOf(r.ac)}{last ? `, ${last.pilot}` : ''}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '1rem', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{r.avail.reason}{r.avail.until && r.freeAt ? ` at ${r.freeAt}` : ''}</span>
                      {r.avail.until && <button className="lv-link" onClick={() => onLater(r)}>Book after</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EXTEND_MAX = 3;
function LandBy({ bid, legIndex, leg, bookedAfter, onChanged }) {
  const [busy, setBusy] = useState(false);
  const deadline = leg?.deadlineUtc ? new Date(leg.deadlineUtc).getTime() : null;
  if (!deadline) {
    return <div className="trip-hold"><span>Seen flying. <strong>{bid.aircraftRegistration}</strong> is yours until you land and file.</span></div>;
  }
  const left = deadline - Date.now();
  const used = leg.extensions || 0;
  const extend = async () => {
    setBusy(true);
    try {
      const r = await ifLiveBids.extend(bid.id, legIndex);
      showToast(`Extended to ${zTime(new Date(r.deadlineUtc))}`, 'success');
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't extend", 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="trip-hold">
      <span>
        Seen flying. Land and file by <strong>{zTime(new Date(deadline))}</strong>
        {zDayKey(new Date(deadline)) !== zDayKey(new Date()) && <span className="lv-muted"> on {zDay(new Date(deadline))}</span>}
        <span className="lv-muted"> or the booking closes and {bid.aircraftRegistration} goes back in the fleet</span>
        {used > 0 && <span className="lv-muted"> (extended {used} time{used === 1 ? '' : 's'})</span>}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className={left < HOUR ? 'lv-bad' : 'lv-muted'} style={{ fontWeight: left < HOUR ? 700 : 400 }}>
          {left > 0 ? `${untilText(deadline)} left` : 'Checking'}
        </span>
        {used < EXTEND_MAX && !bookedAfter && (
          <button className="lv-btn" onClick={extend} disabled={busy}>{busy ? 'Extending' : 'Extend 1 hour'}</button>
        )}
        {used < EXTEND_MAX && bookedAfter && <span className="lv-muted" style={{ fontSize: '0.8rem' }}>Booked after you, can't extend</span>}
      </span>
    </div>
  );
}

function RouteStep({ ac, at, routes, names, onPick, onCustom }) {
  const [query, setQuery] = useState('');
  const [length, setLength] = useState('any');
  const [shown, setShown] = useState(SHOW_STEP);
  const q = query.trim().toLowerCase();
  const test = LENGTHS.find(l => l.key === length)?.test;
  const list = routes.map(r => ({ r, m: routeMinutes(r) }))
    .filter(x => !test || (x.m != null && test(x.m)))
    .filter(x => !q || [x.r.flight_number, x.r.arrival_icao, cityOf(names, x.r.arrival_icao)].filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.m ?? 9999) - (b.m ?? 9999));

  if (!at) {
    return (
      <div className="lv-empty">
        We don't know where {ac.registration} is parked, so there are no routes to list.
        <div style={{ marginTop: '0.9rem' }}><button className="btn btn-primary" onClick={onCustom}>Plan a custom flight</button></div>
      </div>
    );
  }
  return (
    <>
      <h3 className="lv-h" style={{ marginBottom: '0.75rem' }}>Where to? <span className="lv-muted" style={{ fontWeight: 400, fontSize: '0.9rem' }}>{routes.length} route{routes.length === 1 ? '' : 's'} from {at}</span></h3>
      {routes.length === 0 ? (
        <div className="lv-empty">
          There are no routes from {placeText(names, at)} for this aircraft.
          <div style={{ marginTop: '0.9rem' }}><button className="btn btn-primary" onClick={onCustom}>Plan a custom flight</button></div>
        </div>
      ) : (
        <>
          <div className="lv-bar" style={{ marginBottom: '0.6rem' }}>
            <div className="lv-search" style={{ maxWidth: 'none' }}>
              <Search size={16} />
              <input value={query} onChange={e => { setQuery(e.target.value); setShown(SHOW_STEP); }} placeholder="City, airport or flight number" aria-label="Search destinations" autoFocus />
            </div>
          </div>
          <div className="bk-chips">
            {LENGTHS.map(l => <button key={l.key} className={`bk-chip${length === l.key ? ' is-on' : ''}`} onClick={() => { setLength(l.key); setShown(SHOW_STEP); }}>{l.label}</button>)}
          </div>
          {list.length === 0 ? <div className="lv-empty">Nothing matches. Try clearing the search.</div> : (
            <div className="bk-list">
              {list.slice(0, shown).map(({ r, m }) => (
                <button key={r.id} className="bk-row" onClick={() => onPick(r)}>
                  <span className="bk-flt">{r.flight_number}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="bk-city">{cityOf(names, r.arrival_icao) || r.arrival_icao}</span>
                    <span className="bk-codes">{r.departure_icao} to {r.arrival_icao}</span>
                  </span>
                  <span className="bk-time">{fmtMins(m) || '–'}</span>
                  <span className="bk-go">Select <ArrowRight size={13} /></span>
                </button>
              ))}
            </div>
          )}
          {list.length > shown && <button className="bk-more" onClick={() => setShown(s => s + SHOW_STEP)}>Show {Math.min(SHOW_STEP, list.length - shown)} more</button>}
          <p className="lv-sub" style={{ marginTop: '1rem', textAlign: 'center' }}>
            Going somewhere that isn't listed? <button className="lv-link" onClick={onCustom}>Plan a custom flight</button>
          </p>
        </>
      )}
    </>
  );
}

function ConfirmStep({ orgId, row, picked, when, routes, fleetNameById, onBack, onBooked, extendBid = null }) {
  const { ac } = row;
  const custom = !!picked.custom;
  const [cFlight, setCFlight] = useState('');
  const [cOrigin, setCOrigin] = useState('');
  const [cDest, setCDest] = useState('');
  const origin = custom ? (row.avail.at || cOrigin.trim().toUpperCase()) : picked.route.departure_icao;
  const out = custom
    ? { flightNumber: cFlight.trim(), originIcao: origin, destIcao: cDest.trim().toUpperCase(), minutes: null }
    : { flightNumber: picked.route.flight_number, originIcao: origin, destIcao: picked.route.arrival_icao, minutes: routeMinutes(picked.route) };

  // Second flight: routes out of the destination this aircraft can fly, straight back first.
  const nextOptions = useMemo(() => (out.destIcao
    ? routes.filter(r => r.departure_icao === out.destIcao && canFly(ac, r, fleetNameById))
      .sort((a, b) => (b.arrival_icao === out.originIcao) - (a.arrival_icao === out.originIcao) || (routeMinutes(a) ?? 9999) - (routeMinutes(b) ?? 9999))
    : []), [routes, out.destIcao, out.originIcao, ac, fleetNameById]);
  const [withNext, setWithNext] = useState(false);
  const [nextId, setNextId] = useState('');
  const nextRoute = nextOptions.find(r => r.id === nextId) || nextOptions[0] || null;
  const back = withNext && nextRoute ? { flightNumber: nextRoute.flight_number, originIcao: nextRoute.departure_icao, destIcao: nextRoute.arrival_icao, minutes: routeMinutes(nextRoute) } : null;

  const [plan, setPlan] = useState('');
  const [showPlan, setShowPlan] = useState(false);

  // Timed legs for "Later": off blocks then, the second an hour after landing.
  const dep1 = when;
  const arr1 = dep1 != null ? dep1 + (out.minutes || 90) * 60000 : null;
  const dep2 = arr1 != null ? arr1 + HOUR : null;
  const arr2 = dep2 != null && back ? dep2 + (back.minutes || 90) * 60000 : null;
  const iso = t => new Date(t).toISOString();
  const legs = [{ flightNumber: out.flightNumber, originIcao: out.originIcao, destIcao: out.destIcao,
    ...(dep1 != null ? { departureUtc: iso(dep1), arrivalUtc: iso(arr1) } : {}),
    ...(plan.trim() ? { flightPlan: plan.trim() } : {}) }];
  if (back) legs.push({ flightNumber: back.flightNumber, originIcao: back.originIcao, destIcao: back.destIcao, ...(dep2 != null ? { departureUtc: iso(dep2), arrivalUtc: iso(arr2) } : {}) });

  const ready = !!(out.flightNumber && out.originIcao && out.destIcao);
  const payload = ready ? { organizationId: orgId, aircraftId: ac.id, aircraftRegistration: ac.registration, aircraftTypeId: ac.aircraftId || null, liveryId: ac.liveryId || null, legs, ...(extendBid ? { extendBidId: extendBid.id } : {}) } : null;
  const payloadKey = JSON.stringify(payload);

  // The server's own check, so what this says is what you get.
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    if (!payload) { setQuote(null); return undefined; }
    let cancelled = false;
    setQuote({ loading: true });
    const t = setTimeout(() => {
      ifLiveBids.quote(payload)
        .then(q => { if (!cancelled) setQuote(q); })
        .catch(err => { if (!cancelled) setQuote({ ok: false, error: err.message || "Couldn't check this booking" }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const names = useAirportNames([out.originIcao, out.destIcao, back?.destIcao]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = extendBid ? await ifLiveBids.addLegs(extendBid.id, legs) : await ifLiveBids.create(payload);
      showToast(extendBid ? `Added to your ${ac.registration} booking` : res.bid?.status === 'pending' ? `${ac.registration} reserved, waiting on staff` : `${ac.registration} is booked`, 'success');
      if (res.crewWarnings?.length) showToast(res.crewWarnings.join(' '), 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onBooked();
    } catch (err) {
      setError(err.message || "Couldn't book this aircraft");
      setSubmitting(false);
    }
  };

  const legCard = (l, i, times) => (
    <div key={i} className="bk-leg">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lv-sub" style={{ fontWeight: 700 }}>{i === 0 ? 'Flight' : l.destIcao === out.originIcao ? 'Return' : 'Then'} <span className="bk-flt" style={{ marginLeft: 6, color: 'var(--text-primary)' }}>{l.flightNumber || '–'}</span></div>
        <div className="bk-leg-big">{l.originIcao || '????'} <ArrowRight size={17} style={{ verticalAlign: -2, opacity: 0.5 }} /> {l.destIcao || '????'}</div>
        <div className="lv-sub">{cityOf(names, l.originIcao) && cityOf(names, l.destIcao) ? `${cityOf(names, l.originIcao)} to ${cityOf(names, l.destIcao)}` : ' '}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {l.minutes != null && <div style={{ fontWeight: 800 }}>{fmtMins(l.minutes)}</div>}
        <div className="lv-sub">{times ? `${zTime(new Date(times[0]))} to ${zTime(new Date(times[1]))}` : 'Any time'}</div>
      </div>
    </div>
  );

  let summary;
  if (!ready) summary = <div className="lv-note">Enter a flight number and destination.</div>;
  else if (!quote || quote.loading) summary = <div className="lv-note lv-muted">Checking…</div>;
  else if (!quote.ok) summary = <div className="lv-note is-bad"><strong>Can't book this.</strong> {quote.error}</div>;
  else {
    const by = new Date(quote.startByUtc);
    const byText = `${zTime(by)}${zDayKey(by) !== zDayKey(new Date()) ? ` on ${zDay(by)}` : ''}`;
    summary = (
      <div className="lv-note is-ok">
        {extendBid
          ? <>Flown after your last sector. <strong>You'll have 4 hours to start it</strong> once that one's logged.</>
          : quote.freeFromUtc
          ? <>Yours starts when the booking before it ends, planned for {zWhen(new Date(quote.freeFromUtc).getTime())}. <strong>You then have 4 hours to start the flight.</strong></>
          : <><strong>Start the flight by {byText}</strong> or the booking is cancelled.</>}
        {' '}Once you're flying, {ac.registration} is yours until you land and the PIREP files.
        {back && ' The second sector gets its own 4 hours, from when the first is logged.'}
      </div>
    );
  }

  return (
    <>
      <h3 className="lv-h" style={{ marginBottom: '0.75rem' }}>{custom ? 'Plan a custom flight' : 'Confirm'}</h3>

      {custom && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="bk-grid2">
            <div className="lv-field"><label htmlFor="bk-flt">Flight number</label><input id="bk-flt" value={cFlight} onChange={e => setCFlight(e.target.value)} maxLength={32} placeholder="QF401" /></div>
            <div className="lv-field"><label htmlFor="bk-dest">To (ICAO)</label><input id="bk-dest" className="lv-mono" value={cDest} onChange={e => setCDest(e.target.value.toUpperCase())} maxLength={8} placeholder="YMML" /></div>
          </div>
          {!row.avail.at && (
            <div className="lv-field" style={{ marginTop: '0.75rem' }}><label htmlFor="bk-from">From (ICAO)</label><input id="bk-from" className="lv-mono" value={cOrigin} onChange={e => setCOrigin(e.target.value.toUpperCase())} maxLength={8} placeholder="YSSY" /></div>
          )}
        </div>
      )}

      {legCard(out, 0, dep1 != null ? [dep1, arr1] : null)}
      {back && legCard(back, 1, dep2 != null ? [dep2, arr2] : null)}

      {nextOptions.length > 0 && (
        <div style={{ marginTop: '0.9rem' }}>
          <label className={`bk-toggle${withNext ? ' is-on' : ''}`}>
            <input type="checkbox" checked={withNext} onChange={e => setWithNext(e.target.checked)} />
            <span style={{ flex: 1 }}>
              <strong>{nextOptions[0].arrival_icao === out.originIcao ? 'Book the return as well' : 'Add an onward flight'}</strong>
              <span className="lv-sub" style={{ display: 'block' }}>
                {nextRoute ? `${nextRoute.flight_number}, ${nextRoute.departure_icao} to ${nextRoute.arrival_icao}${routeMinutes(nextRoute) ? `, ${fmtMins(routeMinutes(nextRoute))}` : ''}` : ''}
              </span>
            </span>
          </label>
          {withNext && nextOptions.length > 1 && (
            <div className="lv-field" style={{ marginTop: '0.6rem' }}>
              <label>Second flight</label>
              <Dropdown value={nextRoute?.id || ''} onChange={setNextId} searchPlaceholder="Search flights"
                options={nextOptions.map(r => ({ value: r.id, label: `${r.flight_number}  ${r.departure_icao} to ${r.arrival_icao}${routeMinutes(r) ? `, ${fmtMins(routeMinutes(r))}` : ''}` }))} />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        {!showPlan ? <button className="lv-link" onClick={() => setShowPlan(true)}>Add a flight plan</button> : (
          <div className="lv-field">
            <label htmlFor="bk-plan">Flight plan <span className="lv-muted" style={{ fontWeight: 400 }}>(saved on the first flight's IF schedule)</span></label>
            <textarea id="bk-plan" className="lv-mono" rows={2} maxLength={16000} value={plan} onChange={e => setPlan(e.target.value)} placeholder={`${out.originIcao || 'YSSY'} DCT ${out.destIcao || 'YMML'}`} />
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.25rem' }}>{summary}</div>
      {error && <div className="lv-note is-bad" style={{ marginTop: '0.6rem' }}><strong>Booking failed.</strong> {error}</div>}

      <div className="bk-foot">
        <button className="lv-btn" onClick={onBack} disabled={submitting}><ArrowLeft size={14} />Back</button>
        <button className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }} disabled={!quote?.ok || submitting} onClick={submit}>
          {submitting ? 'Booking…' : extendBid ? 'Add to my booking' : `Book ${ac.registration}`}
        </button>
      </div>
    </>
  );
}

