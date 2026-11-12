/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { ifLiveAdmin } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import { useIFLive } from './IFLiveContext';
import { LIVE_CSS } from './liveData';
import { t, zulu, ago, toInput, fromInput, routeOf, legState } from './adminShared';
import IFLiveSchedule from './IFLiveSchedule';
import IFLiveFleet from './IFLiveFleet';
import { AbandonedView, PilotsView, AircraftView, ActivityView, NewBooking } from './IFLiveAdminViews';

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'abandoned', label: 'Abandoned' },
  { id: 'pilots', label: 'Pilots' },
  { id: 'aircraft', label: 'Aircraft' },
  { id: 'activity', label: 'Activity' },
  { id: 'schedules', label: 'IF schedules' },
  { id: 'settings', label: 'Settings' },
];

const ADMIN_CSS = `
.la-tabs { max-width: 100%; overflow-x: auto; flex-wrap: nowrap; }
.la-tabs button { white-space: nowrap; }
.bk-head, .bk-row { display: grid; grid-template-columns: 7rem 10rem minmax(0, 1fr) auto; gap: 1rem; align-items: start; }
.bk-head { padding: 0 0 0.5rem; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
.bk-act-sp { width: 4.6rem; }
.bk-legs { display: grid; gap: 0.55rem; }
.bk-leg, .bk-headlegs { display: grid; grid-template-columns: minmax(0, 1.4fr) 6.5rem 6.5rem 7.5rem; gap: 1rem; align-items: start; }
.bk-leg b, .bk-pilot { font-size: 0.9rem; font-weight: 600; }
.bk-leg small, .bk-ac small { display: block; font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.1rem; }
.bk-leg.is-done { opacity: 0.55; }
.bk-item { padding: 0.85rem 0; border-top: 1px solid var(--border-color); }
.bk-item:first-of-type { border-top: none; }
.bk-ac .lv-reg { font-size: 0.95rem; }
.bk-act { display: flex; justify-content: flex-end; }
.bk-note { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.45rem; }
.bk-lbl { display: none; }
@media (max-width: 860px) {
  .bk-head { display: none; }
  .bk-row { grid-template-columns: minmax(0, 1fr) auto; }
  .bk-ac { grid-column: 1; }
  .bk-pilot { grid-column: 1; grid-row: 2; font-weight: 500; color: var(--text-secondary); }
  .bk-legs { grid-column: 1 / -1; grid-row: 3; }
  .bk-act { grid-column: 2; grid-row: 1; }
  .bk-leg { grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem; padding: 0.5rem 0.65rem; background: var(--bg-hover); border-radius: 8px; }
  .bk-lbl { display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); }
}
.la-strip { display: flex; flex-wrap: wrap; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 1.25rem; }
.la-fig { flex: 1 1 150px; padding: 0.85rem 1.1rem; border-left: 1px solid var(--border-color); min-width: 0; }
.la-fig:first-child { border-left: none; }
.la-fig span { display: block; font-size: 0.78rem; color: var(--text-secondary); }
.la-fig b { display: block; font-size: 1.15rem; line-height: 1.35; font-variant-numeric: tabular-nums; }
.la-fig small { display: block; font-size: 0.76rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.la-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.5rem; }
.la-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem 1rem; align-items: center; padding: 0.75rem 0; border-top: 1px solid var(--border-color); }
.la-row:first-of-type { border-top: none; }
.la-title { font-size: 0.9rem; font-weight: 600; }
.la-detail { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.45; margin-top: 0.15rem; }
.la-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; }
.la-btn { padding: 0.35rem 0.75rem; border-radius: 8px; border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.la-btn:hover { border-color: var(--avg-green); color: var(--avg-green); }
.la-btn.is-main { background: var(--avg-green); border-color: var(--avg-green); color: #fff; }
.la-btn.is-bad:hover { border-color: var(--lv-bad); color: var(--lv-bad); }
.la-btn:disabled { opacity: 0.55; cursor: wait; }
.la-tag { font-size: 0.74rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 999px; white-space: nowrap; background: var(--bg-hover); color: var(--text-secondary); }
.la-tag.ok { background: rgba(var(--brand-primary-rgb),0.12); color: var(--lv-ok); }
.la-tag.warn { background: rgba(var(--brand-accent-rgb),0.18); color: var(--lv-warn); }
.la-tag.bad { background: rgba(179,38,30,0.1); color: var(--lv-bad); }
.la-manage { grid-column: 1 / -1; background: var(--bg-hover); border-radius: 10px; padding: 0.9rem 1rem; margin-top: 0.25rem; }
.la-leg { padding: 0.7rem 0; border-top: 1px solid var(--border-color); }
.la-leg:first-child { border-top: none; padding-top: 0; }
.la-leg-top { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.la-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.3rem 1rem; font-size: 0.8rem; margin: 0.45rem 0 0.55rem; }
.la-facts span { color: var(--text-secondary); }
.la-form { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; margin-top: 0.5rem; }
.la-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; color: var(--text-secondary); }
.la-form input, .la-form select { padding: 0.4rem 0.55rem; border: 1.5px solid var(--border-color); border-radius: 8px; font: inherit; font-size: 0.85rem; background: var(--bg-card); color: var(--text-primary); }
.la-history { font-size: 0.8rem; margin-top: 0.6rem; }
.la-history div { padding: 0.25rem 0; color: var(--text-secondary); }
.la-jobs { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.5rem 1.25rem; font-size: 0.85rem; }
.la-empty { font-size: 0.875rem; color: var(--text-secondary); padding: 0.4rem 0; }
@media (max-width: 640px) { .la-row { grid-template-columns: 1fr; } .la-actions { justify-content: flex-start; } .la-fig { flex-basis: 45%; border-left: none; border-top: 1px solid var(--border-color); } .la-fig:nth-child(-n+2) { border-top: none; } }
`;

export default function IFLiveAdminTab() {
  const [view, setView] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [focus, setFocus] = useState(null); // booking id to open on the Bookings view
  const [booking, setBooking] = useState(null); // { aircraftId } while Book for a pilot is open

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await ifLiveAdmin.overview());
      setError(null);
    } catch (err) {
      setError(err.message || "Couldn't load the admin overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = useCallback(async (key, fn, done, after) => {
    setBusy(key);
    try {
      const result = await fn();
      (result?.warnings || []).forEach(w => showToast(w, 'warning'));
      if (done) showToast(done, 'success');
      await Promise.all([load(), after ? after() : null]);
      return result;
    } catch (err) {
      showToast(err.message || 'That didn\'t work', 'error');
      return null;
    } finally {
      setBusy(null);
    }
  }, [load]);

  const ask = (title, message, confirmLabel, onConfirm, danger = true) => setConfirm({ title, message, confirmLabel, onConfirm, danger });

  const openBooking = id => { setFocus(id); setView('bookings'); };
  const startBooking = aircraftId => { setBooking({ aircraftId: aircraftId || '' }); setView('bookings'); };

  return (
    <div className="lv">
      <style>{LIVE_CSS}{ADMIN_CSS}</style>
      <div className="lv-bar" style={{ justifyContent: 'space-between' }}>
        <div className="lv-seg la-tabs" role="tablist">
          {VIEWS.map(v => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        {(view === 'overview' || view === 'bookings') && (
          <button className="la-btn" onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <RefreshCw size={13} /> {loading ? 'Refreshing' : 'Refresh'}
          </button>
        )}
      </div>

      {error && (view === 'overview' || view === 'bookings') && (
        <div className="lv-panel"><p className="lv-sub lv-bad">{error}</p></div>
      )}

      {view === 'overview' && data && <Overview data={data} busy={busy} run={run} ask={ask} openBooking={openBooking} setView={setView} />}
      {view === 'bookings' && booking && (
        <NewBooking busy={busy} run={run} presetAircraftId={booking.aircraftId}
          onDone={id => { setBooking(null); if (id) setFocus(id); }} />
      )}
      {view === 'bookings' && data && <Bookings data={data} busy={busy} run={run} ask={ask} focus={focus} setFocus={setFocus} onNew={() => startBooking('')} />}
      {(view === 'overview' || view === 'bookings') && !data && !error && <p className="lv-sub">Loading</p>}
      {view === 'abandoned' && <AbandonedView busy={busy} run={run} ask={ask} openBooking={openBooking} />}
      {view === 'pilots' && <PilotsView busy={busy} run={run} ask={ask} openBooking={openBooking} />}
      {view === 'aircraft' && <AircraftView busy={busy} run={run} openBooking={openBooking} onBook={startBooking} />}
      {view === 'activity' && <ActivityView openBooking={openBooking} />}
      {view === 'schedules' && <NeedsConnection><IFLiveSchedule /></NeedsConnection>}
      {view === 'settings' && (
        <>
          <Settings connection={data?.connection} />
          <h3 className="lv-h" style={{ margin: '0.5rem 0 0.75rem' }}>Fleet setup</h3>
          <NeedsConnection><IFLiveFleet /></NeedsConnection>
        </>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Overview({ data, busy, run, ask, openBooking, setView }) {
  const { connection, counts, jobs, issues } = data;
  const lateJobs = jobs.filter(j => j.late);
  const newest = jobs.reduce((m, j) => Math.max(m, t(j.lastRun) || 0), 0);
  const connectionText = !connection.connected ? 'Not connected' : connection.reachable ? 'Connected' : 'Not responding';

  return (
    <>
      <div className="la-strip">
        <div className="la-fig">
          <span>Infinite Flight</span>
          <b className={connection.connected && connection.reachable ? 'lv-ok' : 'lv-bad'}>{connectionText}</b>
          <small title={connection.error || ''}>{connection.error || 'Service account working'}</small>
        </div>
        <div className="la-fig">
          <span>Flying now</span>
          <b>{counts.flying}</b>
          <small>{counts.booked} booked{counts.free != null ? ` | ${counts.free} free` : ''}</small>
        </div>
        <div className="la-fig">
          <span>Landed, not filed</span>
          <b>{counts.landedUnfiled}</b>
          <small>Waiting on the pilot</small>
        </div>
        <div className="la-fig">
          <span>Abandoned</span>
          <b className={counts.abandoned ? 'lv-bad' : ''}>{counts.abandoned ?? 0}</b>
          <small>{counts.abandoned ? 'Started, never landed' : 'None'}</small>
        </div>
        <div className="la-fig">
          <span>Pending bookings</span>
          <b className={counts.pending ? 'lv-bad' : ''}>{counts.pending}</b>
          <small>{counts.pending ? 'No IF schedule yet' : 'None'}</small>
        </div>
        <div className="la-fig">
          <span>Background jobs</span>
          <b className={lateJobs.length ? 'lv-bad' : 'lv-ok'}>{lateJobs.length ? `${lateJobs.length} late` : 'Running'}</b>
          <small>Last run {ago(newest ? new Date(newest).toISOString() : null)}</small>
        </div>
      </div>

      <div className="lv-panel">
        <div className="la-head">
          <h3 className="lv-h">Needs attention</h3>
          <span className="lv-sub">{issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        {issues.length === 0 && <div className="la-empty">Nothing needs attention.</div>}
        {issues.map((issue, n) => (
          <div className="la-row" key={`${issue.kind}-${issue.bidId}-${issue.legIndex}-${n}`}>
            <div>
              <div className="la-title">{issue.title}</div>
              <div className="la-detail">{issue.detail}</div>
            </div>
            <div className="la-actions">
              <IssueActions issue={issue} busy={busy} run={run} ask={ask} />
              {issue.kind === 'abandoned'
                ? <button className="la-btn is-main" onClick={() => setView('abandoned')}>Sort it out</button>
                : <button className="la-btn" onClick={() => openBooking(issue.bidId)}>Manage</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="lv-panel">
        <div className="la-head"><h3 className="lv-h">Background jobs</h3></div>
        <div className="la-jobs">
          {jobs.map(j => (
            <div key={j.name}>
              <div style={{ fontWeight: 600 }}>{j.name}</div>
              <div className={j.late ? 'lv-bad' : 'lv-muted'} style={{ fontSize: '0.8rem' }}>
                {j.late ? 'Late: ' : ''}Last run {ago(j.lastRun)} | every {j.everyMinutes < 60 ? `${j.everyMinutes} min` : 'hour'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function IssueActions({ issue, busy, run, ask }) {
  const key = a => `${issue.kind}:${issue.bidId}:${issue.legIndex}:${a}`;
  const btn = (a, label, onClick, cls = '') => (
    <button key={a} className={`la-btn ${cls}`} disabled={busy === key(a)} onClick={onClick}>{label}</button>
  );
  return issue.actions.map(a => {
    switch (a) {
      case 'retry':
        return btn(a, 'Retry', () => run(key(a), () => ifLiveAdmin.retry(issue.bidId, false), 'Schedule created. The booking is active.'));
      case 'retry_no_plan':
        return btn(a, 'Retry without plan', () => run(key(a), () => ifLiveAdmin.retry(issue.bidId, true), 'Schedule created without the flight plan. The booking is active.'), 'is-main');
      case 'schedule':
        return btn(a, 'Create schedule', () => run(key(a), () => ifLiveAdmin.scheduleLeg(issue.bidId, issue.legIndex, false), 'Schedule created'));
      case 'schedule_no_plan':
        return btn(a, 'Create without plan', () => run(key(a), () => ifLiveAdmin.scheduleLeg(issue.bidId, issue.legIndex, true), 'Schedule created without the flight plan'));
      case 'cancel':
        return btn(a, 'Cancel booking', () => ask('Cancel this booking?', 'Every open leg is cancelled and its Infinite Flight schedule deleted. The pilot isn\'t notified.', 'Cancel booking',
          () => run(key(a), () => ifLiveAdmin.cancel(issue.bidId), 'Booking cancelled')), 'is-bad');
      case 'cancel_leg':
        return btn(a, 'Cancel leg', () => ask('Cancel this leg?', 'The leg is cancelled and its Infinite Flight schedule deleted.', 'Cancel leg',
          () => run(key(a), () => ifLiveAdmin.cancelLeg(issue.bidId, issue.legIndex), 'Leg cancelled')), 'is-bad');
      case 'close':
        return btn(a, 'Close booking', () => run(key(a), () => ifLiveAdmin.close(issue.bidId), 'Booking closed'), 'is-main');
      case 'clear_start':
        return btn(a, 'Clear start', () => run(key(a), () => ifLiveAdmin.editLeg(issue.bidId, issue.legIndex, { clearStarted: true }), 'Start cleared. The job may mark it again while the aircraft is flying.'));
      case 'merge':
        return btn(a, 'Merge bookings', () => ask('Merge these bookings?', 'This booking\'s open legs move to the end of the earlier booking, and this one is cancelled. They wait until the earlier legs are filed.', 'Merge',
          () => run(key(a), () => ifLiveAdmin.merge(issue.bidId, issue.mergeInto), 'Bookings merged'), false), 'is-main');
      case 'link_pirep':
        return issue.flightId
          ? btn(a, 'Link PIREP', () => run(key(a), () => ifLiveAdmin.linkPirep(issue.bidId, issue.legIndex, issue.flightId), 'PIREP linked. It now counts in Live totals.'), 'is-main')
          : null;
      default:
        return null;
    }
  });
}

function Bookings({ data, busy, run, ask, focus, setFocus, onNew }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(null);
  const loadRecent = useCallback(async () => {
    try { setRecent((await ifLiveAdmin.recent(14)).bookings); } catch (err) { showToast(err.message, 'error'); setRecent([]); }
  }, []);
  useEffect(() => { if (filter === 'recent' && !recent) loadRecent(); }, [filter, recent, loadRecent]);
  // A booking opened from elsewhere that's already closed is under Recent
  useEffect(() => {
    if (focus && !data.bookings.some(b => b.id === focus)) setFilter('recent');
  }, [focus, data.bookings]);

  const source = useMemo(() => (filter === 'recent' ? (recent || []) : data.bookings), [filter, recent, data.bookings]);
  const bookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source
      .filter(b => filter === 'all' || filter === 'recent' || b.status === filter)
      .filter(b => !q || [b.registration, b.pilot?.name, ...b.legs.flatMap(l => [l.flightNumber, l.originIcao, l.destIcao])]
        .some(v => String(v || '').toLowerCase().includes(q)));
  }, [source, filter, query]);

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`la-b-${focus}`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus, bookings.length]);

  return (
    <>
      <div className="lv-bar">
        <div className="lv-seg">
          {[['all', 'Open'], ['active', 'Active'], ['pending', 'Pending'], ['recent', 'Recent']].map(([id, label]) => (
            <button key={id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="lv-search">
          <Search size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Registration, pilot or airport" />
        </div>
        <button className="la-btn is-main" onClick={onNew}>Book for a pilot</button>
      </div>
      <div className="lv-panel">
        {filter === 'recent' && !recent && <div className="la-empty">Loading</div>}
        {(filter !== 'recent' || recent) && bookings.length === 0 && <div className="la-empty">No bookings match.</div>}
        {bookings.length > 0 && (
          <div className="bk-head">
            <span>Aircraft</span><span>Pilot</span>
            <div className="bk-headlegs"><span>Flight</span><span>Started</span><span>Deadline</span><span>Status</span></div>
            <span className="bk-act-sp" />
          </div>
        )}
        {bookings.map(b => {
          const closed = b.status !== 'active' && b.status !== 'pending';
          const open = focus === b.id;
          const others = data.bookings.filter(o => o.id !== b.id && o.status === 'active' && b.status === 'active'
            && o.aircraftId === b.aircraftId && o.pilot?.id === b.pilot?.id);
          return (
            <div className={`bk-item${open ? ' is-open' : ''}`} key={b.id} id={`la-b-${b.id}`}>
              <div className="bk-row">
                <div className="bk-ac">
                  <span className="lv-reg">{b.registration}</span>
                  {b.legs.length > 1 && <small>{b.legs.length} legs</small>}
                </div>
                <div className="bk-pilot">{b.pilot?.name || 'Unknown'}</div>
                <div className="bk-legs">
                  {b.legs.map(l => {
                    const st = b.status === 'pending' ? { label: 'Pending', tone: 'bad' } : legState(l);
                    const done = !!l.pirepId || !!l.expired;
                    return (
                      <div className={`bk-leg${done && !closed ? ' is-done' : ''}`} key={l.index}>
                        <div><span className="bk-lbl">Flight</span><b>{l.originIcao} to {l.destIcao}</b><small>{l.flightNumber || ''}</small></div>
                        <div><span className="bk-lbl">Started</span><Stamp v={l.startedAt} /></div>
                        <div><span className="bk-lbl">Deadline</span><Stamp v={done ? null : l.deadlineUtc} /></div>
                        <div><span className={`la-tag ${st.tone}`}>{st.label}</span></div>
                      </div>
                    );
                  })}
                </div>
                <div className="bk-act">
                  <button className="la-btn" onClick={() => setFocus(open ? null : b.id)}>{open ? 'Close' : 'Manage'}</button>
                </div>
              </div>
              {(closed || b.status === 'pending' || b.note) && (
                <div className="bk-note">
                  {closed ? `${b.status.charAt(0).toUpperCase() + b.status.slice(1)} ${zulu(b.updated)}` : `Booked ${zulu(b.created)}`}
                  {b.status === 'pending' ? ', no Infinite Flight schedule' : ''}{b.note ? ` | ${b.note}` : ''}
                </div>
              )}
              {open && <Manage booking={b} others={others} busy={busy} ask={ask}
                run={(k, fn, done) => run(k, fn, done, filter === 'recent' ? loadRecent : undefined)} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

// A time on one line and its day underneath, so a column of them lines up
function Stamp({ v }) {
  const ms = t(v);
  if (Number.isNaN(ms)) return <span className="lv-muted">-</span>;
  const d = new Date(ms);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
  const today = new Date();
  const sameDay = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
  const day = sameDay ? 'Today' : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return <><b className="lv-mono">{time}</b><small>{day}</small></>;
}

function Manage({ booking: b, others, busy, run, ask }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let live = true;
    ifLiveAdmin.history(b.id).then(r => live && setHistory(r.history)).catch(() => live && setHistory([]));
    return () => { live = false; };
  }, [b.id, b.updated]);

  const k = a => `${b.id}:${a}`;
  const isActive = b.status === 'active';
  const hasPlan = b.legs.some(l => l.hasFlightPlan);

  return (
    <div className="la-manage">
      {b.status === 'pending' && (
        <p className="lv-sub" style={{ marginBottom: '0.6rem' }}>
          <span className="lv-bad">Pending since {zulu(b.created)}.</span> {b.note ? b.note : 'The Infinite Flight schedule was never created.'}
        </p>
      )}

      {b.legs.map(l => <LegEditor key={l.index} booking={b} leg={l} busy={busy} run={run} ask={ask} />)}

      <div className="la-form" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
        {b.status === 'pending' && (
          <>
            {hasPlan && <button className="la-btn is-main" disabled={busy === k('retry1')} onClick={() => run(k('retry1'), () => ifLiveAdmin.retry(b.id, true), 'Schedule created without the flight plan')}>Retry without plan</button>}
            <button className={`la-btn ${hasPlan ? '' : 'is-main'}`} disabled={busy === k('retry')} onClick={() => run(k('retry'), () => ifLiveAdmin.retry(b.id, false), 'Schedule created. The booking is active.')}>Retry</button>
          </>
        )}
        {isActive && others.length > 0 && (
          <button className="la-btn" disabled={busy === k('merge')} onClick={() => ask('Merge into the other booking?',
            `The open legs here move to the end of ${others[0].registration}'s other booking for ${b.pilot?.name}, and this one is cancelled.`, 'Merge',
            () => run(k('merge'), () => ifLiveAdmin.merge(b.id, others[0].id), 'Bookings merged'), false)}>Merge into other booking</button>
        )}
        {isActive && !b.legs.some(l => !l.pirepId && !l.expired) && (
          <button className="la-btn" disabled={busy === k('close')} onClick={() => run(k('close'), () => ifLiveAdmin.close(b.id), 'Booking closed')}>Close booking</button>
        )}
        {(isActive || b.status === 'pending') && (
          <button className="la-btn is-bad" disabled={busy === k('cancel')} onClick={() => ask('Cancel this booking?',
            'Every open leg is cancelled and its Infinite Flight schedule deleted. Filed legs stay filed. The pilot isn\'t notified.', 'Cancel booking',
            () => run(k('cancel'), () => ifLiveAdmin.cancel(b.id), 'Booking cancelled'))}>Cancel booking</button>
        )}
      </div>

      <div className="la-history">
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Admin changes</div>
        {history === null && <div>Loading</div>}
        {history && history.length === 0 && <div>None yet. Booked {zulu(b.created)}.</div>}
        {history && history.map(h => (
          <div key={h.id}>{zulu(h.at)} | {h.by} | {describe(h)}</div>
        ))}
      </div>
    </div>
  );
}

function describe(h) {
  const d = h.details || {};
  const leg = d.route ? ` (${d.route})` : '';
  switch (h.action) {
    case 'if_live.leg_edited': {
      const parts = [];
      if (d.before?.holdStartUtc !== d.after?.holdStartUtc) parts.push(`hold ${zulu(d.after?.holdStartUtc)}`);
      if (d.before?.deadlineUtc !== d.after?.deadlineUtc) parts.push(`deadline ${zulu(d.after?.deadlineUtc)}`);
      if (d.before?.startedAt && !d.after?.startedAt) parts.push('start cleared');
      return `Edited leg${leg}: ${parts.join(', ') || 'no change'}`;
    }
    case 'if_live.schedule_retried': return d.result === 'failed' ? `Retry failed: ${d.error}` : `Schedule created${d.withoutFlightPlan ? ' without the flight plan' : ''}`;
    case 'if_live.leg_scheduled': return `Schedule created for${leg}`;
    case 'if_live.pirep_linked': return `PIREP linked${leg}, ${Number(d.hours || 0).toFixed(1)}h`;
    case 'if_live.pirep_unlinked': return `PIREP unlinked${leg}`;
    case 'if_live.leg_cancelled': return `Leg cancelled${leg}`;
    case 'if_live.booking_cancelled': return 'Booking cancelled';
    case 'if_live.booking_closed': return `Booking closed as ${d.status}`;
    case 'if_live.bookings_merged': return d.into ? 'Merged into another booking' : `Legs merged in: ${(d.legs || []).join(', ')}`;
    default: return h.action;
  }
}

function LegEditor({ booking: b, leg: l, busy, run, ask }) {
  const [editing, setEditing] = useState(false);
  const [hold, setHold] = useState(toInput(l.holdStartUtc));
  const [deadline, setDeadline] = useState(toInput(l.deadlineUtc));
  const [linking, setLinking] = useState(false);
  const [pireps, setPireps] = useState(null);
  const [pick, setPick] = useState('');
  const pending = b.status === 'pending';
  const state = pending ? { label: 'Not scheduled', tone: 'bad' } : legState(l);
  // A pending booking is fixed as a whole (Retry or Cancel booking below)
  const open = !pending && !l.pirepId && !l.expired;
  const k = a => `${b.id}:${l.index}:${a}`;

  useEffect(() => { setHold(toInput(l.holdStartUtc)); setDeadline(toInput(l.deadlineUtc)); }, [l.holdStartUtc, l.deadlineUtc]);

  const startLinking = async () => {
    setLinking(true);
    if (!b.pilot?.id) return;
    try {
      const r = await ifLiveAdmin.pilotPireps(b.pilot.id);
      const list = r.pireps.filter(p => !p.is_live);
      setPireps(list);
      const match = list.find(p => p.departure_icao === l.originIcao && p.arrival_icao === l.destIcao);
      setPick(match?.id || list[0]?.id || '');
    } catch (err) {
      showToast(err.message, 'error');
      setPireps([]);
    }
  };

  const schedule = !l.ifScheduleId ? 'None' : l.manualSchedule ? 'Added by hand' : 'Created';

  return (
    <div className="la-leg">
      <div className="la-leg-top">
        <div className="la-title">Leg {l.index + 1}: {routeOf(l)}</div>
        <span className={`la-tag ${state.tone}`}>{state.label}</span>
      </div>
      <div className="la-facts">
        <div><span>Hold </span>{zulu(l.holdStartUtc)}</div>
        <div><span>Deadline </span>{zulu(l.deadlineUtc)}</div>
        <div><span>Started </span>{l.startedAt ? zulu(l.startedAt) : '-'}</div>
        <div><span>Landing message </span>{l.landedPromptAt ? zulu(l.landedPromptAt) : '-'}</div>
        <div><span>IF schedule </span>{schedule}{l.hasFlightPlan ? ', with flight plan' : ''}</div>
        <div><span>PIREP </span>{l.pirepId ? `${Number(l.pirepFlightTime || 0).toFixed(1)}h${l.linkedByAdmin ? ', linked by admin' : ''}` : '-'}</div>
      </div>

      <div className="la-actions" style={{ justifyContent: 'flex-start' }}>
        {open && <button className="la-btn" onClick={() => setEditing(!editing)}>{editing ? 'Stop editing' : 'Edit times'}</button>}
        {open && l.deadlineUtc && [1, 4].map(h => (
          <button key={h} className="la-btn" disabled={busy === k(`plus${h}`)} title={`Move the deadline to ${zulu(new Date(t(l.deadlineUtc) + h * 3600000).toISOString())}`}
            onClick={() => run(k(`plus${h}`), () => ifLiveAdmin.editLeg(b.id, l.index, { deadlineUtc: new Date(t(l.deadlineUtc) + h * 3600000).toISOString() }), `Deadline moved ${h}h later`)}>
            +{h}h
          </button>
        ))}
        {open && l.startedAt && (
          <button className="la-btn" disabled={busy === k('clear')} onClick={() => run(k('clear'), () => ifLiveAdmin.editLeg(b.id, l.index, { clearStarted: true }), 'Start cleared')}>Clear start</button>
        )}
        {open && b.status === 'active' && (!l.ifScheduleId || l.manualSchedule) && (
          <button className="la-btn" disabled={busy === k('sched')} onClick={() => run(k('sched'), () => ifLiveAdmin.scheduleLeg(b.id, l.index, l.hasFlightPlan), 'Schedule created')}>
            Create IF schedule{l.hasFlightPlan ? ' without plan' : ''}
          </button>
        )}
        {open && b.status === 'active' && <button className="la-btn" onClick={startLinking}>Link PIREP</button>}
        {l.pirepId && (
          <button className="la-btn is-bad" disabled={busy === k('unlink')} onClick={() => ask('Unlink this PIREP?',
            'The PIREP stays in the logbook, but it stops counting in Live totals and the leg is open again.', 'Unlink',
            () => run(k('unlink'), () => ifLiveAdmin.unlinkPirep(b.id, l.index), 'PIREP unlinked'))}>Unlink PIREP</button>
        )}
        {open && (
          <button className="la-btn is-bad" disabled={busy === k('cancel')} onClick={() => ask('Cancel this leg?',
            'The leg is cancelled and its Infinite Flight schedule deleted.', 'Cancel leg',
            () => run(k('cancel'), () => ifLiveAdmin.cancelLeg(b.id, l.index), 'Leg cancelled'))}>Cancel leg</button>
        )}
      </div>

      {editing && (
        <div className="la-form">
          <label>Hold starts (UTC)<input type="datetime-local" value={hold} onChange={e => setHold(e.target.value)} /></label>
          <label>Deadline (UTC)<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
          <button className="la-btn is-main" disabled={busy === k('save')} onClick={async () => {
            const ok = await run(k('save'), () => ifLiveAdmin.editLeg(b.id, l.index, { holdStartUtc: fromInput(hold), deadlineUtc: fromInput(deadline) }), 'Times saved');
            if (ok) setEditing(false);
          }}>Save</button>
        </div>
      )}

      {linking && (
        <div className="la-form">
          {pireps === null && <span className="lv-sub">Loading PIREPs</span>}
          {pireps && pireps.length === 0 && <span className="lv-sub">No PIREPs outside Live from {b.pilot?.name} in the last 14 days.</span>}
          {pireps && pireps.length > 0 && (
            <>
              <label>PIREP
                <select value={pick} onChange={e => setPick(e.target.value)}>
                  {pireps.map(p => (
                    <option key={p.id} value={p.id}>
                      {zulu(p.created)} | {p.flight_number || ''} {p.departure_icao} to {p.arrival_icao} | {Number(p.flight_time || 0).toFixed(1)}h | {p.status}
                    </option>
                  ))}
                </select>
              </label>
              <button className="la-btn is-main" disabled={!pick || busy === k('link')} onClick={async () => {
                const ok = await run(k('link'), () => ifLiveAdmin.linkPirep(b.id, l.index, pick), 'PIREP linked. It now counts in Live totals.');
                if (ok) setLinking(false);
              }}>Link</button>
            </>
          )}
          <button className="la-btn" onClick={() => setLinking(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// IF schedules and Fleet setup read Infinite Flight as the admin themself
function NeedsConnection({ children }) {
  const { status, connecting, handleConnect } = useIFLive();
  if (status?.connected && status.primary_org_id) return children;
  return (
    <div className="lv-panel" style={{ maxWidth: 520 }}>
      <h3 className="lv-h" style={{ marginBottom: '0.4rem' }}>Connect your Infinite Flight account</h3>
      <p className="lv-sub" style={{ marginBottom: '1rem' }}>This view reads Infinite Flight with your own account. Overview and Bookings work without it.</p>
      <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>{connecting ? 'Redirecting' : 'Connect Infinite Flight'}</button>
    </div>
  );
}

function Settings({ connection }) {
  const { status, primaryOrg, handleDisconnect, handleConnect, connecting, loadPickerOrgs, pickerOrgs, pickerLoading, chooseOrg, settingPrimary } = useIFLive();
  const [showOrgs, setShowOrgs] = useState(false);

  return (
    <>
      <div className="lv-panel">
        <h3 className="lv-h" style={{ marginBottom: '0.6rem' }}>Organization service account</h3>
        <p className="lv-sub">
          Bookings create their Infinite Flight schedules through the account set for the organization, and the background jobs read Infinite Flight with it.
        </p>
        <div className="la-facts" style={{ marginTop: '0.75rem' }}>
          <div><span>Status </span><b className={connection?.connected && connection?.reachable ? 'lv-ok' : 'lv-bad'}>{!connection ? 'Unknown' : !connection.connected ? 'Not connected' : connection.reachable ? 'Working' : 'Not responding'}</b></div>
          <div><span>Organization </span>{connection?.orgId || 'Not configured'}</div>
        </div>
        {connection?.error && <p className="lv-sub lv-bad">{connection.error}</p>}
      </div>

      <div className="lv-panel">
        <h3 className="lv-h" style={{ marginBottom: '0.6rem' }}>Your Infinite Flight account</h3>
        {!status?.connected ? (
          <>
            <p className="lv-sub" style={{ marginBottom: '0.75rem' }}>Not connected. Connect an account with manage permissions on the Live organization to use IF schedules and Fleet setup.</p>
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>{connecting ? 'Redirecting' : 'Connect Infinite Flight'}</button>
          </>
        ) : (
          <>
            <p className="lv-sub">Connected{primaryOrg?.name ? ` to ${primaryOrg.name}` : ''}.</p>
            <div className="la-actions" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
              <button className="la-btn" onClick={() => { setShowOrgs(!showOrgs); if (!showOrgs) loadPickerOrgs(); }}>{showOrgs ? 'Hide organizations' : 'Change organization'}</button>
              <button className="la-btn is-bad" onClick={handleDisconnect}>Disconnect</button>
            </div>
            {showOrgs && (
              <div style={{ marginTop: '0.75rem' }}>
                {pickerLoading && <p className="lv-sub">Loading</p>}
                {!pickerLoading && (pickerOrgs || []).map(org => (
                  <div className="la-row" key={org.id}>
                    <div>
                      <div className="la-title">{org.name}</div>
                      <div className="la-detail">{org.description || org.id}</div>
                    </div>
                    <div className="la-actions">
                      {status.primary_org_id === org.id
                        ? <span className="la-tag ok">In use</span>
                        : <button className="la-btn" disabled={settingPrimary === org.id} onClick={() => chooseOrg(org)}>Use this</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
