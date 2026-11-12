/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useRef } from 'react';
import { getAirport } from '../../services/airportService';

const Badge = ({ label, active, colour }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.3rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    backgroundColor: active ? `${colour}18` : 'var(--bg-hover)',
    color: active ? colour : 'var(--text-secondary)',
    border: `1px solid ${active ? colour + '40' : 'var(--border-color)'}`,
    opacity: active ? 1 : 0.5,
  }}>
    <span style={{
      width: '6px', height: '6px', borderRadius: '50%',
      backgroundColor: active ? colour : 'var(--text-secondary)',
      flexShrink: 0,
    }} />
    {label}
  </span>
);

function AirportInfo() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const composingRef = useRef(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setNotFound(false);
    setResult(null);

    const airport = await getAirport(query.trim().toUpperCase());
    if (airport) {
      setResult(airport);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  };

  const fields = result ? [
    { label: 'ICAO',       value: result.icao,                    mono: true },
    { label: 'IATA',       value: result.iata || '—',             mono: true },
    { label: 'Name',       value: result.name },
    { label: 'City',       value: result.city || '—' },
    { label: 'State',      value: result.state || '—' },
    { label: 'Country',    value: result.country || '—' },
    { label: 'Elevation',  value: result.elevation != null ? `${result.elevation} ft` : '—' },
    { label: 'Timezone',   value: result.timezone || '—' },
    { label: 'Latitude',   value: result.lat?.toFixed(6),         mono: true },
    { label: 'Longitude',  value: result.lng?.toFixed(6),         mono: true },
    { label: 'Frequencies', value: result.frequenciesCount ?? '—' },
    { label: 'Class',      value: result.class != null ? `Class ${result.class}` : '—' },
  ] : [];

  return (
    <div>
      <div className="card">
        <h3>Airport Lookup</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Search any of the 30,000+ airports in the Infinite Flight database by ICAO code.
        </p>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <input
            type="text"
            value={query}
            onChange={e => { if (!composingRef.current) setQuery(e.target.value.toUpperCase()); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => { composingRef.current = false; setQuery(e.target.value.toUpperCase()); }}
            placeholder="Enter ICAO code (e.g. YSSY)"
            maxLength={4}
            style={{ width: '220px', fontFamily: 'monospace', letterSpacing: '2px', fontSize: '1rem' }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.5rem', opacity: loading || !query.trim() ? 0.6 : 1 }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {notFound && (
          <div style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}>
            No airport found for <strong>{query}</strong>. Check the ICAO code and try again.
          </div>
        )}

        {result && (
          <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              backgroundColor: 'var(--bg-hover)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}>
              <span style={{
                fontSize: '1.5rem', fontWeight: 700,
                fontFamily: 'monospace', letterSpacing: '2px',
                color: 'var(--avg-green)',
              }}>
                {result.icao}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{result.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {[result.city, result.state, result.country].filter(Boolean).join(', ')}
                </div>
              </div>
            </div>

            {/* IF Features badges */}
            <div style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>
                IF Features
              </span>
              <Badge label="3D Buildings"     active={result.has3dBuildings}     colour="#3b82f6" />
              <Badge label="Jetbridges"       active={result.hasJetbridges}       colour="#10b981" />
              <Badge label="Safedock"         active={result.hasSafedockUnits}    colour="#8b5cf6" />
              <Badge label="Taxiway Routing"  active={result.hasTaxiwayRouting}   colour="#f59e0b" />
            </div>

            {/* Fields grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 0,
            }}>
              {fields.map((field, i) => (
                <div key={field.label} style={{
                  padding: '0.875rem 1.5rem',
                  borderBottom: i < fields.length - 2 ? '1px solid var(--border-color)' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid var(--border-color)' : 'none',
                }}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '0.25rem',
                  }}>
                    {field.label}
                  </div>
                  <div style={{ fontWeight: 500, fontFamily: field.mono ? 'monospace' : 'inherit' }}>
                    {field.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Map link */}
            <div style={{
              padding: '0.875rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', gap: '0.75rem',
            }}>
              <a
                href={`https://www.google.com/maps?q=${result.lat},${result.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.875rem', fontWeight: 600,
                  color: 'var(--avg-green)', textDecoration: 'none',
                }}
              >
                View on Google Maps ↗
              </a>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default AirportInfo;
