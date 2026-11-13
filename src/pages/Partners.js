/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Partners: the VAs we're linked with (the "partners" plugin), with what
// they share: who's flying now, recent flights and their routes.

import React, { useEffect, useMemo, useState } from 'react';
import { partners as api } from '../api/client';
import Loader from '../components/Loader';

const CSS = `
.pa { display: flex; flex-direction: column; gap: 1.25rem; }
.pa-head { display: flex; align-items: center; gap: 0.85rem; }
.pa-logo { width: 44px; height: 44px; object-fit: contain; border-radius: 10px; background: var(--bg-secondary); }
.pa-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 1rem; }
.pa-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin-bottom: 0.4rem; }
.pa-row { display: grid; grid-template-columns: 1fr auto; gap: 0.1rem 0.75rem; padding: 0.55rem 0; border-top: 1px solid var(--border-color); font-size: 0.88rem; }
.pa-row:first-of-type { border-top: none; }
.pa-muted { font-size: 0.78rem; color: var(--text-secondary); }
.pa-right { text-align: right; }
.pa-empty { font-size: 0.85rem; color: var(--text-secondary); padding: 0.4rem 0; }
.pa-search { width: 100%; box-sizing: border-box; padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 0.88rem; margin-bottom: 0.5rem; }
`;

function Routes({ routes }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toUpperCase();
    const list = s ? routes.filter(r => [r.flight_number, r.from, r.to, r.aircraft].some(v => String(v || '').toUpperCase().includes(s))) : routes;
    return list.slice(0, 50);
  }, [q, routes]);
  if (!routes.length) return <div className="pa-empty">No routes shared.</div>;
  return (
    <>
      <input className="pa-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${routes.length} route${routes.length === 1 ? '' : 's'} by airport, flight or aircraft`} />
      {shown.map((r, i) => (
        <div key={i} className="pa-row">
          <strong>{r.from} → {r.to}</strong>
          <span className="pa-right">{r.flight_number}</span>
          <span className="pa-muted">{r.aircraft}</span>
          <span className="pa-muted pa-right">{[r.duration, r.distance_nm ? `${Math.round(r.distance_nm).toLocaleString()} nm` : ''].filter(Boolean).join(' · ')}</span>
        </div>
      ))}
      {!q && routes.length > shown.length && <div className="pa-muted" style={{ marginTop: '0.4rem' }}>Showing {shown.length} of {routes.length}. Search to find more.</div>}
    </>
  );
}

function Partner({ p }) {
  return (
    <section className="card" style={{ margin: 0 }}>
      <div className="pa-head" style={{ marginBottom: '1rem' }}>
        {p.logo ? <img className="pa-logo" src={p.logo} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /> : <div className="pa-logo" />}
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{p.name}</h2>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="pa-muted">{p.url.replace(/^https?:\/\//, '')}</a>}
        </div>
      </div>
      {p.error ? <div className="pa-empty">{p.error}</div> : (
        <div className="pa-cols">
          {p.live && (
            <div>
              <div className="pa-label">Flying now</div>
              {!p.live.length ? <div className="pa-empty">No one's flying right now.</div> : p.live.map((f, i) => (
                <div key={i} className="pa-row">
                  <strong>{f.callsign}</strong>
                  <span className="pa-right">{f.from && f.to ? `${f.from} → ${f.to}` : ''}</span>
                  <span className="pa-muted">{f.aircraft}</span>
                  <span className="pa-muted pa-right">{f.altitude >= 1000 ? `FL${Math.round(f.altitude / 100)}` : `${f.altitude} ft`} · {f.speed} kts</span>
                </div>
              ))}
            </div>
          )}
          {p.recent && (
            <div>
              <div className="pa-label">Recent flights</div>
              {!p.recent.length ? <div className="pa-empty">No flights yet.</div> : p.recent.map((f, i) => (
                <div key={i} className="pa-row">
                  <strong>{f.from} → {f.to}</strong>
                  <span className="pa-right">{f.hours} h</span>
                  <span className="pa-muted">{[f.callsign, f.aircraft].filter(Boolean).join(' · ')}</span>
                  <span className="pa-muted pa-right">{f.date ? new Date(f.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}</span>
                </div>
              ))}
            </div>
          )}
          {p.routes && (
            <div>
              <div className="pa-label">Their routes</div>
              <Routes routes={p.routes} />
            </div>
          )}
          {!p.live && !p.recent && !p.routes && <div className="pa-empty">They're not sharing anything at the moment.</div>}
        </div>
      )}
    </section>
  );
}

function Partners() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.feed().then(d => setList(d.partners || [])).catch(err => setError(err.message || 'Couldn\'t load partners'));
  }, []);

  return (
    <div className="pa">
      <style>{CSS}</style>
      <div>
        <h1 style={{ margin: 0 }}>Partners</h1>
        <p className="pa-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>VAs we've teamed up with, and what they're flying.</p>
      </div>
      {error ? <div className="card">{error}</div>
        : !list ? <Loader />
        : !list.length ? <div className="card pa-empty">No partners yet.</div>
        : list.map(p => <Partner key={p.id} p={p} />)}
    </div>
  );
}

export default Partners;
