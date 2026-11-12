/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { Plane, ArrowRight, X } from 'lucide-react';
import { infiniteFlight, routes } from '../api/client';
import { cacheGet, cacheSet } from '../cache';
import { useNavigate } from 'react-router-dom';

const EXPERT_SERVER_ID = 'ed323139-baa7-4834-b9d6-5fb9f19ff11e';

const ATC_PRIORITY = { 1: 6, 4: 5, 5: 4, 6: 3, 3: 2, 0: 1, 7: 0, 2: -1 };
const ATC_LABEL    = { 0: 'GND', 1: 'TWR', 3: 'CLR', 4: 'APP', 5: 'DEP', 6: 'CTR', 7: 'ATIS' };
const ATC_COLOUR   = { 0: '#795548', 1: '#2e7d32', 3: '#9c27b0', 4: '#1976d2', 5: '#0097a7', 6: '#388e3c', 7: '#f57c00' };

function parseAircraft(raw) {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).trim();
  } catch { }

  if (typeof raw === 'string') {
    const first = raw.split('|')[0].split(',')[0].trim();
    return first || null;
  }
  return null;
}

function pickRoutes(allRoutes, max = 4) {
  const seen = new Set();
  const picked = [];
  const sorted = [...allRoutes].sort((a, b) =>
    a.direction === b.direction ? 0 : a.direction === 'dep' ? -1 : 1
  );
  // First pass: one per unique other-end airport
  for (const r of sorted) {
    if (picked.length >= max) break;
    const otherEnd = r.direction === 'dep' ? r.arrival_icao : r.departure_icao;
    if (!seen.has(otherEnd)) { seen.add(otherEnd); picked.push(r); }
  }
  // Second pass: fill with anything remaining
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!picked.find(p => p.id === r.id)) picked.push(r);
  }
  return picked;
}

function ATCBadge({ type }) {
  const label  = ATC_LABEL[type];
  const colour = ATC_COLOUR[type];
  if (!label) return null;
  return (
    <span style={{
      padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.68rem',
      fontWeight: 700, letterSpacing: '0.03em',
      background: colour + '18', color: colour, border: `1px solid ${colour}35`,
    }}>
      {label}
    </span>
  );
}

function RouteRow({ r, onNavigate }) {
  const isDep = r.direction === 'dep';
  return (
    <div
      onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
        background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
        transition: 'border-color 0.15s, background 0.15s', gap: '0.6rem',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.35rem',
            borderRadius: '3px', flexShrink: 0,
            background: isDep ? 'rgba(21,101,192,0.1)' : 'rgba(46,125,50,0.1)',
            color: isDep ? '#1565c0' : '#2e7d32',
          }}>
            {isDep ? 'DEP' : 'ARR'}
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>{r.flight_number}</span>
          <span style={{
            fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>
            {r.departure_icao} → {r.arrival_icao}
          </span>
        </div>
        {r.aircraft && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem',
            fontSize: '0.72rem', color: 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <Plane size={11} strokeWidth={2.2} style={{ flexShrink: 0, opacity: 0.65, transform: 'rotate(45deg)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.aircraft}</span>
          </div>
        )}
      </div>
      <ArrowRight size={14} strokeWidth={2.5} style={{ color: 'var(--avg-green)', flexShrink: 0 }} />
    </div>
  );
}

function Modal({ matched, onClose, onNavigate, onSeeRoutes }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
          width: '100%', maxWidth: '540px',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--avg-green)', opacity: 0.4, animation: 'atc-ping 1.5s ease-out infinite' }} />
              <span style={{ borderRadius: '50%', width: 10, height: 10, background: 'var(--avg-green)', display: 'block' }} />
            </span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Recommended Routes · Live ATC</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem', borderRadius: '6px', display: 'flex' }}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {matched.map(ap => (
            <div key={ap.icao}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}>{ap.icao}</span>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {ap.atc.map(f => <ATCBadge key={f.frequencyId} type={f.type} />)}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>↓ {ap.inbound} · ↑ {ap.outbound}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {ap.routes.map(r => (
                  <RouteRow key={r.id} r={r} onNavigate={() => onNavigate(r)} />
                ))}
                {ap.totalRoutes > ap.routes.length && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.2rem 0.1rem' }}>
                    +{ap.totalRoutes - ap.routes.length} more · see{' '}
                    <span
                      onClick={() => onSeeRoutes(ap.icao)}
                      style={{ color: 'var(--avg-green)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Routes
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
          Routes served by live ATC on the Expert Server · Click any route to file a PIREP
        </div>
      </div>
    </div>
  );
}

export default function ActiveATCCard() {
  const navigate  = useNavigate();
  const [matched,   setMatched]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      let allRoutes = cacheGet('atc-card-routes');
      if (!allRoutes) {
        const routesRes = await routes.list({ fields: 'id,flight_number,departure_icao,arrival_icao,aircraft' });
        allRoutes = routesRes.routes || [];
        cacheSet('atc-card-routes', allRoutes, 15 * 60 * 1000);
      }

      const worldRes = await infiniteFlight.world(EXPERT_SERVER_ID);
      const withATC   = (worldRes.result || []).filter(a => a.atcFacilities?.length > 0);
      const matchMap  = {};

      for (const airport of withATC) {
        const icao = airport.airportIcao?.toUpperCase();
        if (!icao) continue;
        const matching = allRoutes.filter(r =>
          r.departure_icao?.toUpperCase() === icao ||
          r.arrival_icao?.toUpperCase()   === icao
        );
        if (matching.length === 0) continue;

        const mappedRoutes = matching.map(r => ({
          id:             r.id,
          flight_number:  r.flight_number,
          departure_icao: r.departure_icao?.toUpperCase(),
          arrival_icao:   r.arrival_icao?.toUpperCase(),
          aircraft:       parseAircraft(r.aircraft),
          direction:      r.departure_icao?.toUpperCase() === icao ? 'dep' : 'arr',
        }));

        matchMap[icao] = {
          icao,
          inbound:     airport.inboundFlightsCount  || 0,
          outbound:    airport.outboundFlightsCount || 0,
          atc: airport.atcFacilities
            .filter(f => f.type !== 2)
            .sort((a, b) => (ATC_PRIORITY[b.type] || 0) - (ATC_PRIORITY[a.type] || 0)),
          routes:      pickRoutes(mappedRoutes, 4),
          totalRoutes: matching.length,
        };
      }

      const sorted = Object.values(matchMap).sort((a, b) => {
        const aHasTwr = a.atc.some(f => f.type === 1) ? 1 : 0;
        const bHasTwr = b.atc.some(f => f.type === 1) ? 1 : 0;
        if (bHasTwr !== aHasTwr) return bHasTwr - aHasTwr;
        return (b.inbound + b.outbound) - (a.inbound + a.outbound);
      });

      setMatched(sorted);
      setError(null);
    } catch (err) {
      console.error('ActiveATCCard:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 90000);
    return () => clearInterval(t);
  }, [load]);

  const handleNavigate = (r) => {
    setModalOpen(false);
    navigate('/log-flight', { state: { prefill: {
      flight_number:  r.flight_number,
      departure_icao: r.departure_icao,
      arrival_icao:   r.arrival_icao,
      aircraft:       r.aircraft || '',
    }}});
  };

  const handleSeeRoutes = (icao) => {
    setModalOpen(false);
    navigate('/routes', { state: { presetSearch: icao } });
  };

  if (!loading && !error && matched.length === 0) return null;

  const top = matched[0];

  return (
    <>
      <style>{`
        @keyframes atc-ping {
          0%   { transform: scale(1);   opacity: 0.4; }
          80%  { transform: scale(2.5); opacity: 0;   }
          100% { transform: scale(2.5); opacity: 0;   }
        }
      `}</style>

      <div
        onClick={() => !loading && !error && setModalOpen(true)}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderLeft: '4px solid var(--avg-green)', borderRadius: '10px',
          padding: '1rem 1.25rem', height: '100%', boxSizing: 'border-box',
          cursor: (!loading && !error) ? 'pointer' : 'default',
          transition: 'box-shadow 0.2s ease', boxShadow: '0 1px 3px var(--shadow)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}
        onMouseEnter={e => { if (!loading && !error) e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow-hover)'; }}
        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px var(--shadow)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--avg-green)', opacity: 0.4, animation: 'atc-ping 1.5s ease-out infinite' }} />
            <span style={{ borderRadius: '50%', width: 10, height: 10, background: 'var(--avg-green)', display: 'block' }} />
          </span>

          {loading ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading live ATC…</span>
          ) : error ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>ATC unavailable</span>
          ) : (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem', letterSpacing: '0.05em' }}>{top.icao}</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {top.atc.slice(0, 3).map(f => <ATCBadge key={f.frequencyId} type={f.type} />)}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Recommended routes · {matched.length} airport{matched.length !== 1 ? 's' : ''} with live ATC
              </div>
            </div>
          )}
        </div>

        {!loading && !error && (
          <ArrowRight size={16} strokeWidth={2.5} style={{ color: 'var(--avg-green)', flexShrink: 0 }} />
        )}
      </div>

      {modalOpen && (
        <Modal matched={matched} onClose={() => setModalOpen(false)} onNavigate={handleNavigate} onSeeRoutes={handleSeeRoutes} />
      )}
    </>
  );
}
