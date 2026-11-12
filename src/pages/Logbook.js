/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Loader from '../components/Loader';
import { flights as flightsApi, fleet as fleetApi } from '../api/client';
import FlightModal from '../components/FlightModal';
import LogbookMap from '../components/LogbookMap';
import { cacheGet, cacheSet } from '../cache';
import AircraftLabel from '../components/AircraftLabel';

const PAGE_SIZE = 20;
const FIELDS = 'id,flight_number,departure_icao,arrival_icao,aircraft,registration,event,flight_time,distance_nm,date,status,notes,multiplier_value,multiplier_name,is_career,is_live,auto_approved,fuel_used_kg,landing_stats';

function Logbook({ user }) {
  const [flights, setFlights]     = useState([]);
  const [mapFlights, setMapFlights] = useState([]);
  const [total, setTotal]         = useState(0);
  const [fleet, setFleet]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [sortKey, setSortKey]     = useState('date');
  const [sortDir, setSortDir]     = useState(-1);
  const [myStats, setMyStats]     = useState(null);
  const searchDebounce            = useRef(null);
  const isMounted                 = useRef(false);

  const loadFleet = useCallback(async () => {
    try {
      const cached = cacheGet('fleet');
      if (cached) { setFleet(cached); return; }
      const data = await fleetApi.list();
      const allLiveries = (data.fleet || []).flatMap(group => group.liveries.map(l => ({ ...l, name: l.name || group.type })));
      cacheSet('fleet', allLiveries);
      setFleet(allLiveries);
    } catch (error) {
      console.error('Error loading fleet:', error);
    }
  }, []);

  const loadMapFlights = useCallback(async () => {
    try {
      const cached = cacheGet(`mapflights:${user.id}`);
      if (cached) { setMapFlights(cached); return; }
      const data = await flightsApi.list({
        user: user.id,
        status: 'approved',
        fields: 'departure_icao,arrival_icao,status',
        limit: 500,
        sort: '-date',
      });
      const result = data.flights || [];
      cacheSet(`mapflights:${user.id}`, result, 5 * 60 * 1000);
      setMapFlights(result);
    } catch {}
  }, [user.id]);

  const loadFlights = useCallback(async (currentPage, currentFilter, currentSearch, currentSortKey, currentSortDir) => {
    try {
      setLoading(true);
      const serverSort = `${currentSortDir === -1 ? '-' : ''}${currentSortKey}`;
      const params = {
        sort: serverSort,
        user: user.id,
        page: currentPage,
        limit: PAGE_SIZE,
        fields: FIELDS,
      };
      if (currentFilter !== 'all') params.status = currentFilter;
      if (currentSearch.trim()) params.search = currentSearch.trim();
      const data = await flightsApi.list(params);
      setFlights(data.flights || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error loading flights:', error);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadFleet();
    loadMapFlights();
    flightsApi.myStats().then(d => setMyStats(d)).catch(() => {});
  }, [loadFleet, loadMapFlights]);

  // Load when page/filter/sort changes (immediate)
  useEffect(() => {
    isMounted.current = true;
    loadFlights(page, filter, search, sortKey, sortDir);
  }, [page, filter, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMounted.current) return;
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      loadFlights(1, filter, search, sortKey, sortDir);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatDuration = (hours) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (status) => {
    const styles = {
      approved: { bg: 'rgba(46,125,50,0.1)',  color: '#2e7d32', label: 'Approved' },
      pending:  { bg: 'rgba(245,127,23,0.1)', color: '#f57f17', label: 'Pending' },
      rejected: { bg: 'rgba(198,40,40,0.1)',  color: '#c62828', label: 'Rejected' },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{
        padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.8rem',
        fontWeight: 600, backgroundColor: s.bg, color: s.color, whiteSpace: 'nowrap',
      }}>
        {s.label}
      </span>
    );
  };

  const formatDate = (date) => new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  const TAGS = [
    { key: 'auto_approved', label: 'IF',     color: '#1976d2',          bg: 'rgba(25,118,210,0.1)' },
    { key: 'is_live',       label: 'LIVE',   color: 'var(--brand-accent)',          bg: 'rgba(var(--brand-accent-rgb),0.14)' },
    { key: 'is_career',     label: 'CAREER', color: 'var(--avg-green)', bg: 'rgba(var(--brand-primary-rgb),0.1)' },
    { key: 'event',         label: 'EVENT',  color: '#7b3fa0',          bg: 'rgba(123,63,160,0.12)' },
  ];
  const flightTags = (flight) => TAGS.filter(t => flight[t.key]).map(t => (
    <span key={t.key} style={{ fontSize: '0.6rem', fontWeight: 700, color: t.color, background: t.bg, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{t.label}</span>
  ));

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === -1 ? 1 : -1);
    else { setSortKey(key); setSortDir(-1); }
    setPage(1);
  }

  const SortArrow = ({ k }) => sortKey === k ? (sortDir === -1 ? ' ↓' : ' ↑') : '';

  const Pagination = () => {
    if (totalPages <= 1) return null;
    // Show window of pages around current
    const delta = 2;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      }
    }
    // Insert ellipsis markers
    const items = [];
    let prev = null;
    for (const p of pages) {
      if (prev && p - prev > 1) items.push('...');
      items.push(p);
      prev = p;
    }

    const btnBase = { padding: '0.45rem 0.8rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' };
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginTop: '1.5rem' }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          style={{ ...btnBase, background: 'transparent', color: 'var(--text-primary)', opacity: page === 1 ? 0.35 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
          ←
        </button>
        {items.map((item, i) =>
          item === '...'
            ? <span key={'e'+i} style={{ padding: '0 0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>…</span>
            : <button key={item} onClick={() => setPage(item)}
                style={{ ...btnBase, minWidth: '2.25rem', background: item === page ? 'var(--avg-green)' : 'transparent', color: item === page ? 'white' : 'var(--text-primary)', borderColor: item === page ? 'var(--avg-green)' : 'var(--border-color)' }}>
                {item}
              </button>
        )}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          style={{ ...btnBase, background: 'transparent', color: 'var(--text-primary)', opacity: page === totalPages ? 0.35 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
          →
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h2>Flight Logbook</h2>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card"><h4>Total Flights</h4><div className="stat-value">{(user.total_flights || 0).toLocaleString()}</div></div>
        <div className="stat-card"><h4>Total Hours</h4><div className="stat-value">{(user.total_hours || 0).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h</div></div>
        <div className="stat-card">
          <h4>Avg Landing VS</h4>
          <div className="stat-value">{myStats?.landing_stats?.avg_vs_fpm ? myStats.landing_stats.avg_vs_fpm.toLocaleString() : '—'}</div>
          {myStats?.landing_stats?.avg_vs_fpm && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>ft/min</div>}
        </div>
        <div className="stat-card">
          <h4>Avg Fuel Burn</h4>
          <div className="stat-value">{myStats?.landing_stats?.avg_fuel_kg_per_hr ? myStats.landing_stats.avg_fuel_kg_per_hr.toLocaleString() : '—'}</div>
          {myStats?.landing_stats?.avg_fuel_kg_per_hr && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>kg / hr</div>}
        </div>
      </div>

      <LogbookMap flights={mapFlights} />

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'approved', 'pending', 'rejected'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1); }} style={{
                padding: '0.5rem 1rem',
                background: filter === f ? 'var(--avg-green)' : 'transparent',
                color: filter === f ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: '6px',
                cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', textTransform: 'capitalize',
              }}>
                {f}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search flight, route, aircraft…"
              style={{ width: '100%', padding: '0.5rem 0.875rem 0.5rem 2rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>
            {filter === 'all' ? 'All Flights' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Flights`}
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '0.75rem', fontWeight: 400 }}>
              ({total})
            </span>
          </h3>
          {totalPages > 1 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}><Loader size={72} /></div>
        ) : flights.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <p>{search ? `No flights matching "${search}"` : 'No flights found.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="desktop-only">
              <table>
                <thead>
                  <tr>
                    {[['date','Date'],['flight_number','Flight'],['departure_icao','Route'],['aircraft','Aircraft'],['flight_time','Duration'],['status','Status']].map(([k, label]) => (
                      <th key={k} onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: sortKey === k ? 'var(--avg-green)' : undefined }}>
                        {label}{SortArrow({ k })}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map(flight => (
                    <React.Fragment key={flight.id}>
                      <tr>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(flight.date)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <strong>{flight.flight_number}</strong>
                            {flightTags(flight)}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{flight.departure_icao} → {flight.arrival_icao}</td>
                        <td><AircraftLabel flight={flight} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDuration(flight.flight_time)}</td>
                        <td>{getStatusBadge(flight.status)}</td>
                        <td>
                          <button onClick={() => setSelectedFlight(selectedFlight?.id === flight.id ? null : flight)} style={{
                            padding: '0.4rem 0.9rem', background: selectedFlight?.id === flight.id ? 'var(--avg-green)' : 'none',
                            border: '1.5px solid', borderColor: selectedFlight?.id === flight.id ? 'var(--avg-green)' : 'var(--border-color)',
                            borderRadius: '6px', cursor: 'pointer', fontSize: '0.825rem', fontWeight: 600,
                            color: selectedFlight?.id === flight.id ? 'white' : 'var(--text-primary)',
                            transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                          }}
                            onMouseEnter={e => { if (selectedFlight?.id !== flight.id) { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.color = 'var(--avg-green)'; }}}
                            onMouseLeave={e => { if (selectedFlight?.id !== flight.id) { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
                          >{selectedFlight?.id === flight.id ? 'Close' : 'View'}</button>
                        </td>
                      </tr>
                      {selectedFlight?.id === flight.id && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0.75rem 1rem 0.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                            <FlightModal flight={selectedFlight} fleetData={fleet} onClose={() => setSelectedFlight(null)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mobile-only">
              {flights.map(flight => (
                <div key={flight.id}>
                  <div onClick={() => setSelectedFlight(selectedFlight?.id === flight.id ? null : flight)} style={{
                    padding: '1rem 0', borderBottom: selectedFlight?.id === flight.id ? 'none' : '1px solid var(--border-color)', cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <strong>{flight.flight_number}</strong>
                        {flightTags(flight)}
                      </span>
                      {getStatusBadge(flight.status)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '1rem' }}>{flight.departure_icao} → {flight.arrival_icao}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDuration(flight.flight_time)} · {formatDate(flight.date)}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <AircraftLabel flight={flight} inline />
                    </div>
                  </div>
                  {selectedFlight?.id === flight.id && (
                    <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                      <FlightModal flight={selectedFlight} fleetData={fleet} onClose={() => setSelectedFlight(null)} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Pagination />
          </>
        )}
      </div>

    </div>
  );
}

export default Logbook;
