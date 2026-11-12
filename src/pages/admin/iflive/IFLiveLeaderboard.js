/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { ifLiveStats } from '../../../api/client';
import { LIVE_CSS } from './liveData';

export default function IFLiveLeaderboard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { ifLiveStats.leaderboard().then(d => setRows(d.leaderboard || [])).catch(() => setRows([])); }, []);

  return (
    <section className="lv lv-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <style>{LIVE_CSS}</style>
      <h3 className="lv-h" style={{ padding: '1.1rem 1.25rem 0.6rem' }}>Leaderboard</h3>
      {!rows ? <p className="lv-sub" style={{ padding: '0 1.25rem 1.25rem' }}>Loading…</p>
        : rows.length === 0 ? <p className="lv-sub" style={{ padding: '0 1.25rem 1.25rem' }}>No Live flights logged yet.</p>
        : (
          <table className="lv-table">
            <thead><tr><th style={{ width: 56, paddingLeft: '1.25rem' }}>#</th><th>Pilot</th><th style={{ textAlign: 'right' }}>Flights</th><th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Hours</th></tr></thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.pilotId}>
                  <td className="lv-muted" style={{ fontWeight: 700, paddingLeft: '1.25rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{e.callsign || e.name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.flights}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', paddingRight: '1.25rem' }}>{e.hours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </section>
  );
}
