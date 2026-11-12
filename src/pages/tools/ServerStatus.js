/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { infiniteFlight } from '../../api/client';

const EXPERT_SERVER_ID = "ed323139-baa7-4834-b9d6-5fb9f19ff11e";
const TOP_AIRPORTS_COUNT = 20;
const TOP_AIRCRAFT_COUNT = 8;

const ATC_LABEL  = { 0: 'GND', 1: 'TWR', 2: 'UNI', 3: 'CLR', 4: 'APP', 5: 'DEP', 6: 'CTR', 7: 'ATIS' };
const ATC_COLOUR = { 0: '#795548', 1: '#2e7d32', 2: '#9e9e9e', 3: '#9c27b0', 4: '#1976d2', 5: '#0097a7', 6: '#388e3c', 7: '#f57c00' };

function splitAircraftName(fullName) {
  if (!fullName) return { base: 'Unknown', livery: null };
  const idx = fullName.indexOf(' - ');
  if (idx === -1) return { base: fullName.trim(), livery: null };
  return { base: fullName.slice(0, idx).trim(), livery: fullName.slice(idx + 3).trim() };
}

function ATCBadge({ type, frequencyId, title }) {
  const label = ATC_LABEL[type];
  const colour = ATC_COLOUR[type] || '#999';
  if (!label) return null;
  return (
    <span
      key={frequencyId}
      title={title}
      style={{
        padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.68rem',
        fontWeight: 700, letterSpacing: '0.03em',
        background: colour + '18', color: colour, border: `1px solid ${colour}35`,
      }}
    >
      {label}
    </span>
  );
}

function ServerStatus() {
  const [sessions, setSessions] = useState([]);
  const [worldData, setWorldData] = useState([]);
  const [aircraftStats, setAircraftStats] = useState({ result: [], totalFlights: 0, sessionName: null });
  const [liveryMap, setLiveryMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [filterATC, setFilterATC] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState(null);
  const composingRef = useRef(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [sessionsData, worldData, aircraftStatsData, liveryMapData] = await Promise.all([
        infiniteFlight.sessions(),
        infiniteFlight.world(EXPERT_SERVER_ID),
        infiniteFlight.aircraftStats(),
        infiniteFlight.aircraftLiveryMap(),
      ]);

      setSessions(sessionsData.result || []);

      const active = (worldData.result || []).filter(a =>
        a.atcFacilities?.length > 0 || a.inboundFlightsCount > 0
      );

      active.sort((a, b) =>
        (b.inboundFlightsCount + b.outboundFlightsCount) - (a.inboundFlightsCount + a.outboundFlightsCount)
      );

      setWorldData(active);
      setAircraftStats(aircraftStatsData);
      setLiveryMap(liveryMapData.map || {});
      setLastUpdated(new Date());
    } catch (err) {
      console.error('IF API error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60s
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const expertSession = sessions.find(s => s.id === EXPERT_SERVER_ID);

  const filtered = worldData.filter(a => {
    const matchSearch = !search || a.airportIcao?.toLowerCase().includes(search.toLowerCase());
    const matchATC = !filterATC || a.atcFacilities?.length > 0;
    return matchSearch && matchATC;
  });

  const topAirports = filtered.slice(0, TOP_AIRPORTS_COUNT);

  const topAircraft = (() => {
    const byName = new Map(); // base -> { count, liveries: Map(liveryLabel -> count) }
    for (const { id, count } of aircraftStats.result) {
      const { base, livery } = splitAircraftName(liveryMap[id]);
      if (!byName.has(base)) byName.set(base, { count: 0, liveries: new Map() });
      const entry = byName.get(base);
      entry.count += count;
      const liveryLabel = livery || 'No specific livery';
      entry.liveries.set(liveryLabel, (entry.liveries.get(liveryLabel) || 0) + count);
    }
    return [...byName.entries()]
      .map(([name, { count, liveries }]) => ({
        name,
        count,
        liveries: [...liveries.entries()]
          .map(([liveryName, liveryCount]) => ({ liveryName, count: liveryCount }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_AIRCRAFT_COUNT);
  })();

  const totalATC = worldData.reduce((sum, a) => sum + (a.atcFacilities?.length || 0), 0);
  const totalInbound = worldData.reduce((sum, a) => sum + (a.inboundFlightsCount || 0), 0);
  const totalAirportsActive = worldData.filter(a => a.atcFacilities?.length > 0).length;
  const maxAircraftCount = topAircraft[0]?.count || 1;

  const activeAircraft = topAircraft.find(a => a.name === selectedAircraft) || topAircraft[0] || null;
  const maxLiveryCount = activeAircraft?.liveries[0]?.count || 1;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.75rem', opacity: 0.4 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <p>Fetching live server data...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Server cards */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        {sessions.map(s => {
          const isExpert = s.id === EXPERT_SERVER_ID;
          return (
            <div key={s.id} className="stat-card" style={{
              borderLeft: isExpert ? '3px solid var(--avg-green)' : '3px solid var(--border-color)',
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {s.name}
                {isExpert && (
                  <span style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.5rem',
                    background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--avg-green)',
                    borderRadius: '8px', fontWeight: 600
                  }}>LIVE</span>
                )}
              </h4>
              <div className="stat-value" style={{ fontSize: '2rem' }}>{s.userCount?.toLocaleString()}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                of {s.maxUsers?.toLocaleString()} max pilots
              </div>
            </div>
          );
        })}
      </div>

      {/* Expert server summary */}
      {expertSession && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Active ATC Facilities', value: totalATC },
            { label: 'Airports w/ ATC', value: totalAirportsActive },
            { label: 'Inbound Flights', value: totalInbound.toLocaleString() },
          ].map(item => (
            <div key={item.label} className="stat-card">
              <h4>{item.label}</h4>
              <div className="stat-value" style={{ fontSize: '2rem' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Most Flown Aircraft</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {aircraftStats.totalFlights.toLocaleString()} airborne · {aircraftStats.sessionName || 'Expert'} Server
          </span>
        </div>

        {topAircraft.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            No aircraft data available right now.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2.5rem' }}>
            <div style={{ flex: '1 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {topAircraft.map((ac, i) => {
                const isTop = i === 0;
                const isActive = activeAircraft?.name === ac.name;
                const pct = Math.max(4, (ac.count / maxAircraftCount) * 100);
                return (
                  <div
                    key={ac.name}
                    onClick={() => setSelectedAircraft(ac.name)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedAircraft(ac.name); }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.75rem minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.55rem 0.6rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isActive ? 'var(--avg-green-pale)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 800,
                      background: isTop ? 'var(--avg-gold)' : (isActive ? 'var(--avg-green)' : 'var(--bg-hover)'),
                      color: isTop || isActive ? '#fff' : 'var(--text-secondary)',
                    }}>
                      {i + 1}
                    </span>

                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: isActive ? 800 : 600, fontSize: '0.88rem',
                        color: isActive ? 'var(--avg-green-dark)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.3rem',
                      }}>
                        {ac.name}
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          background: isActive ? 'var(--avg-green)' : 'var(--border-color)',
                          width: `${pct}%`,
                        }} />
                      </div>
                    </div>

                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', textAlign: 'right' }}>
                      {ac.count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>

            {activeAircraft && (
              <div style={{
                flex: '1.3 1 320px', minWidth: 280,
                borderLeft: '1px solid var(--border-color)',
                paddingLeft: '2.25rem',
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {activeAircraft.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {activeAircraft.count.toLocaleString()} flight{activeAircraft.count !== 1 ? 's' : ''} across {activeAircraft.liveries.length} {activeAircraft.liveries.length !== 1 ? 'liveries' : 'livery'}
                  </div>
                </div>

                <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {activeAircraft.liveries.map((l, li) => {
                    const liveryPct = Math.max(4, (l.count / maxLiveryCount) * 100);
                    return (
                      <div key={l.liveryName} style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.45rem 0',
                        borderBottom: li < activeAircraft.liveries.length - 1 ? '1px solid var(--border-color)' : 'none',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.84rem', fontWeight: li === 0 ? 700 : 500,
                            color: li === 0 ? 'var(--avg-gold-dark)' : 'var(--text-primary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.3rem',
                          }} title={l.liveryName}>
                            {l.liveryName}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              background: li === 0 ? 'var(--avg-gold)' : 'var(--border-color)',
                              width: `${liveryPct}%`,
                            }} />
                          </div>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {l.count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>
            Top Airports
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '0.6rem' }}>
              {topAirports.length} of {filtered.length}
            </span>
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {lastUpdated && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search ICAO..."
            value={search}
            onChange={e => { if (!composingRef.current) setSearch(e.target.value); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => { composingRef.current = false; setSearch(e.target.value); }}
            style={{ width: '180px' }}
          />
          <button
            onClick={() => setFilterATC(!filterATC)}
            className="btn"
            style={{
              padding: '0.6rem 1.1rem',
              fontSize: '0.875rem',
              background: filterATC ? 'var(--avg-green)' : 'transparent',
              color: filterATC ? 'white' : 'var(--text-primary)',
              border: '1.5px solid ' + (filterATC ? 'var(--avg-green)' : 'var(--border-color)'),
            }}
          >
            ATC Only
          </button>
        </div>

        {topAirports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No active airports found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '2.5rem' }}>#</th>
                  <th>Airport</th>
                  <th>Traffic</th>
                  <th>ATC</th>
                </tr>
              </thead>
              <tbody>
                {topAirports.map((airport, i) => (
                  <tr key={airport.airportIcao}>
                    <td style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{i + 1}</td>
                    <td>
                      <span style={{ fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.5px', fontSize: '1rem' }}>
                        {airport.airportIcao}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#2e7d32', fontWeight: 700 }} title="Inbound">↓ {airport.inboundFlightsCount}</span>
                      <span style={{ color: 'var(--border-color)', margin: '0 0.5rem' }}>/</span>
                      <span style={{ color: '#1565c0', fontWeight: 700 }} title="Outbound">↑ {airport.outboundFlightsCount}</span>
                    </td>
                    <td>
                      {airport.atcFacilities?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                          {airport.atcFacilities.map(f => (
                            <ATCBadge
                              key={f.frequencyId}
                              type={f.type}
                              frequencyId={f.frequencyId}
                              title={`${f.username || 'Controller'} — online since ${new Date(f.startTime).toLocaleTimeString()}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServerStatus;
