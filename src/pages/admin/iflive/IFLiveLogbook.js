/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { ifLive } from '../../../api/client';
import { useIFLive } from './IFLiveContext';
import { LIVE_CSS, fmtHours, pbDate, splitType, zDay, zDayKey, zTime } from './liveData';

const RANGES = [7, 30, 90, 180];

const LOG_CSS = `
.lb-day { padding: 0; overflow: hidden; }
.lb-day-h { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border-color); }
.lb-scroll { overflow-x: auto; }
.lb-totals { display: flex; flex-wrap: wrap; gap: 0.5rem 2.5rem; margin-bottom: 1.25rem; }
.lb-big { font-size: 1.6rem; font-weight: 700; line-height: 1.1; color: var(--text-primary); }
`;

export default function IFLiveLogbook({ user }) {
  const { orgId, typeNames } = useIFLive();
  const [who, setWho] = useState('mine');
  const [days, setDays] = useState(30);
  const [flights, setFlights] = useState(null);
  const [error, setError] = useState(null);
  const [typeIdByReg, setTypeIdByReg] = useState({});

  useEffect(() => {
    if (!orgId) return;
    ifLive.aircraftList(orgId)
      .then(d => setTypeIdByReg(Object.fromEntries((d.aircraft || []).map(a => [String(a.registration || '').toUpperCase(), a.aircraftId]))))
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    setFlights(null);
    ifLive.orgHistory(orgId, days)
      .then(d => { setFlights(d.flights || []); setError(null); })
      .catch(err => { setFlights([]); setError(err.message || "Couldn't load the logbook"); });
  }, [orgId, days]);

  const list = (flights || []).filter(f => who === 'everyone' || f.pilotId === user?.id);
  const hours = list.reduce((n, f) => n + (f.flightHours || 0), 0);
  const pilots = new Set(list.map(f => f.pilotId).filter(Boolean)).size;
  const byDay = new Map();
  for (const f of list) {
    const key = zDayKey(pbDate(f.filedAt));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(f);
  }
  const typeFor = reg => typeNames?.[typeIdByReg[String(reg || '').toUpperCase()]] || '';

  return (
    <div className="lv">
      <style>{LIVE_CSS}{LOG_CSS}</style>
      <div className="lv-bar">
        <div className="lv-seg">
          <button className={who === 'mine' ? 'is-on' : ''} onClick={() => setWho('mine')}>Mine</button>
          <button className={who === 'everyone' ? 'is-on' : ''} onClick={() => setWho('everyone')}>Everyone</button>
        </div>
        <div className="lv-seg">
          {RANGES.map(d => <button key={d} className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
      </div>

      {error && <div className="lv-note is-bad" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!flights ? <p className="lv-sub">Loading…</p> : (
        <>
          <div className="lb-totals">
            <div><div className="lb-big">{list.length}</div><div className="lv-sub">flights</div></div>
            <div><div className="lb-big">{fmtHours(hours)}</div><div className="lv-sub">flown</div></div>
            {who === 'everyone' && <div><div className="lb-big">{pilots}</div><div className="lv-sub">pilots</div></div>}
          </div>

          {list.length === 0 && (
            <div className="lv-panel lv-sub">
              {who === 'mine' ? `You haven't flown a Live flight in the last ${days} days.` : `Nobody has flown a Live flight in the last ${days} days.`}
            </div>
          )}

          {[...byDay.entries()].map(([key, dayFlights]) => (
            <section key={key} className="lv-panel lb-day">
              <div className="lb-day-h">
                <strong>{zDay(new Date(`${key}T00:00:00Z`))}</strong>
                <span className="lv-sub">{dayFlights.length} flight{dayFlights.length === 1 ? '' : 's'}, {fmtHours(dayFlights.reduce((n, f) => n + (f.flightHours || 0), 0))}</span>
              </div>
              <div className="lb-scroll">
                <table className="lv-table" style={{ minWidth: who === 'everyone' ? 760 : 640 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '9%' }}>Filed</th>
                      <th style={{ width: '11%' }}>Flight</th>
                      <th style={{ width: '18%' }}>Route</th>
                      <th>Aircraft</th>
                      {who === 'everyone' && <th style={{ width: '17%' }}>Pilot</th>}
                      <th style={{ width: '10%' }}>Time</th>
                      <th style={{ width: '14%' }}>PIREP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayFlights.map(f => {
                      const approved = f.status === 'approved';
                      const rejected = f.status === 'rejected';
                      return (
                        <tr key={f.id}>
                          <td className="lv-mono">{zTime(pbDate(f.filedAt))}</td>
                          <td className="lv-mono" style={{ fontWeight: 700 }}>{f.callsign || '–'}</td>
                          <td className="lv-mono">{f.originIcao} to {f.destinationIcao}</td>
                          <td style={{ whiteSpace: 'nowrap' }}><span className="lv-reg">{f.registration}</span> <span className="lv-muted">{typeFor(f.registration) ? splitType(typeFor(f.registration)).model : ''}</span></td>
                          {who === 'everyone' && <td style={{ whiteSpace: 'nowrap' }}>{f.pilotCallsign || f.pilot || '–'}</td>}
                          <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{f.flightHours ? fmtHours(f.flightHours) : '–'}</td>
                          <td className={approved ? 'lv-ok' : rejected ? 'lv-bad' : 'lv-warn'} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {approved ? (f.autoApproved ? 'Auto-approved' : 'Approved') : rejected ? 'Rejected' : 'In review'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
