/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ifLiveAdmin } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import { t, zulu, ago, routeOf } from './adminShared';

function useLoad(fn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch (err) {
      setError(err.message || "Couldn't load this");
    }
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  return { data, error, load };
}

const HOURS = [1, 2, 4, 6, 12, 24];

// Abandoned
export function AbandonedView({ busy, run, ask, openBooking }) {
  const fetchIt = useCallback(() => ifLiveAdmin.abandoned(), []);
  const { data, error, load } = useLoad(fetchIt);
  const pilotsFetch = useCallback(() => ifLiveAdmin.pilots(), []);
  const [pilots, setPilots] = useState(null);
  const loadPilots = async () => { if (!pilots) setPilots((await pilotsFetch()).pilots); };

  if (error) return <div className="lv-panel"><p className="lv-sub lv-bad">{error}</p></div>;
  if (!data) return <p className="lv-sub">Loading</p>;
  const list = data.abandoned;
  const current = list.filter(a => !a.where.movedOn);
  const older = list.filter(a => a.where.movedOn);

  return (
    <>
      <div className="lv-panel">
        <div className="la-head">
          <h3 className="lv-h">Abandoned flights</h3>
          <span className="lv-sub">Last 14 days</span>
        </div>
        <p className="lv-sub" style={{ marginBottom: '0.5rem' }}>
          Flights that started, but whose booking window expired with no PIREP, so the aircraft was freed for anyone to book.
          The aircraft stays where it was left in Infinite Flight. Give the flight back to the pilot, book someone else to finish it, or close it.
        </p>
        {current.length === 0 && <div className="la-empty">No abandoned flights to sort out.</div>}
        {current.map(a => (
          <AbandonedRow key={`${a.bidId}-${a.legIndex}`} a={a} busy={busy} run={run} ask={ask} after={load}
            pilots={pilots} loadPilots={loadPilots} openBooking={openBooking} />
        ))}
      </div>
      {older.length > 0 && (
        <div className="lv-panel">
          <div className="la-head">
            <h3 className="lv-h">Aircraft has flown since</h3>
            <span className="lv-sub">{older.length}</span>
          </div>
          <p className="lv-sub" style={{ marginBottom: '0.5rem' }}>These can't be finished any more. Close them to clear the list. They still count against the pilot.</p>
          {older.map(a => (
            <div className="la-row" key={`${a.bidId}-${a.legIndex}`}>
              <div>
                <div className="la-title"><span className="lv-reg">{a.registration}</span> {routeOf(a.leg)} | {a.pilot?.name || 'Unknown'}</div>
                <div className="la-detail">Started {zulu(a.leg.startedAt)}</div>
              </div>
              <div className="la-actions">
                <button className="la-btn" disabled={busy === `ab:${a.bidId}:${a.legIndex}:close`}
                  onClick={() => run(`ab:${a.bidId}:${a.legIndex}:close`, () => ifLiveAdmin.abandon(a.bidId, a.legIndex, false), 'Closed', load)}>Close</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AbandonedRow({ a, busy, run, ask, after, pilots, loadPilots, openBooking }) {
  const [mode, setMode] = useState(null); // 'give' | 'reassign' | 'close'
  const [hours, setHours] = useState(4);
  const [pilotId, setPilotId] = useState('');
  const [notify, setNotify] = useState(true);
  const k = x => `ab:${a.bidId}:${a.legIndex}:${x}`;
  const w = a.where;

  return (
    <div className="la-row">
      <div>
        <div className="la-title">
          <span className="lv-reg">{a.registration}</span> {routeOf(a.leg)} | {a.pilot?.name || 'Unknown'}
        </div>
        <div className="la-detail">
          Started {zulu(a.leg.startedAt)} | window expired {zulu(a.leg.deadlineUtc)}
        </div>
        <div className="la-detail">
          {w.text}{w.lastSeen ? ` | last seen ${ago(w.lastSeen)}` : ''}{w.nmFromOrigin != null && !w.onGround ? ` | ${w.nmFromOrigin} nm from ${a.leg.originIcao}` : ''}
        </div>
      </div>
      <div className="la-actions">
        <button className={`la-btn ${mode === 'give' ? 'is-main' : ''}`} onClick={() => setMode(mode === 'give' ? null : 'give')}>Give back</button>
        <button className={`la-btn ${mode === 'reassign' ? 'is-main' : ''}`} onClick={() => { setMode(mode === 'reassign' ? null : 'reassign'); loadPilots(); }}>Book another pilot</button>
        <button className={`la-btn is-bad ${mode === 'close' ? 'is-main' : ''}`} onClick={() => setMode(mode === 'close' ? null : 'close')}>Close</button>
        <button className="la-btn" onClick={() => openBooking(a.bidId)}>Booking</button>
      </div>

      {mode && (
        <div className="la-manage">
          {mode === 'give' && (
            <div className="la-form">
              <span className="lv-sub" style={{ flexBasis: '100%' }}>
                {a.pilot?.name} gets the flight back with a fresh window from now. They start it again as normal and it's picked up when they're back on the server.
              </span>
              <label>Window
                <select value={hours} onChange={e => setHours(Number(e.target.value))}>
                  {HOURS.map(h => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <button className="la-btn is-main" disabled={busy === k('give')}
                onClick={() => run(k('give'), () => ifLiveAdmin.giveBack(a.bidId, a.legIndex, hours), `Given back to ${a.pilot?.name} for ${hours}h`, after)}>Give back</button>
            </div>
          )}
          {mode === 'reassign' && (
            <div className="la-form">
              <span className="lv-sub" style={{ flexBasis: '100%' }}>
                Books another pilot on {a.registration} for {routeOf(a.leg)}, posts the usual booking notice, and closes this one as abandoned.
              </span>
              <label>Pilot
                <select value={pilotId} onChange={e => setPilotId(e.target.value)}>
                  <option value="">{pilots ? 'Choose a pilot' : 'Loading'}</option>
                  {(pilots || []).filter(p => p.id !== a.pilot?.id && (p.liveAccess || p.role !== 'pilot')).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.current ? ` (has ${p.current.registration})` : ''}{p.ifLinked ? '' : ' (no IF account)'}</option>
                  ))}
                </select>
              </label>
              <label>Window
                <select value={hours} onChange={e => setHours(Number(e.target.value))}>
                  {HOURS.map(h => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <button className="la-btn is-main" disabled={!pilotId || busy === k('reassign')}
                onClick={() => run(k('reassign'), () => ifLiveAdmin.reassign(a.bidId, a.legIndex, pilotId, hours), 'Booked. The other pilot has been notified.', after)}>Book them</button>
            </div>
          )}
          {mode === 'close' && (
            <div className="la-form">
              <span className="lv-sub" style={{ flexBasis: '100%' }}>
                Closes the flight with no PIREP and clears it from this list. It counts as abandoned on {a.pilot?.name}'s record.
              </span>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Tell the pilot in the ops channel
              </label>
              <button className="la-btn is-main" disabled={busy === k('close')}
                onClick={() => ask('Close as abandoned?', `${routeOf(a.leg)} on ${a.registration} is closed with no PIREP.`, 'Close',
                  () => run(k('close'), () => ifLiveAdmin.abandon(a.bidId, a.legIndex, notify), 'Closed as abandoned', after))}>Close as abandoned</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Pilots
export function PilotsView({ busy, run, ask, openBooking }) {
  const fetchIt = useCallback(() => ifLiveAdmin.pilots(), []);
  const { data, error, load } = useLoad(fetchIt);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [sort, setSort] = useState('flights');

  const pilots = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.pilots || []).filter(p => !q || p.name.toLowerCase().includes(q));
    const by = {
      flights: (a, b) => b.flights - a.flights,
      reliability: (a, b) => (b.noShows + b.abandoned) - (a.noShows + a.abandoned) || b.flights - a.flights,
      recent: (a, b) => (t(b.lastFlownAt) || 0) - (t(a.lastFlownAt) || 0),
    }[sort];
    return [...list].sort(by);
  }, [data, query, sort]);

  if (error) return <div className="lv-panel"><p className="lv-sub lv-bad">{error}</p></div>;
  if (!data) return <p className="lv-sub">Loading</p>;

  return (
    <>
      <div className="lv-bar">
        <div className="lv-seg">
          {[['flights', 'Most flights'], ['reliability', 'Most missed'], ['recent', 'Recently flown']].map(([id, label]) => (
            <button key={id} className={sort === id ? 'is-on' : ''} onClick={() => setSort(id)}>{label}</button>
          ))}
        </div>
        <div className="lv-search">
          <Search size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pilot name or callsign" />
        </div>
      </div>
      <div className="lv-panel">
        {pilots.length === 0 && <div className="la-empty">No pilots match.</div>}
        {pilots.map(p => {
          const staff = p.role === 'admin' || p.role === 'staff';
          const missed = p.noShows + p.abandoned;
          return (
            <div className="la-row" key={p.id}>
              <div>
                <div className="la-title">
                  {p.name}
                  {staff && <span className="la-tag" style={{ marginLeft: '0.4rem' }}>Staff</span>}
                  {!p.liveAccess && !staff && <span className="la-tag bad" style={{ marginLeft: '0.4rem' }}>Live off</span>}
                  {!p.ifLinked && <span className="la-tag warn" style={{ marginLeft: '0.4rem' }}>No IF account</span>}
                </div>
                <div className="la-detail">
                  {p.flights} flights | {p.hours}h | {p.noShows} no-show{p.noShows === 1 ? '' : 's'} | {p.abandoned} abandoned | {p.cancelled} cancelled
                  {p.lastFlownAt ? ` | last flew ${ago(p.lastFlownAt)}` : ' | not flown yet'}
                  {p.current ? ` | has ${p.current.registration}` : ''}
                </div>
                {missed >= 3 && <div className="la-detail lv-warn">Missed {missed} of {p.flights + missed} started or booked flights</div>}
              </div>
              <div className="la-actions">
                {p.current && <button className="la-btn" onClick={() => openBooking(p.current.bidId)}>Booking</button>}
                {!staff && (
                  <button className={`la-btn ${p.liveAccess ? 'is-bad' : ''}`} disabled={busy === `p:${p.id}`}
                    onClick={() => (p.liveAccess
                      ? ask(`Turn Live off for ${p.name}?`, 'They can\'t make new Live bookings until it\'s turned back on. Bookings they already have stay.', 'Turn off',
                        () => run(`p:${p.id}`, () => ifLiveAdmin.setAccess(p.id, false), 'Live booking turned off', load))
                      : run(`p:${p.id}`, () => ifLiveAdmin.setAccess(p.id, true), 'Live booking turned on', load))}>
                    {p.liveAccess ? 'Turn Live off' : 'Turn Live on'}
                  </button>
                )}
                <button className="la-btn" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Close' : 'History'}</button>
              </div>
              {open === p.id && <PilotHistory pilotId={p.id} openBooking={openBooking} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

const OUTCOME = { flown: 'Flown', open: 'Open', no_show: 'No-show', cancelled: 'Cancelled', abandoned: 'Abandoned', expired: 'Expired' };
const OUTCOME_TONE = { flown: 'ok', open: 'warn', no_show: 'bad', abandoned: 'bad' };

function PilotHistory({ pilotId, openBooking }) {
  const fetchIt = useCallback(() => ifLiveAdmin.pilot(pilotId), [pilotId]);
  const { data, error } = useLoad(fetchIt);
  return (
    <div className="la-manage">
      {error && <p className="lv-sub lv-bad">{error}</p>}
      {!data && !error && <p className="lv-sub">Loading</p>}
      {data && data.legs.length === 0 && <p className="lv-sub">No Live flights yet.</p>}
      {data && data.legs.map(l => (
        <div key={`${l.bidId}-${l.legIndex}`} className="la-leg-top" style={{ padding: '0.35rem 0', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '0.85rem' }}>
            <span className="lv-muted">{zulu(l.at)}</span> <span className="lv-reg">{l.registration}</span> {l.route}{l.hours != null ? `, ${l.hours.toFixed(1)}h` : ''}
          </span>
          <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span className={`la-tag ${OUTCOME_TONE[l.outcome] || ''}`}>{OUTCOME[l.outcome] || l.outcome}</span>
            {l.outcome === 'open' && <button className="la-btn" onClick={() => openBooking(l.bidId)}>Booking</button>}
          </span>
        </div>
      ))}
    </div>
  );
}

// Aircraft
const AC_STATE = { blocked: ['Blocked', 'bad'], flying: ['Flying', 'ok'], booked: ['Booked', 'warn'], free: ['Free', ''] };

export function AircraftView({ busy, run, openBooking, onBook }) {
  const fetchIt = useCallback(() => ifLiveAdmin.aircraft(), []);
  const { data, error, load } = useLoad(fetchIt);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.aircraft || [])
      .filter(a => filter === 'all' || a.state === filter)
      .filter(a => !q || [a.registration, a.type, a.location].some(v => String(v || '').toLowerCase().includes(q)));
  }, [data, query, filter]);

  if (error) return <div className="lv-panel"><p className="lv-sub lv-bad">{error}</p></div>;
  if (!data) return <p className="lv-sub">Loading</p>;

  return (
    <>
      <div className="lv-bar">
        <div className="lv-seg">
          {[['all', 'All'], ['free', 'Free'], ['booked', 'Booked'], ['flying', 'Flying'], ['blocked', 'Blocked']].map(([id, label]) => (
            <button key={id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="lv-search">
          <Search size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Registration, type or airport" />
        </div>
      </div>
      <div className="lv-panel">
        {list.length === 0 && <div className="la-empty">No aircraft match.</div>}
        {list.map(a => {
          const [label, tone] = AC_STATE[a.state] || [a.state, ''];
          return (
            <div className="la-row" key={a.id}>
              <div>
                <div className="la-title"><span className="lv-reg">{a.registration}</span> {a.type || ''}</div>
                <div className="la-detail">
                  At {a.location || 'unknown'}{a.locationIcao ? ' (set by hand)' : ''} | {a.flights} flights | {a.hours}h
                  {a.last ? ` | last ${a.last.route} by ${a.last.pilot}, ${ago(a.last.at)}` : ''}
                </div>
                {a.bookings.map(b => (
                  <div className="la-detail" key={b.bidId}>
                    {b.status === 'pending' ? 'Pending' : b.started ? 'Flying' : 'Booked'}: {b.route} | {b.pilot}{' '}
                    <button className="lv-link" style={{ fontSize: '0.8rem' }} onClick={() => openBooking(b.bidId)}>Open</button>
                  </div>
                ))}
                {a.blocked && <div className="la-detail lv-bad">Blocked{a.blockReason ? `: ${a.blockReason}` : ''}{a.blockedBy ? ` | by ${a.blockedBy} ${ago(a.blockedAt)}` : ''}</div>}
              </div>
              <div className="la-actions" style={{ alignItems: 'center' }}>
                <span className={`la-tag ${tone}`}>{label}</span>
                <button className="la-btn" onClick={() => onBook(a.id)}>Book</button>
                <button className="la-btn" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Close' : 'Manage'}</button>
              </div>
              {open === a.id && <AircraftManage a={a} busy={busy} run={run} after={load} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AircraftManage({ a, busy, run, after }) {
  const [reason, setReason] = useState(a.blockReason || '');
  const [icao, setIcao] = useState(a.locationIcao || '');
  const k = x => `ac:${a.id}:${x}`;
  return (
    <div className="la-manage">
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Booking</div>
      <div className="la-form" style={{ marginTop: '0.2rem' }}>
        {a.blocked ? (
          <button className="la-btn is-main" disabled={busy === k('block')}
            onClick={() => run(k('block'), () => ifLiveAdmin.updateAircraft(a.id, { blocked: false, registration: a.registration }), `${a.registration} can be booked again`, after)}>Unblock</button>
        ) : (
          <>
            <label>Reason pilots see
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Maintenance until Friday" maxLength={200} style={{ minWidth: 240 }} />
            </label>
            <button className="la-btn is-bad" disabled={busy === k('block')}
              onClick={() => run(k('block'), () => ifLiveAdmin.updateAircraft(a.id, { blocked: true, reason, registration: a.registration }), `${a.registration} blocked from booking`, after)}>Block booking</button>
          </>
        )}
      </div>
      <p className="lv-sub" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>Bookings it already has stay. Admins can still book it for a pilot.</p>

      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '0.8rem' }}>Location</div>
      <div className="la-form" style={{ marginTop: '0.2rem' }}>
        <label>Airport (ICAO)
          <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} placeholder="YSSY" maxLength={4} style={{ width: 90 }} />
        </label>
        <button className="la-btn is-main" disabled={!icao || busy === k('loc')}
          onClick={() => run(k('loc'), () => ifLiveAdmin.updateAircraft(a.id, { locationIcao: icao, registration: a.registration }), `${a.registration} set to ${icao}`, after)}>Set location</button>
        {a.locationIcao && (
          <button className="la-btn" disabled={busy === k('locclear')}
            onClick={() => run(k('locclear'), () => ifLiveAdmin.updateAircraft(a.id, { locationIcao: null, registration: a.registration }), 'Location cleared', after)}>Clear</button>
        )}
      </div>
      <p className="lv-sub" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
        Pilots have to depart from here. It lasts until the next flight on this aircraft is filed, and a parked position from Infinite Flight still wins.
        {a.locationBy ? ` Set by ${a.locationBy} ${ago(a.locationAt)}.` : ''}
      </p>
    </div>
  );
}

// Activity
const KIND = { booked: 'Booked', started: 'Started', landed: 'Landed', filed: 'Filed', no_show: 'No-show', abandoned: 'Abandoned', cancelled: 'Cancelled', admin: 'Admin' };
const KIND_TONE = { filed: 'ok', landed: 'ok', started: 'ok', no_show: 'bad', abandoned: 'bad', admin: 'warn' };

export function ActivityView({ openBooking }) {
  const [hours, setHours] = useState(24);
  const [kind, setKind] = useState('all');
  const fetchIt = useCallback(() => ifLiveAdmin.activity(hours), [hours]);
  const { data, error } = useLoad(fetchIt);
  const events = (data?.events || []).filter(e => kind === 'all' || e.kind === kind || (kind === 'problems' && ['no_show', 'abandoned', 'cancelled'].includes(e.kind)));

  return (
    <>
      <div className="lv-bar">
        <div className="lv-seg">
          {[[24, 'Last 24 hours'], [72, '3 days'], [168, '7 days']].map(([h, label]) => (
            <button key={h} className={hours === h ? 'is-on' : ''} onClick={() => setHours(h)}>{label}</button>
          ))}
        </div>
        <div className="lv-seg">
          {[['all', 'Everything'], ['problems', 'Problems'], ['admin', 'Admin changes']].map(([id, label]) => (
            <button key={id} className={kind === id ? 'is-on' : ''} onClick={() => setKind(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="lv-panel">
        {error && <p className="lv-sub lv-bad">{error}</p>}
        {!data && !error && <p className="lv-sub">Loading</p>}
        {data && events.length === 0 && <div className="la-empty">Nothing in this period.</div>}
        {events.map((e, n) => (
          <div className="la-row" key={`${e.at}-${n}`} style={{ padding: '0.5rem 0' }}>
            <div style={{ fontSize: '0.85rem' }}>
              <span className="lv-muted" style={{ display: 'inline-block', minWidth: '7.5rem' }}>{zulu(e.at)}</span>
              {e.registration && <span className="lv-reg">{e.registration} </span>}
              {e.pilot && <b>{e.pilot} </b>}
              {e.text}
            </div>
            <div className="la-actions" style={{ alignItems: 'center' }}>
              <span className={`la-tag ${KIND_TONE[e.kind] || ''}`}>{KIND[e.kind] || e.kind}</span>
              {e.bidId && e.kind !== 'admin' && <button className="la-btn" onClick={() => openBooking(e.bidId)}>Booking</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Book for a pilot
export function NewBooking({ busy, run, onDone, presetAircraftId }) {
  const [pilots, setPilots] = useState(null);
  const [aircraft, setAircraft] = useState(null);
  const [pilotId, setPilotId] = useState('');
  const [aircraftId, setAircraftId] = useState(presetAircraftId || '');
  const [legs, setLegs] = useState([{ flightNumber: '', originIcao: '', destIcao: '' }]);

  useEffect(() => {
    ifLiveAdmin.pilots().then(r => setPilots(r.pilots)).catch(err => showToast(err.message, 'error'));
    ifLiveAdmin.aircraft().then(r => setAircraft(r.aircraft)).catch(err => showToast(err.message, 'error'));
  }, []);
  useEffect(() => { if (presetAircraftId) setAircraftId(presetAircraftId); }, [presetAircraftId]);

  const ac = (aircraft || []).find(a => a.id === aircraftId);
  // Start where the aircraft is, and each leg where the last one lands
  useEffect(() => {
    if (ac?.location && !legs[0].originIcao) setLegs(ls => [{ ...ls[0], originIcao: ac.location }, ...ls.slice(1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraftId, ac?.location]);

  const setLeg = (n, field, value) => setLegs(ls => ls.map((l, i) => {
    if (i === n) return { ...l, [field]: value.toUpperCase() };
    if (field === 'destIcao' && i === n + 1) return { ...l, originIcao: value.toUpperCase() };
    return l;
  }));
  const addLeg = () => setLegs(ls => [...ls, { flightNumber: '', originIcao: ls[ls.length - 1].destIcao, destIcao: '' }]);
  const complete = pilotId && aircraftId && legs.every(l => l.flightNumber && l.originIcao.length === 4 && l.destIcao.length === 4);

  return (
    <div className="lv-panel">
      <div className="la-head">
        <h3 className="lv-h">Book for a pilot</h3>
        <button className="la-btn" onClick={() => onDone(false)}>Cancel</button>
      </div>
      <p className="lv-sub" style={{ marginBottom: '0.6rem' }}>
        Flown whenever they're ready, after any booking already on the aircraft. Creates the Infinite Flight schedule and posts the usual booking notice.
      </p>
      <div className="la-form">
        <label>Pilot
          <select value={pilotId} onChange={e => setPilotId(e.target.value)}>
            <option value="">{pilots ? 'Choose a pilot' : 'Loading'}</option>
            {(pilots || []).map(p => <option key={p.id} value={p.id}>{p.name}{p.current ? ` (has ${p.current.registration})` : ''}{p.ifLinked ? '' : ' (no IF account)'}</option>)}
          </select>
        </label>
        <label>Aircraft
          <select value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
            <option value="">{aircraft ? 'Choose an aircraft' : 'Loading'}</option>
            {(aircraft || []).map(a => <option key={a.id} value={a.id}>{a.registration} {a.type || ''} at {a.location || '?'}{a.state !== 'free' ? ` (${a.state})` : ''}</option>)}
          </select>
        </label>
      </div>
      {legs.map((l, n) => (
        <div className="la-form" key={n}>
          <label>Leg {n + 1} flight<input value={l.flightNumber} onChange={e => setLeg(n, 'flightNumber', e.target.value)} placeholder="QF2017" style={{ width: 100 }} /></label>
          <label>From<input value={l.originIcao} onChange={e => setLeg(n, 'originIcao', e.target.value)} placeholder="YSSY" maxLength={4} style={{ width: 80 }} disabled={n > 0} /></label>
          <label>To<input value={l.destIcao} onChange={e => setLeg(n, 'destIcao', e.target.value)} placeholder="YBHI" maxLength={4} style={{ width: 80 }} /></label>
          {legs.length > 1 && n === legs.length - 1 && <button className="la-btn" onClick={() => setLegs(ls => ls.slice(0, -1))}>Remove</button>}
        </div>
      ))}
      <div className="la-form">
        {legs.length < 6 && <button className="la-btn" onClick={addLeg}>Add a leg</button>}
        <button className="la-btn is-main" disabled={!complete || busy === 'newbooking'}
          onClick={async () => {
            const ok = await run('newbooking', () => ifLiveAdmin.book({ pilotId, aircraftId, legs }), 'Booked');
            if (ok) onDone(ok.bookingId);
          }}>Book</button>
      </div>
    </div>
  );
}
