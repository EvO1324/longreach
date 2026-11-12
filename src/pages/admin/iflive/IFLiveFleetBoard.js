/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plane, RefreshCw, Search } from 'lucide-react';
import { ifLive, ifLiveStats } from '../../../api/client';
import { useIFLive } from './IFLiveContext';
import IFLiveMap from './IFLiveMap';
import FleetTimeline from './IFLiveTimeline';
import {
  LIVE_CSS, MAX_BOOKINGS, cityOf, fmtMins, placeText, splitType, useAirportNames, useFleetBoard, useLiveFleet, zTime, zWhen,
} from './liveData';

import brand from '../../../brand';

const BOARD_CSS = `
.fb-filters { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.fb-filter { display: inline-flex; align-items: baseline; gap: 0.4rem; padding: 0.4rem 0.85rem; border: 1.5px solid var(--border-color); border-radius: 999px; background: var(--bg-card); font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.fb-filter b { color: var(--text-primary); }
.fb-filter.is-on { border-color: var(--avg-green); color: var(--text-primary); }
.fb { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: var(--bg-card); }
.fb-head, .fb-row { display: grid; grid-template-columns: minmax(200px, 1.3fr) minmax(150px, 1fr) minmax(190px, 1.3fr) minmax(150px, 1fr) 6.5rem; gap: 1rem; align-items: center; padding: 0.75rem 1.1rem; }
.fb-head { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
.fb-item { border-top: 1px solid var(--border-color); }
.fb-item:first-of-type { border-top: none; }
.fb-row { cursor: pointer; }
.fb-row:hover { background: var(--bg-hover); }
.fb-ac { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.fb-ac .lv-thumb { width: 60px; height: 38px; }
.fb-cell { min-width: 0; font-size: 0.875rem; line-height: 1.35; }
.fb-cell .lv-sub { font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-strong { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-act { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; }
.fb-more { padding: 0.25rem 1.1rem 1.2rem 1.1rem; background: var(--bg-hover); border-top: 1px solid var(--border-color); }
.fb-strip { display: flex; flex-wrap: wrap; margin: 0.9rem 0 1.1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; }
.fb-fig { flex: 1 1 110px; padding: 0.65rem 0.9rem; border-left: 1px solid var(--border-color); min-width: 0; }
.fb-fig:first-child { border-left: none; }
.fb-fig b { display: block; font-size: 1.05rem; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-fig span { font-size: 0.75rem; color: var(--text-secondary); }
.fb-more h4 { margin: 0 0 0.5rem; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.fb-section + .fb-section { margin-top: 1.1rem; }
.fb-tl { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.8rem 0.95rem 0.2rem; }
.fb-ti { display: grid; grid-template-columns: 3.6rem 14px minmax(0, 1fr) auto; gap: 0.7rem; font-size: 0.875rem; }
.fb-ti-when { text-align: right; font-size: 0.78rem; color: var(--text-secondary); padding-top: 0.1rem; white-space: nowrap; }
.fb-rail { position: relative; }
.fb-rail::before { content: ''; position: absolute; left: 6px; top: 0; bottom: 0; border-left: 1.5px solid var(--border-color); }
.fb-ti:first-child .fb-rail::before { top: 0.55rem; }
.fb-ti:last-child .fb-rail::before { bottom: auto; height: 0.55rem; }
.fb-rail i { position: absolute; left: 2px; top: 0.35rem; width: 10px; height: 10px; border-radius: 50%; background: var(--avg-green); box-sizing: border-box; }
.fb-ti.is-next .fb-rail i { background: var(--bg-card); border: 2px solid var(--avg-green); }
.fb-ti.is-live .fb-rail i { box-shadow: 0 0 0 3px color-mix(in srgb, var(--avg-green) 25%, transparent); }
.fb-ti-body { min-width: 0; padding-bottom: 0.75rem; }
.fb-ti-body b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.fb-ti-body span { display: block; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-ti-end { font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; padding-top: 0.05rem; }
.fb-empty { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 10px; padding: 0.75rem 0.9rem; font-size: 0.85rem; color: var(--text-secondary); }
.fb-foot { margin-top: 0.5rem; font-size: 0.78rem; color: var(--text-secondary); }
@media (max-width: 600px) { .fb-fig { flex-basis: 45%; border-left: none; border-top: 1px solid var(--border-color); } .fb-fig:nth-child(-n+2) { border-top: none; } }
.fb-label { display: none; font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); }
@media (max-width: 900px) {
  .fb-head { display: none; }
  .fb-row { grid-template-columns: 1fr 1fr; gap: 0.6rem 1rem; }
  .fb-ac { grid-column: 1 / -1; }
  .fb-act { grid-column: 1 / -1; justify-content: flex-start; }
  .fb-label { display: block; }
}
`;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free now' },
  { key: 'booked', label: 'Booked' },
  { key: 'flying', label: 'In flight' },
];

export default function IFLiveFleetBoard({ onBook = () => {} }) {
  const { orgId, typeNames, fleetImages } = useIFLive();
  const fleet = useLiveFleet(orgId);
  const board = useFleetBoard(fleet.aircraft, fleet.bids, fleet.schedules);
  const [view, setView] = useState('board');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({});
  useEffect(() => { ifLiveStats.aircraft().then(d => setStats(d.aircraft || {})).catch(() => {}); }, []);
  const typeOf = ac => (ac && typeNames?.[ac.aircraftId]) || '';
  const myOpen = (fleet.bids || []).filter(b => b.isMine && (b.status === 'pending' || (b.status === 'active' && (b.legs || []).some(l => !l.pirepId && !l.expired))));
  const canBook = myOpen.length < MAX_BOOKINGS;
  const myAircraftIds = myOpen.map(b => b.aircraftId);

  const rows = useMemo(() => [...board.values()]
    .filter(r => r.ac.isFleetActiveSlot || r.queue.length)
    .sort((a, b) => {
      const ta = splitType(typeOf(a.ac));
      const tb = splitType(typeOf(b.ac));
      return ta.model.localeCompare(tb.model) || ta.livery.localeCompare(tb.livery) || a.ac.registration.localeCompare(b.ac.registration);
    }), [board, typeNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFlying = r => !!r.flying || r.airborne || !!r.ac.liveStatus;
  const counts = {
    all: rows.length,
    free: rows.filter(r => !r.queue.length && !r.pending && !r.ac.adminBlock).length,
    booked: rows.filter(r => r.queue.length || r.pending).length,
    flying: rows.filter(isFlying).length,
  };
  const names = useAirportNames(rows.flatMap(r => [r.ac.currentIcao, r.freeAt]));
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter(r => filter === 'all' || (filter === 'free' ? !r.queue.length && !r.pending && !r.ac.adminBlock : filter === 'booked' ? r.queue.length || r.pending : isFlying(r)))
    .filter(r => !q || [r.ac.registration, typeOf(r.ac), r.ac.currentIcao, r.freeAt, cityOf(names, r.ac.currentIcao),
      ...r.queue.flatMap(x => [x.pilot, x.leg.flightNumber, x.leg.originIcao, x.leg.destIcao])].filter(Boolean).join(' ').toLowerCase().includes(q));

  return (
    <div className="lv">
      <style>{LIVE_CSS}{BOARD_CSS}</style>
      <div className="lv-bar">
        <div className="lv-seg">
          {[['board', 'Board'], ['timeline', 'Timeline'], ['map', 'Map']].map(([k, l]) => <button key={k} className={view === k ? 'is-on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view !== 'map' && (
          <div className="lv-search">
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Registration, pilot, flight or airport" aria-label="Search the fleet" />
          </div>
        )}
        {view !== 'map' && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem' }} className="lv-muted">
            {fleet.updatedAt && <span>Updated {zTime(fleet.updatedAt)}</span>}
            <button onClick={fleet.reload} disabled={fleet.loading} className="lv-btn" style={{ padding: '0.4rem 0.55rem' }} aria-label="Refresh"><RefreshCw size={15} /></button>
          </span>
        )}
      </div>

      {fleet.error && <div className="lv-note is-bad" style={{ marginBottom: '1rem' }}>{fleet.error}</div>}

      {view === 'map' && <IFLiveMap />}
      {view === 'timeline' && (fleet.aircraft ? <FleetTimeline aircraft={fleet.aircraft} bids={fleet.bids} schedules={fleet.schedules} query={query} /> : <p className="lv-sub">Loading…</p>)}
      {view === 'board' && (
        !fleet.aircraft ? <p className="lv-sub">Loading the fleet…</p> : (
          <>
            <div className="fb-filters" style={{ marginBottom: '0.9rem' }}>
              {FILTERS.map(f => (
                <button key={f.key} className={`fb-filter${filter === f.key ? ' is-on' : ''}`} onClick={() => setFilter(f.key)}>{f.label} <b>{counts[f.key]}</b></button>
              ))}
            </div>
            <div className="fb">
              <div className="fb-head"><span>Aircraft</span><span>Now</span><span>Booked</span><span>Next free</span><span /></div>
              {shown.length === 0 && <div className="lv-empty">{rows.length ? 'Nothing matches.' : 'No aircraft in the Live fleet yet.'}</div>}
              {shown.map(r => <BoardRow key={r.ac.id} row={r} stats={stats[r.ac.id]} names={names} typeOf={typeOf} fleetImages={fleetImages} canBook={canBook && !myAircraftIds.includes(r.ac.id)} onBook={onBook} />)}
            </div>
            <p className="lv-sub" style={{ marginTop: '0.75rem' }}>
              All times Zulu. New bookings go after the last one on an aircraft, from where that one finishes.
              {canBook
                ? myOpen.length > 0 && ` You can book ${MAX_BOOKINGS - myOpen.length} more aircraft. To fly more on one you already have, add a sector from the Fly page.`
                : ` You have ${MAX_BOOKINGS} aircraft booked, the most at once. Add sectors to them from the Fly page, or fly or cancel one to book another.`}
            </p>
          </>
        )
      )}
    </div>
  );
}

function BoardRow({ row, stats, names, typeOf, fleetImages, canBook, onBook }) {
  const { ac, queue, pending, freeFrom, freeAt, flying } = row;
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(null);
  const img = fleetImages?.[ac.aircraftId];
  const { model, livery } = splitType(typeOf(ac));
  const first = queue[0];
  const blocked = ac.adminBlock;
  const bookable = canBook && ac.isFleetActiveSlot && !pending && !blocked;
  const cardNames = useAirportNames(open ? [
    ...queue.flatMap(x => [x.leg.originIcao, x.leg.destIcao]),
    ...(log?.flights || []).flatMap(f => [f.originIcao, f.destinationIcao]),
  ] : []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !log) {
      setLog({ loading: true });
      ifLive.aircraftFlights(ac.id)
        .then(d => setLog({ flights: (d.flights || []).slice(0, 6), total: d.totalCount }))
        .catch(err => setLog({ error: err.message || "Couldn't load the flight log" }));
    }
  };

  let now;
  if (flying) now = <><div className="fb-strong lv-ok">In flight</div><div className="lv-sub lv-mono">{flying.leg.flightNumber} {flying.leg.originIcao} to {flying.leg.destIcao}</div></>;
  else if (row.airborne || ac.liveStatus) now = <><div className="fb-strong lv-ok">In flight</div><div className="lv-sub">Not on a booking</div></>;
  else now = <><div className="fb-strong">{ac.currentIcao ? cityOf(names, ac.currentIcao) || ac.currentIcao : 'Unknown'}</div><div className="lv-sub lv-mono">{ac.currentIcao ? `At ${ac.currentIcao}` : 'Location unknown'}</div></>;

  let booked;
  if (pending) booked = <><div className="fb-strong lv-warn">Waiting on staff</div><div className="lv-sub">Booking needs approving</div></>;
  else if (first) booked = (
    <>
      <div className="fb-strong">{first.isMine ? 'You' : first.pilot}{queue.length > 1 ? <span className="lv-muted" style={{ fontWeight: 500 }}> +{queue.length - 1} after</span> : null}</div>
      <div className="lv-sub"><span className="lv-mono">{first.leg.flightNumber}</span> {first.leg.originIcao} to {first.leg.destIcao}, {first.leg.departureUtc ? zWhen(new Date(first.leg.departureUtc).getTime()) : 'any time'}</div>
    </>
  );
  else booked = <span className="lv-muted">Nobody</span>;

  let free;
  if (blocked) free = <><div className="fb-strong lv-bad">Unavailable</div><div className="lv-sub">{blocked.reason || 'Not available to book'}</div></>;
  else if (pending) free = <span className="lv-muted">Not yet</span>;
  else if (!freeFrom) free = <><div className="fb-strong lv-ok">Free now</div><div className="lv-sub">{ac.currentIcao ? `From ${ac.currentIcao}` : ''}</div></>;
  else free = <><div className="fb-strong lv-warn">{zWhen(freeFrom)}</div><div className="lv-sub">At {placeText(names, freeAt)}</div></>;

  return (
    <div className="fb-item">
      <div className="fb-row" onClick={toggle} role="button" tabIndex={0} aria-expanded={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
        <div className="fb-ac">
          <span className="lv-thumb" style={img ? { backgroundImage: `url(${img})` } : undefined}>{!img && <Plane size={16} />}</span>
          <div style={{ minWidth: 0 }}>
            <div className="lv-reg" style={{ fontSize: '1rem' }}>{ac.registration}</div>
            <div className="lv-sub" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={typeOf(ac)}>
              {model}{livery && <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}> {livery}</span>}
              {!ac.isFleetActiveSlot && <span className="lv-warn" style={{ fontWeight: 700 }}> Not in service</span>}
            </div>
            <div className="lv-sub lv-muted" style={{ fontSize: '0.75rem' }}>
              {stats ? `${stats.hours.toLocaleString()}h | ${stats.legs} ${stats.legs === 1 ? 'flight' : 'flights'}` : 'No flights yet'}
            </div>
          </div>
        </div>
        <div className="fb-cell"><span className="fb-label">Now</span>{now}</div>
        <div className="fb-cell"><span className="fb-label">Booked</span>{booked}</div>
        <div className="fb-cell"><span className="fb-label">Next free</span>{free}</div>
        <div className="fb-act">
          {bookable && <button className="lv-btn" onClick={e => { e.stopPropagation(); onBook(ac.id); }}>Book</button>}
          <ChevronDown size={16} className="lv-muted" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </div>
      </div>

      {open && (
        <div className="fb-more">
          {/* Crew centre totals: one strip, read left to right */}
          {stats ? (
            <div className="fb-strip">
              <div className="fb-fig"><b>{stats.hours.toLocaleString()}h</b><span>flown with {brand.abbreviation}</span></div>
              <div className="fb-fig"><b>{stats.legs}</b><span>{stats.legs === 1 ? 'flight' : 'flights'}</span></div>
              <div className="fb-fig"><b>{stats.pilots}</b><span>{stats.pilots === 1 ? 'pilot' : 'pilots'}</span></div>
              <div className="fb-fig"><b>{stats.avgFpm != null ? `${stats.avgFpm} fpm` : '—'}</b><span>avg touchdown</span></div>
              <div className="fb-fig"><b className="lv-mono">{stats.topRoute ? stats.topRoute.route : '—'}</b><span>{stats.topRoute ? `top route, ${stats.topRoute.count} times` : 'top route'}</span></div>
              <div className="fb-fig"><b>{stats.lastFlown ? new Date(stats.lastFlown).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'}</b><span>last flown</span></div>
            </div>
          ) : <p className="lv-sub" style={{ margin: '0.9rem 0 1.1rem' }}>No Live flights filed on this aircraft yet.</p>}

          <div className="fb-section">
            <h4>Booked</h4>
            {queue.length === 0 ? (
              <div className="fb-empty">
                <span>{blocked
                  ? `Not available to book${blocked.reason ? `: ${blocked.reason}` : ''}.`
                  : `Nothing booked${!pending && ac.isFleetActiveSlot ? `, free to fly from ${ac.currentIcao || 'where it is'}` : ''}.`}</span>
                {bookable && <button className="lv-btn" onClick={() => onBook(ac.id)}>Book</button>}
              </div>
            ) : (
              <div className="fb-tl">
                {queue.map(x => (
                  <TimelineItem key={`${x.bid.id}-${x.legIndex}`} next={!x.flying && !x.started} live={x.flying}
                    when={x.leg.departureUtc ? new Date(x.leg.departureUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Anytime'}
                    from={x.leg.originIcao} to={x.leg.destIcao} names={cardNames}
                    who={[x.leg.flightNumber, x.isMine ? 'you' : x.pilot].filter(Boolean).join(' | ')}
                    end={x.flying ? <span className="lv-ok">In flight</span> : x.started ? <span className="lv-ok">Started</span>
                      : x.leg.departureUtc ? zTime(new Date(x.leg.departureUtc)) : `by ${zWhen(x.startBy)}`} />
                ))}
              </div>
            )}
          </div>

          <div className="fb-section">
            <h4>Recent flights in Infinite Flight</h4>
            {!log || log.loading ? <p className="lv-sub">Loading…</p>
              : log.error ? <p className="lv-sub">{log.error}</p>
              : log.flights.length === 0 ? <div className="fb-empty"><span>Hasn't flown yet.</span></div>
              : (
                <>
                  <div className="fb-tl">
                    {log.flights.map(f => (
                      <TimelineItem key={f.id} live={f.status === 0}
                        when={f.departedUtc ? new Date(f.departedUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''}
                        from={f.originIcao} to={f.destinationIcao} names={cardNames}
                        who={f.pilots.map(p => p.username).filter(Boolean).join(', ') || 'Unknown pilot'}
                        end={f.status === 0 ? <span className="lv-ok">In flight</span> : f.status === 2 ? <span className="lv-muted">Cancelled</span> : fmtMins(f.flightTimeMinutes)} />
                    ))}
                  </div>
                  <p className="fb-foot">IF Totals: {log.flights[0].airframeHours.toLocaleString()} hours | {log.total} flights</p>
                </>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ when, from, to, names, who, end, next, live }) {
  const cities = [cityOf(names, from), cityOf(names, to)];
  return (
    <div className={`fb-ti${next ? ' is-next' : ''}${live ? ' is-live' : ''}`}>
      <span className="fb-ti-when">{when}</span>
      <span className="fb-rail"><i /></span>
      <span className="fb-ti-body">
        <b>{from || '????'} → {to || '????'}</b>
        <span>{[cities[0] && cities[1] ? `${cities[0]} to ${cities[1]}` : null, who].filter(Boolean).join(' | ')}</span>
      </span>
      <span className="fb-ti-end">{end}</span>
    </div>
  );
}
