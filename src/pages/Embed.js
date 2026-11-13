/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Widgets for a VA's own website, shown in an iframe:
//   /embed/live          who's flying now
//   /embed/stats         pilots, flights, hours, routes
//   /embed/leaderboard   top 10 by hours (?period=month for this month)
// ?theme=dark|light|auto and ?transparent=1 change how it looks.
// Admin › Embeds switches each one on and gives the code to paste.

import React, { useEffect, useState } from 'react';
import brand from '../brand';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const TITLES = { live: 'Flying now', stats: 'In numbers', leaderboard: 'Top pilots' };

const CSS = `
.em { font-family: inherit; color: var(--text-primary); padding: 14px 16px; box-sizing: border-box; min-height: 100vh; display: flex; flex-direction: column; gap: 12px; }
.em-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.em-title { font-weight: 700; font-size: 15px; margin: 0; }
.em-sub { font-size: 12px; color: var(--text-secondary); }
.em-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #2e7d32; margin-right: 6px; animation: emPulse 2s infinite; }
@keyframes emPulse { 50% { opacity: 0.35; } }
.em-list { display: flex; flex-direction: column; }
.em-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 9px 0; border-top: 1px solid var(--border-color); align-items: center; }
.em-row:first-child { border-top: none; }
.em-strong { font-weight: 700; font-size: 14px; }
.em-muted { font-size: 12px; color: var(--text-secondary); }
.em-right { text-align: right; }
.em-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 520px) { .em-grid { grid-template-columns: repeat(4, 1fr); } }
.em-tile { background: var(--bg-secondary); border-radius: 10px; padding: 12px; }
.em-num { font-size: 22px; font-weight: 800; color: var(--avg-green); line-height: 1.1; }
.em-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; color: var(--text-secondary); margin-top: 4px; }
.em-rank { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; background: var(--bg-secondary); margin-right: 10px; flex-shrink: 0; }
.em-rank.is-top { background: var(--avg-green); color: #fff; }
.em-foot { margin-top: auto; font-size: 11px; color: var(--text-secondary); text-align: right; }
.em-foot a { color: inherit; }
.em-empty { font-size: 13px; color: var(--text-secondary); padding: 12px 0; }
`;

const fmt = n => Number(n || 0).toLocaleString();

function useWidget(widget, period) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let live = true;
    const load = () => fetch(`${BASE_URL}/embed/${widget}${period === 'month' ? '?period=month' : ''}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (live) setState(ok ? { data: d, error: null } : { data: null, error: d.error || 'Not available' }); })
      .catch(() => { if (live) setState(s => s.data ? s : { data: null, error: 'Couldn\'t load' }); });
    load();
    const timer = setInterval(load, widget === 'live' ? 30000 : 300000);
    return () => { live = false; clearInterval(timer); };
  }, [widget, period]);
  return state;
}

function Live({ data }) {
  if (!data.online) return <div className="em-empty">The Expert Server is offline.</div>;
  if (!data.flights.length) return <div className="em-empty">No one's flying right now.</div>;
  return (
    <div className="em-list">
      {data.flights.map(f => (
        <div key={f.callsign + f.lat} className="em-row">
          <span className="em-strong">{f.callsign}</span>
          <span className="em-strong em-right">{f.departure && f.arrival ? `${f.departure} → ${f.arrival}` : ''}</span>
          <span className="em-muted">{f.aircraft || ''}</span>
          <span className="em-muted em-right">{f.altitude >= 1000 ? `FL${Math.round(f.altitude / 100)}` : `${fmt(f.altitude)} ft`} · {fmt(f.speed)} kts</span>
        </div>
      ))}
    </div>
  );
}

function Stats({ data }) {
  const tiles = [['Pilots', data.pilots], ['Flights', data.flights], ['Hours', data.hours], ['Routes', data.routes]];
  return (
    <div className="em-grid">
      {tiles.map(([label, n]) => (
        <div key={label} className="em-tile"><div className="em-num">{fmt(n)}</div><div className="em-label">{label}</div></div>
      ))}
    </div>
  );
}

function Leaderboard({ data }) {
  if (!data.pilots.length) return <div className="em-empty">No flights yet{data.period === 'month' ? ' this month' : ''}.</div>;
  return (
    <div className="em-list">
      {data.pilots.map((p, i) => (
        <div key={i} className="em-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span className={`em-rank${i < 3 ? ' is-top' : ''}`}>{i + 1}</span>
            <span style={{ minWidth: 0 }}>
              <span className="em-strong">{p.name}</span>
              {p.callsign && <span className="em-muted" style={{ marginLeft: 8 }}>{p.callsign}</span>}
            </span>
          </span>
          <span className="em-strong em-right">{fmt(p.hours)} h</span>
        </div>
      ))}
    </div>
  );
}

function Embed() {
  const widget = window.location.pathname.replace(/^\/embed\//, '').replace(/\/$/, '');
  const q = new URLSearchParams(window.location.search);
  const period = q.get('period') === 'month' ? 'month' : 'all';
  const { data, error } = useWidget(widget, period);

  useEffect(() => {
    const theme = q.get('theme');
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark-mode', !!dark);
    document.body.style.background = q.get('transparent') === '1' ? 'transparent' : 'var(--bg-card)';
    document.title = `${TITLES[widget] || 'Widget'} · ${brand.name}`;
  }, []); // eslint-disable-line

  if (!TITLES[widget]) return <div className="em"><style>{CSS}</style><div className="em-empty">No such widget.</div></div>;

  const sub = widget === 'live' && data ? `${data.flights.length} in the air` : widget === 'leaderboard' ? (period === 'month' ? 'This month' : 'All time') : '';
  return (
    <div className="em">
      <style>{CSS}</style>
      <div className="em-head">
        <h1 className="em-title">{widget === 'live' && <span className="em-dot" />}{TITLES[widget]}</h1>
        {sub && <span className="em-sub">{sub}</span>}
      </div>
      {error ? <div className="em-empty">{error}</div>
        : !data ? <div className="em-empty">Loading…</div>
        : widget === 'live' ? <Live data={data} />
        : widget === 'stats' ? <Stats data={data} />
        : <Leaderboard data={data} />}
      <div className="em-foot"><a href={window.location.origin} target="_blank" rel="noreferrer">{brand.name}</a></div>
    </div>
  );
}

export default Embed;
