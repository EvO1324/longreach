/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { fleet as fleetApi, flights as flightsApi } from '../../api/client';

function FleetInfo() {
  const [fleet, setFleet]       = useState([]);
  const [stats, setStats]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const loadAll = async () => {
    try {
      const [fleetData, flightsData] = await Promise.all([fleetApi.list(), flightsApi.aircraftStats()]);
      setFleet((fleetData.fleet || []).flatMap(g => g.liveries));
      setStats(flightsData.stats || {});
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const getStats = name => stats[name] || { flights: 0, hours: 0 };

  const grouped = fleet.reduce((acc, ac) => {
    const type = ac.name.split(' - ')[0];
    if (!acc[type]) acc[type] = [];
    acc[type].push(ac);
    return acc;
  }, {});

  const totalFlights = Object.values(stats).reduce((s, v) => s + v.flights, 0);
  const totalHours   = Object.values(stats).reduce((s, v) => s + v.hours, 0);

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading fleet…</div>;

  return (
    <div>
      <style>{`
        .fi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1rem; }
        .fi-card { border-radius: 12px; overflow: hidden; border: 1.5px solid var(--border-color); background: var(--bg-card); cursor: pointer; transition: border-color 0.2s, transform 0.18s, box-shadow 0.18s; }
        .fi-card:hover { border-color: var(--avg-green); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .fi-img { width: 100%; height: 130px; object-fit: cover; display: block; background: #0f172a; }
        .fi-placeholder { width: 100%; height: 130px; background: linear-gradient(135deg,#0f172a,#1e293b); display:flex; align-items:center; justify-content:center; }
        .fi-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1500; display:flex; align-items:center; justify-content:center; padding:1.5rem; }
        .fi-modal { background:var(--bg-card); border-radius:14px; width:100%; max-width:520px; max-height:82vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,0.3); }
        .fi-livery-row { display:flex; align-items:center; gap:0.875rem; padding:0.75rem; border-radius:8px; background:var(--bg-secondary); transition: background 0.15s; }
        .fi-livery-row:hover { background: var(--bg-hover); }
        @media(max-width:480px){ .fi-grid{ grid-template-columns: repeat(auto-fill, minmax(155px,1fr)); } }
      `}</style>

      {/* Stats */}
      <div style={{ display:'flex', gap:'2rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {[
          { label:'Aircraft Types',  value: Object.keys(grouped).length },
          { label:'Total Liveries',  value: fleet.length },
          { label:'Fleet Flights',   value: totalFlights, green:true },
          { label:'Fleet Hours',     value: `${totalHours.toFixed(0)}h`, green:true },
        ].map(({ label, value, green }) => (
          <div key={label}>
            <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.08em', color:'var(--text-secondary)', textTransform:'uppercase' }}>{label}</div>
            <div style={{ fontSize:'1.5rem', fontWeight:700, lineHeight:1.1, color: green ? 'var(--avg-green)' : 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Type cards */}
      <div className="fi-grid">
        {Object.entries(grouped).map(([type, liveries]) => {
          const hero      = liveries.find(l => l.image_url)?.image_url || null;
          const typeFlights = liveries.reduce((s, ac) => s + getStats(ac.name).flights, 0);
          const typeHours   = liveries.reduce((s, ac) => s + getStats(ac.name).hours, 0);
          return (
            <div key={type} className="fi-card" onClick={() => setSelected({ type, liveries })}>
              {hero
                ? <div style={{ position:'relative' }}>
                    <img src={hero} alt={type} className="fi-img" onError={e => e.target.style.display='none'} />
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(transparent 35%, rgba(0,0,0,0.65))' }} />
                  </div>
                : <div className="fi-placeholder">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 5.2a1 1 0 0 0-.8.3L2 7.5l7 3.5L7 13l-2 .5L3 11l-1.5 1.5 3 6L6 20l6-1.5L15.5 22l1.5-1.5-.7-1.3z"/></svg>
                  </div>
              }
              <div style={{ padding:'0.75rem' }}>
                <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'0.3rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{type}</div>
                <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginBottom:'0.5rem' }}>{liveries.length} {liveries.length === 1 ? 'livery' : 'liveries'}</div>
                <div style={{ display:'flex', gap:'0.75rem' }}>
                  <span style={{ fontSize:'0.78rem', fontWeight:600, color: typeFlights > 0 ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{typeFlights} flt</span>
                  <span style={{ fontSize:'0.78rem', fontWeight:600, color: typeHours > 0 ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{typeHours.toFixed(1)}h</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Liveries modal */}
      {selected && (
        <div className="fi-backdrop" onClick={() => setSelected(null)}>
          <div className="fi-modal" onClick={e => e.stopPropagation()}>
            {/* Hero */}
            {(() => {
              const hero = selected.liveries.find(l => l.image_url)?.image_url;
              return hero ? (
                <div style={{ height:180, background:'#0f172a', position:'relative', flexShrink:0 }}>
                  <img src={hero} alt={selected.type} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(transparent 40%, rgba(0,0,0,0.7))' }} />
                  <div style={{ position:'absolute', bottom:'1rem', left:'1.25rem' }}>
                    <div style={{ color:'white', fontWeight:800, fontSize:'1.2rem' }}>{selected.type}</div>
                    <div style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.82rem' }}>{selected.liveries.length} {selected.liveries.length === 1 ? 'livery' : 'liveries'}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ position:'absolute', top:'0.75rem', right:'0.75rem', background:'rgba(0,0,0,0.5)', border:'none', borderRadius:'50%', width:32, height:32, cursor:'pointer', color:'white', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:'1.1rem' }}>{selected.type}</div>
                    <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>{selected.liveries.length} {selected.liveries.length === 1 ? 'livery' : 'liveries'}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              );
            })()}
            {/* Liveries list */}
            <div style={{ overflowY:'auto', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {selected.liveries.map(ac => {
                const s = getStats(ac.name);
                const liveryLabel = ac.livery_name || ac.name.split(' - ')[1] || ac.name;
                return (
                  <div key={ac.id} className="fi-livery-row">
                    {ac.image_url && (
                      <div style={{ width:56, height:36, borderRadius:5, overflow:'hidden', background:'#0f172a', flexShrink:0 }}>
                        <img src={ac.image_url} alt={liveryLabel} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
                      </div>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                        <span style={{ fontWeight:600, fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{liveryLabel}</span>
                        {ac.icao_code && (
                          <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:'4px', background:'rgba(var(--brand-primary-rgb),0.1)', color:'var(--avg-green)', border:'1px solid rgba(var(--brand-primary-rgb),0.2)', fontFamily:'monospace', flexShrink:0 }}>{ac.icao_code}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:'0.78rem', fontWeight:700, color: s.flights > 0 ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{s.flights} flt</div>
                      <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{s.hours.toFixed(1)}h</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FleetInfo;
