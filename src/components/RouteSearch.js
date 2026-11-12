/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useState, useEffect, useRef } from 'react';
import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// Helpers

function getAircraft(route) {
  if (!route?.aircraft) return [];
  if (Array.isArray(route.aircraft)) return route.aircraft;
  const t = String(route.aircraft).trim();
  if (t.startsWith('[')) { try { return JSON.parse(t); } catch (_) {} }
  return t ? [t] : [];
}

function scoreRoute(route, q) {
  const fn  = (route.flight_number  || '').toLowerCase();
  const dep = (route.departure_icao || '').toLowerCase();
  const arr = (route.arrival_icao   || '').toLowerCase();
  const ql  = q.toLowerCase().trim();
  if (!ql) return 0;
  if (fn === ql)                          return 100;
  if (fn.startsWith(ql))                  return 80;
  if (fn.includes(ql))                    return 60;
  if (dep === ql || arr === ql)           return 75;
  if (dep.startsWith(ql) || arr.startsWith(ql)) return 55;
  const route_str  = dep + arr;
  const route_dash = dep + '-' + arr;
  if (route_str.includes(ql.replace('-', '')) || route_dash.includes(ql)) return 50;
  if (dep.includes(ql) || arr.includes(ql))   return 30;
  return 0;
}

// Component

export default function RouteSearch({
  routes = [],
  onSelect,
  excludeIds = [],
  disabled = false,
  placeholder = 'Search flight number or ICAO…',
}) {
  const [query,      setQuery]    = useState('');
  const [focused,    setFocused]  = useState(false);
  const [dropPos,    setDropPos]  = useState(null);
  const inputRef      = useRef(null);
  const containerRef  = useRef(null);
  const composingRef  = useRef(false);

  const q = query.trim();
  const results = q.length >= 1
    ? routes
        .filter(r => !excludeIds.includes(r.id))
        .map(r => ({ r, score: scoreRoute(r, q) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.r)
    : [];

  const showDropdown = focused && results.length > 0;

  // Portal: position dropdown under the input
  useLayoutEffect(() => {
    if (!showDropdown || !inputRef.current) { setDropPos(null); return; }
    const rect = inputRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width });
  }, [showDropdown, query]);

  // Close on outside click
  useEffect(() => {
    const h = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleSelect = (route) => {
    onSelect(route);
    setQuery('');
    setFocused(false);
  };

  const dropdown = showDropdown && dropPos ? createPortal(
    <div style={{
      position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width,
      zIndex: 9999, background: 'var(--bg-card)',
      border: '1.5px solid var(--avg-green)', borderTop: 'none',
      borderRadius: '0 0 10px 10px', boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
      overflow: 'hidden',
    }}>
      {results.map((route, i) => {
        const ac = getAircraft(route);
        return (
          <button key={route.id} type="button"
            onMouseDown={e => { e.preventDefault(); handleSelect(route); }}
            style={{ width: '100%', padding: '0.65rem 1rem', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--brand-primary-rgb),0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.875rem', minWidth: 60, color: 'var(--avg-green)' }}>{route.flight_number}</span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{route.departure_icao}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>→</span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{route.arrival_icao}</span>
            {route.distance_nm && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto', flexShrink: 0 }}>
                {Math.round(route.distance_nm)} nm
              </span>
            )}
            {ac.length > 0 && (
              <span style={{ padding: '0.1rem 0.4rem', background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>
                {ac[0].split(' - ')[0]}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
          style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { if (!composingRef.current) setQuery(e.target.value); }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={e => { composingRef.current = false; setQuery(e.target.value); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          disabled={disabled}
          placeholder={disabled ? 'Day is full' : placeholder}
          style={{
            width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', boxSizing: 'border-box',
            border: `1.5px solid ${focused && !disabled ? 'var(--avg-green)' : 'var(--border-color)'}`,
            borderRadius: '8px',
            fontSize: '0.875rem', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            outline: 'none', opacity: disabled ? 0.5 : 1, transition: 'border-color 0.15s',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      {dropdown}
    </div>
  );
}
