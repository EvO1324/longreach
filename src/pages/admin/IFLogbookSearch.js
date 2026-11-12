/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useCallback } from 'react';
import { pilots as pilotsApi, infiniteFlight } from '../../api/client';

const fmtMins = (mins) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
const daysAgo = (dateStr) => {
  const d = Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  return d === 0 ? 'Today' : `${d}d ago`;
};
const SERVER_LABEL = ['Solo', 'Casual', 'Training', 'Expert', 'Private'];
const SERVER_COLOR = { 3: '#1976d2', 2: '#e65100' };

export default function IFLogbookSearch() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [flights, setFlights]   = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [error, setError]       = useState(null);

  const search = useCallback(async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setError(null); setResults([]); setSelected(null); setFlights(null);
    try {
      const data = await pilotsApi.list({ search: query.trim() });
      setResults(data.pilots || []);
      if (!data.pilots?.length) setError('No pilots found.');
    } catch {
      setError('Search failed.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const loadFlights = useCallback(async (pilot) => {
    setSelected(pilot); setFlights(null); setLoadingFlights(true); setError(null);
    try {
      if (!pilot.if_user_id) { setError('This pilot has no IF account linked.'); return; }
      const data = await infiniteFlight.userFlights(pilot.if_user_id);
      const sorted = (data.result?.data || []).slice().sort((a, b) => new Date(b.created) - new Date(a.created));
      setFlights(sorted);
    } catch {
      setError('Failed to fetch IF flights.');
    } finally {
      setLoadingFlights(false);
    }
  }, []);

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>IF Logbook Search</h2>

      {/* Search */}
      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, callsign or IFC username…"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p style={{ color: '#c62828', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

      {/* Pilot results */}
      {results.length > 0 && !selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.5rem' }}>
          {results.map(p => (
            <div key={p.id} onClick={() => loadFlights(p)}
              style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <span style={{ fontWeight: 700 }}>{p.first_name} {p.last_name}</span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: '0.875rem' }}>{p.callsign}</span>
                {p.ifc_username && <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: '0.8rem' }}>@{p.ifc_username}</span>}
              </div>
              <span style={{ fontSize: '0.75rem', color: p.if_user_id ? 'var(--avg-green)' : '#c62828', fontWeight: 600 }}>
                {p.if_user_id ? 'IF linked' : 'No IF link'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selected pilot flights */}
      {selected && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <button onClick={() => { setSelected(null); setFlights(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem', lineHeight: 1 }}>←</button>
            <div>
              <span style={{ fontWeight: 700 }}>{selected.first_name} {selected.last_name}</span>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: '0.875rem' }}>{selected.callsign}</span>
            </div>
          </div>

          {loadingFlights && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading flights…</p>}

          {flights && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flights.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No flights found.</p>}
              {flights.map(f => {
                const serverColor = SERVER_COLOR[f.worldType] || '#909090';
                const serverLabel = SERVER_LABEL[f.worldType] || '—';
                return (
                  <div key={f.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.originAirport || '????'} → {f.destinationAirport || '????'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{daysAgo(f.created)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span>{fmtMins(f.totalTime)}</span>
                      <span>{f.landingCount} ldg</span>
                      <span style={{ color: serverColor, fontWeight: 600 }}>{serverLabel}</span>
                      {f.callsign && <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{f.callsign}</span>}
                      {f.violations?.length > 0 && <span style={{ color: '#c62828', fontWeight: 600 }}>⚠ {f.violations.length} violation{f.violations.length > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
