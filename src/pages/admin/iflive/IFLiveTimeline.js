/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ifLive } from '../../../api/client';
import { useIFLive } from './IFLiveContext';

const HOUR = 60 * 60 * 1000;
const WINDOWS = {
  1: { pxPerHour: 68, labelEvery: 1 },
  3: { pxPerHour: 28, labelEvery: 3 },
  7: { pxPerHour: 12, labelEvery: 6 },
};
const AC_COL = 176;

const STATUS = {
  scheduled: { label: 'Scheduled', color: '#4f7a8c' },
  flying:    { label: 'In flight', color: 'var(--brand-primary)' },
  filed:     { label: 'Logged',    color: 'var(--brand-primary)' },
};
const IN_PROGRESS = new Set([4, 6, 7, 10]);
const statusOf = s => (s === 'filed' ? STATUS.filed : IN_PROGRESS.has(s) ? STATUS.flying : STATUS.scheduled);

const pad = n => String(n).padStart(2, '0');
const zTime = d => `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
const zDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const zStamp = d => `${zDay(d)} ${zTime(d)}`;
const blockTime = (a, b) => {
  const mins = Math.round((b - a) / 60000);
  return mins > 0 ? `${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : '';
};
const crewText = s => (s.crew || []).map(c => c.username).filter(Boolean).join(', ');
const pbDate = v => new Date(String(v).replace(' ', 'T'));
const shortName = p => (p ? `${p.first_name || 'Pilot'} ${(p.last_name || '').charAt(0).toUpperCase()}${p.last_name ? '.' : ''}` : 'A pilot');
const depOf = f => new Date(f.scheduledDepartureUtc).getTime();
const arrOf = f => new Date(f.scheduledArrivalUtc).getTime();

function splitType(name) {
  const i = (name || '').lastIndexOf(' - ');
  return i > 0 ? { model: name.slice(0, i), livery: name.slice(i + 3) } : { model: name || 'Aircraft', livery: '' };
}

function floorToHour(t) {
  const d = new Date(t);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

function aircraftNote(ac) {
  if (ac.visibility === 2) return 'Hangared';
  if (ac.isFleetActiveSlot === false) return 'Not in service';
  return null;
}

function fromBookings(bids) {
  const byAircraft = new Map();
  const bySchedule = new Map();
  const filed = [];
  const filedScheduleIds = new Set();
  const flownFromByPirep = new Map();
  for (const bid of bids || []) {
    const pilot = shortName(bid.pilot);
    let cursor = pbDate(bid.created).getTime();
    (bid.legs || []).forEach((l, i) => {
      const timeless = !!l.timeless || !l.departureUtc;
      const legStart = l.holdStartUtc ? pbDate(l.holdStartUtc).getTime() : timeless ? cursor : new Date(l.departureUtc).getTime();
      if (l.deadlineUtc) cursor = new Date(l.deadlineUtc).getTime();

      if (l.pirepId) {
        const hours = Number(l.pirepFlightTime) || 0;
        const flownFrom = l.matchedFlightCreated ? pbDate(l.matchedFlightCreated).getTime()
          : l.loggedAt ? pbDate(l.loggedAt).getTime() - hours * HOUR : null;
        if (!flownFrom || Number.isNaN(flownFrom)) return;
        if (l.ifScheduleId) filedScheduleIds.add(l.ifScheduleId);
        if (l.matchedFlightCreated) flownFromByPirep.set(l.pirepId, flownFrom);
        filed.push({
          pirepId: l.pirepId,
          id: `filed-${bid.id}-${i}`, filed: true, status: 'filed', aircraftId: bid.aircraftId,
          callsign: l.flightNumber || 'Flight', originIcao: l.originIcao, destinationIcao: l.destIcao,
          scheduledDepartureUtc: new Date(flownFrom).toISOString(),
          scheduledArrivalUtc: new Date(flownFrom + Math.max(hours, 0.25) * HOUR).toISOString(),
          crew: [{ username: pilot }], pilot, flightHours: hours,
          filedAt: l.loggedAt ? pbDate(l.loggedAt) : null,
        });
        return;
      }
      if (bid.status !== 'active' || l.expired || !l.deadlineUtc) return;
      const hold = { id: `${bid.id}-${i}`, start: legStart, end: cursor, callsign: l.flightNumber || 'Flight', pilot, timeless, scheduleId: l.ifScheduleId };
      if (l.ifScheduleId) bySchedule.set(l.ifScheduleId, { start: legStart, until: new Date(cursor), pilot });
      if (!byAircraft.has(bid.aircraftId)) byAircraft.set(bid.aircraftId, []);
      byAircraft.get(bid.aircraftId).push(hold);
    });
  }
  return { holds: { byAircraft, bySchedule }, filed, filedScheduleIds, flownFromByPirep };
}

function fromHistory(flights, flownFromByPirep) {
  return (flights || []).filter(h => h.aircraftId).map(h => {
    const filedAt = pbDate(h.filedAt).getTime();
    const hours = h.flightHours || 0;
    const from = flownFromByPirep.get(h.id) ?? filedAt - Math.max(hours, 0.25) * HOUR;
    return {
      id: `pirep-${h.id}`, pirepId: h.id, filed: true, status: 'filed', approval: h.status, aircraftId: h.aircraftId,
      callsign: h.callsign || 'Flight', originIcao: h.originIcao, destinationIcao: h.destinationIcao,
      scheduledDepartureUtc: new Date(from).toISOString(),
      scheduledArrivalUtc: new Date(from + Math.max(hours, 0.25) * HOUR).toISOString(),
      crew: h.pilot ? [{ username: h.pilot }] : [], pilot: h.pilot || 'A pilot', flightHours: hours,
      filedAt: new Date(filedAt), isLive: h.isLive, autoApproved: h.autoApproved,
    };
  });
}

function flightTitle(f, ac, hold) {
  const parts = [`${f.callsign}  ${f.originIcao} → ${f.destinationIcao}`, ac?.registration];
  if (f.filed) parts.push(`Logged by ${f.pilot}${f.flightHours ? `, ${f.flightHours.toFixed(1)}h` : ''}`);
  else if (f.isTimeless) parts.push(hold ? `Timeless, booked by ${hold.pilot} until ${zStamp(hold.until)}` : 'Timeless, fly any time');
  else parts.push(`${zStamp(new Date(depOf(f)))} → ${zTime(new Date(arrOf(f)))}`);
  if (!f.filed) parts.push(statusOf(f.status).label);
  if (!f.filed && crewText(f)) parts.push(`Crew: ${crewText(f)}`);
  return parts.filter(Boolean).join('\n');
}

const PAGE_CSS = `
.tl { --tl-fly-bg: #2a7d58; --tl-grid: rgba(120,116,104,.16); --tl-day: rgba(120,116,104,.45); --tl-past: rgba(120,116,104,.05); --tl-now: #c62828; }
body.dark-mode .tl { --tl-fly-bg: #2f8f63; --tl-grid: rgba(255,255,255,.06); --tl-day: rgba(255,255,255,.18); --tl-past: rgba(255,255,255,.025); --tl-now: #ff6b6b; }
.tl-scroll { overflow: auto; max-height: 72vh; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); }
.tl-row { display: flex; border-bottom: 1px solid var(--border-color); position: relative; }
.tl-row:last-child { border-bottom: none; }
.tl-row:hover .tl-ac, .tl-row:hover .tl-track { background-color: var(--bg-hover); }
.tl-ac { position: sticky; left: 0; z-index: 4; background: var(--bg-card); border-right: 1px solid var(--border-color); box-sizing: border-box; padding: 0 0.75rem; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.tl-reg { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; font-size: 0.86rem; color: var(--text-primary); }
.tl-type { font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-track { position: relative; }

.tl-blk { position: absolute; z-index: 2; box-sizing: border-box; height: 24px; border-radius: 3px; border: 1px solid transparent; padding: 0 6px; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; cursor: pointer; font: inherit; font-size: 0.72rem; line-height: 1; text-align: left; }
.tl-blk b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
.tl-blk .tl-r { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .8; }
.tl-blk .tl-t { opacity: .7; }
.tl-blk:hover, .tl-blk:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 1px; z-index: 3; }
.tl-sch { background: #e2ebf1; border-color: #a7bccb; color: #1c3a4c; }
.tl-fly { background: var(--tl-fly-bg); color: #fff; }
.tl-log { background: #ebe8e1; border-color: #cdc8bc; color: #555147; }
.tl-win { background: repeating-linear-gradient(135deg, rgba(160,118,24,.16) 0 5px, transparent 5px 10px); border-color: rgba(160,118,24,.6); color: #6b5212; }
.tl-out { position: absolute; z-index: 1; height: 24px; display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 0.72rem; color: var(--text-secondary); pointer-events: none; }
.tl-out b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; color: var(--text-primary); }
.tl-tail { position: absolute; z-index: 1; height: 24px; box-sizing: border-box; border-radius: 0 3px 3px 0; background: repeating-linear-gradient(135deg, rgba(120,116,104,.18) 0 4px, transparent 4px 8px); pointer-events: none; }
body.dark-mode .tl-sch { background: rgba(140,195,224,.13); border-color: rgba(140,195,224,.42); color: #d3e8f3; }
body.dark-mode .tl-log { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.13); color: #b8b5ac; }
body.dark-mode .tl-win { background: repeating-linear-gradient(135deg, rgba(224,180,79,.2) 0 5px, transparent 5px 10px); border-color: rgba(224,180,79,.55); color: #ebca7a; }
body.dark-mode .tl-tail { background: repeating-linear-gradient(135deg, rgba(255,255,255,.1) 0 4px, transparent 4px 8px); }

.tl-key { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-secondary); }
.tl-key span { display: inline-flex; align-items: center; gap: 0.4rem; }
.tl-key i { display: inline-block; width: 18px; height: 10px; border-radius: 2px; border: 1px solid transparent; box-sizing: border-box; }

.tl-detail { margin-bottom: 0.75rem; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); }
.tl-detail-h { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; }
.tl-detail dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.75rem 1.25rem; margin: 0; padding: 0.85rem 1rem; font-size: 0.875rem; }
.tl-detail dt { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 2px; }
.tl-detail dd { margin: 0; font-weight: 600; }
`;

const STATE_CLASS = { scheduled: 'lv-info', flying: 'lv-ok', filed: 'lv-muted' };

function Detail({ flight, aircraft, typeName, hold, onClose }) {
  const st = statusOf(flight.status);
  const stKey = flight.filed ? 'filed' : IN_PROGRESS.has(flight.status) ? 'flying' : 'scheduled';
  const dep = flight.scheduledDepartureUtc && new Date(flight.scheduledDepartureUtc);
  const arr = flight.scheduledArrivalUtc && new Date(flight.scheduledArrivalUtc);
  const item = (k, v) => (v ? <div><dt>{k}</dt><dd>{v}</dd></div> : null);
  return (
    <div className="tl-detail">
      <div className="tl-detail-h">
        <span className="tl-reg" style={{ fontSize: '1.05rem' }}>{flight.callsign}</span>
        <span className="lv-mono" style={{ fontWeight: 600 }}>{flight.originIcao} to {flight.destinationIcao}</span>
        <span className={STATE_CLASS[stKey]} style={{ fontSize: '0.85rem', fontWeight: 700 }}>{st.label}</span>
        <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignSelf: 'center' }}><X size={17} /></button>
      </div>
      <dl>
        {item('Aircraft', `${aircraft?.registration || 'Unknown'}${typeName ? `, ${splitType(typeName).model}` : ''}`)}
        {flight.filed ? (
          <>
            {item('Flown', dep && arr ? `${zStamp(dep)} to ${zTime(arr)}` : null)}
            {item('Flight time', flight.flightHours ? blockTime(0, flight.flightHours * HOUR) : null)}
            {item('Pilot', flight.pilot)}
            {item('PIREP', flight.approval ? `${flight.approval.charAt(0).toUpperCase()}${flight.approval.slice(1)}${flight.autoApproved ? ', automatic' : ''}` : null)}
          </>
        ) : (
          <>
            {item('Departure', flight.isTimeless ? 'Any time' : zStamp(dep))}
            {item('Arrival', flight.isTimeless ? null : zStamp(arr))}
            {item('Block', flight.isTimeless ? null : blockTime(dep, arr))}
            {item('Booked by', hold?.pilot)}
            {item('Held until', hold ? zStamp(hold.until) : null)}
            {item('Crew', crewText(flight) || null)}
          </>
        )}
      </dl>
    </div>
  );
}

const LANE_H = 32;
const ROW_PAD = 6;
const CHAR_W = 6.6; // rough width of a label character, for fitting labels
const MIN_SPAN = 6;

function packLanes(blocks) {
  const laneEnds = [];
  const placed = [...blocks].sort((a, b) => a.left - b.left).map(b => {
    let lane = laneEnds.findIndex(endX => endX <= b.left + 1);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = b.left + b.reserve;
    return { ...b, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

function TimelineBlock({ block, ac, now, onSelect }) {
  const { flight: f, kind, start, end, left, barW, tailW, top, hold, room: laneRoom } = block;
  const flying = kind !== 'filed' && IN_PROGRESS.has(f.status);
  const cls = kind === 'filed' ? 'tl-log' : flying ? 'tl-fly' : kind === 'window' ? 'tl-win' : 'tl-sch';
  const route = `${f.originIcao}-${f.destinationIcao}`;
  const time = kind === 'filed' ? (f.flightHours ? blockTime(0, f.flightHours * HOUR) : '')
    : flying ? 'airborne'
    : kind === 'window' ? `by ${zTime(new Date(end))}`
    : `${zTime(new Date(start)).slice(0, 4)}-${zTime(new Date(end))}`;
  const room = barW - 12;
  const show = room >= (f.callsign.length + route.length + time.length + 2) * CHAR_W ? 3
    : room >= (f.callsign.length + route.length + 1) * CHAR_W ? 2
    : room >= f.callsign.length * CHAR_W ? 1 : 0;
  const outside = laneRoom - barW - tailW - 8;
  const out = show >= 1 ? 0
    : outside >= (f.callsign.length + route.length + 1) * CHAR_W ? 2
    : outside >= f.callsign.length * CHAR_W ? 1 : 0;
  const progress = flying && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : null;
  const style = { left, top, width: barW };
  if (progress != null) style.background = `linear-gradient(90deg, rgba(0,0,0,.18) ${progress * 100}%, transparent ${progress * 100}%), var(--tl-fly-bg)`;

  return (
    <>
      <button className={`tl-blk ${cls}`} style={style} onClick={() => onSelect(f)} title={flightTitle(f, ac, hold)}>
        {show >= 1 && <b>{f.callsign}</b>}
        {show >= 2 && <span className="tl-r">{route}</span>}
        {show >= 3 && <span className="tl-t">{time}</span>}
      </button>
      {tailW > 2 && <span className="tl-tail" style={{ left: left + barW, top, width: tailW }} />}
      {out > 0 && (
        <span className="tl-out" style={{ left: left + barW + tailW + 5, top }}>
          <b>{f.callsign}</b>{out >= 2 && <span className="lv-mono">{route}</span>}
        </span>
      )}
    </>
  );
}

function TimelineView({ rows, holds, typeName, now, start, days, onSelect }) {
  const { pxPerHour, labelEvery } = WINDOWS[days];
  const end = start + days * 24 * HOUR;
  const trackWidth = days * 24 * pxPerHour;
  const xOf = t => ((t - start) / HOUR) * pxPerHour;
  const nowVisible = now >= start && now <= end;

  const hours = [];
  for (let t = Math.ceil(start / HOUR) * HOUR; t < end; t += HOUR) hours.push(t);
  const labelled = hours.filter(t => new Date(t).getUTCHours() % labelEvery === 0);
  const dayStarts = hours.filter(t => new Date(t).getUTCHours() === 0);

  const laid = rows.map(({ ac, rotation, filed }) => {
    const items = [];
    for (const f of [...filed, ...rotation]) {
      const hold = holds.bySchedule.get(f.id);
      if (f.filed) items.push({ f, hold, kind: 'filed', s0: depOf(f), e0: arrOf(f), tail: null });
      else if (!f.isTimeless) items.push({ f, hold, kind: 'timed', s0: depOf(f), e0: arrOf(f), tail: hold ? hold.until.getTime() : null });
      else if (hold) items.push({ f, hold, kind: 'window', s0: hold.start, e0: hold.until.getTime(), tail: null });
    }
    items.sort((a, b) => a.s0 - b.s0);
    const blocks = [];
    items.forEach((it, i) => {
      const nextStart = items.slice(i + 1).find(n => n.s0 >= it.e0)?.s0;
      const tail = it.tail ? Math.min(it.tail, nextStart ?? it.tail) : null;
      const last = Math.max(it.e0, tail || 0);
      if (last <= start || it.s0 >= end) return;
      const left = Math.max(0, xOf(it.s0));
      const barW = Math.max(MIN_SPAN, Math.min(trackWidth, xOf(it.e0)) - left);
      const tailW = tail ? Math.max(0, Math.min(trackWidth, xOf(tail)) - left - barW - (tail === nextStart ? 2 : 0)) : 0;
      const label = (it.f.callsign.length + 1) * CHAR_W + 10;
      const reserve = barW + tailW + (barW - 12 < it.f.callsign.length * CHAR_W ? label : 2);
      blocks.push({ id: it.f.id, flight: it.f, kind: it.kind, hold: it.hold, start: it.s0, end: it.e0, left, barW, tailW, reserve });
    });
    const { placed, lanes } = packLanes(blocks);
    const height = ROW_PAD * 2 + lanes * LANE_H - (LANE_H - 24);
    const unplaced = rotation.filter(f => f.isTimeless && !holds.bySchedule.get(f.id)).length;
    const withRoom = placed.map(b => {
      const next = placed.filter(o => o.lane === b.lane && o.left > b.left).sort((x, y) => x.left - y.left)[0];
      return { ...b, room: (next ? next.left : trackWidth) - b.left, top: ROW_PAD + b.lane * LANE_H };
    });
    return { ac, blocks: withRoom, height: Math.max(40, height), unplaced };
  });

  const HEAD_H = 46;
  return (
    <div className="tl-scroll">
      <div style={{ width: AC_COL + trackWidth, position: 'relative' }}>
        {/* Header: date, then hours */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', height: HEAD_H }}>
          <div className="tl-ac" style={{ width: AC_COL, zIndex: 7, justifyContent: 'flex-end', paddingBottom: 6, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Aircraft, times Zulu
          </div>
          <div style={{ width: trackWidth, position: 'relative' }}>
            {[start, ...dayStarts.filter(t => t > start)].map(t => (
              <span key={`d${t}`} style={{ position: 'absolute', left: xOf(t) + 6, top: 6, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{zDay(new Date(t))}</span>
            ))}
            {labelled.map(t => (
              <span key={t} style={{ position: 'absolute', left: xOf(t) + 4, bottom: 6, fontSize: '0.68rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{zTime(new Date(t)).slice(0, 4)}</span>
            ))}
            {dayStarts.map(t => <span key={`dl${t}`} style={{ position: 'absolute', left: xOf(t), top: 0, bottom: 0, borderLeft: '1px solid var(--tl-day)' }} />)}
            {nowVisible && (
              <span style={{ position: 'absolute', left: xOf(now) + 4, top: 6, fontSize: '0.68rem', fontWeight: 800, color: 'var(--tl-now)', background: 'var(--bg-card)', paddingRight: 4, fontVariantNumeric: 'tabular-nums' }}>{zTime(new Date(now))}</span>
            )}
          </div>
        </div>

        <div style={{ position: 'absolute', top: HEAD_H, bottom: 0, left: AC_COL, width: trackWidth, pointerEvents: 'none', zIndex: 0 }}>
          {now > start && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: Math.min(trackWidth, xOf(now)), background: 'var(--tl-past)' }} />}
          {labelled.map(t => <div key={t} style={{ position: 'absolute', top: 0, bottom: 0, left: xOf(t), borderLeft: `1px solid ${new Date(t).getUTCHours() === 0 ? 'var(--tl-day)' : 'var(--tl-grid)'}` }} />)}
        </div>
        {nowVisible && <div style={{ position: 'absolute', top: 0, bottom: 0, left: AC_COL + xOf(now), borderLeft: '1px solid var(--tl-now)', zIndex: 1, pointerEvents: 'none' }} />}

        {laid.length === 0 && <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No aircraft match.</div>}
        {laid.map(({ ac, blocks, height, unplaced }) => {
          const { model, livery } = splitType(typeName(ac));
          const note = aircraftNote(ac);
          return (
            <div key={ac.id} className="tl-row" style={{ minHeight: height }}>
              <div className="tl-ac" style={{ width: AC_COL }} title={typeName(ac)}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span className="tl-reg">{ac.registration}</span>
                  <span className="lv-mono" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{ac.currentIcao || ''}</span>
                </div>
                <div className="tl-type">
                  {note ? <span className="lv-warn" style={{ fontWeight: 600 }}>{note}</span> : <>{model}{livery ? `, ${livery}` : ''}</>}
                  {unplaced > 0 && <span title="Timeless flights nobody has booked have no time to place them at."> +{unplaced} open</span>}
                </div>
              </div>
              <div className="tl-track" style={{ width: trackWidth }}>
                {blocks.map(b => <TimelineBlock key={b.id} block={b} ac={ac} now={now} onSelect={onSelect} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="tl-key">
      <span><i className="tl-sch" />Scheduled</span>
      <span><i className="tl-fly" />In flight</span>
      <span><i className="tl-log" />Logged</span>
      <span><i className="tl-win" />Booked, fly any time in the window</span>
      <span><i className="tl-tail" style={{ position: 'static' }} />Held after landing</span>
    </div>
  );
}

function markAirborne(ac, rotation) {
  if (!(ac.live && ac.live.speed > 40) || rotation.some(f => IN_PROGRESS.has(f.status))) return rotation;
  const i = rotation.findIndex(f => f.status !== 11);
  return i < 0 ? rotation : rotation.map((f, j) => (j === i ? { ...f, status: 6 } : f));
}

const HISTORY_REFRESH_MS = 5 * 60 * 1000;

export default function FleetTimeline({ aircraft, bids, schedules, query = '' }) {
  const { orgId, typeNames } = useIFLive();
  const [history, setHistory] = useState(null);
  const [days, setDays] = useState(3);
  const [start, setStart] = useState(() => floorToHour(Date.now()) - 12 * HOUR);
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!orgId) return undefined;
    const load = () => ifLive.orgHistory(orgId, 7).then(d => setHistory(d.flights || [])).catch(() => setHistory(null));
    load();
    const t = setInterval(load, HISTORY_REFRESH_MS);
    return () => clearInterval(t);
  }, [orgId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const typeName = useCallback(ac => (ac && typeNames[ac.aircraftId]) || '', [typeNames]);
  const booked = useMemo(() => fromBookings(bids), [bids]);
  const { holds } = booked;
  const flown = useMemo(() => {
    if (!history) return booked.filed;
    const fromPireps = fromHistory(history, booked.flownFromByPirep);
    const covered = new Set(fromPireps.map(f => f.pirepId));
    return [...fromPireps, ...booked.filed.filter(f => !covered.has(f.pirepId))];
  }, [history, booked]);

  // Per aircraft: open flights in IF's flying order, and what it's flown lately.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const open = new Map();
    const filed = new Map();
    const push = (map, f) => { if (!map.has(f.aircraftId)) map.set(f.aircraftId, []); map.get(f.aircraftId).push(f); };
    (schedules || []).filter(s => !booked.filedScheduleIds.has(s.id)).forEach(f => push(open, f));
    flown.forEach(f => push(filed, f));
    return (aircraft || [])
      .map(ac => ({
        ac,
        rotation: markAirborne(ac, (open.get(ac.id) || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))),
        filed: (filed.get(ac.id) || []).sort((a, b) => depOf(a) - depOf(b)),
      }))
      .filter(r => !q || [r.ac.registration, typeName(r.ac), r.ac.currentIcao, ...[...r.rotation, ...r.filed].flatMap(f => [f.callsign, f.originIcao, f.destinationIcao, crewText(f)])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = splitType(typeName(a.ac));
        const tb = splitType(typeName(b.ac));
        return ta.model.localeCompare(tb.model) || ta.livery.localeCompare(tb.livery) || (a.ac.registration || '').localeCompare(b.ac.registration || '');
      });
  }, [aircraft, schedules, booked, flown, query, typeName]);
  const acById = useMemo(() => new Map((aircraft || []).map(ac => [ac.id, ac])), [aircraft]);

  const shift = dir => setStart(s => s + dir * days * 24 * HOUR);
  const resetStart = d => setStart(floorToHour(Date.now()) - (d === 1 ? 4 : 12) * HOUR);
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem 0.55rem' };

  return (
    <div className="tl">
      <style>{PAGE_CSS}</style>
      <div className="lv-bar">
        <div className="lv-seg">
          {[1, 3, 7].map(d => <button key={d} className={days === d ? 'is-on' : ''} onClick={() => { setDays(d); resetStart(d); }}>{d === 1 ? '1 day' : `${d} days`}</button>)}
        </div>
        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
          <button onClick={() => shift(-1)} className="lv-btn" style={iconBtn} aria-label="Earlier"><ChevronLeft size={16} /></button>
          <button onClick={() => resetStart(days)} className="lv-btn">Now</button>
          <button onClick={() => shift(1)} className="lv-btn" style={iconBtn} aria-label="Later"><ChevronRight size={16} /></button>
        </div>
      </div>
      {selected && <Detail flight={selected} aircraft={acById.get(selected.aircraftId)} typeName={typeName(acById.get(selected.aircraftId))} hold={holds.bySchedule.get(selected.id)} onClose={() => setSelected(null)} />}
      <TimelineView rows={rows} holds={holds} typeName={typeName} now={now} start={start} days={days} onSelect={setSelected} />
      <Legend />
    </div>
  );
}
