/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

const SEARCH_THRESHOLD = 8; // show search input when there are this many options

function Dropdown({ options, value, onChange, placeholder = 'Select...', disabled = false, searchPlaceholder }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const buttonRef  = useRef(null);
  const menuRef    = useRef(null);
  const searchRef  = useRef(null);
  const composingRef = useRef(false);

  const selected    = options.find(o => o.value === value);
  const searchable  = options.length >= SEARCH_THRESHOLD;

  const filtered = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuHeight = Math.min(filtered.length * 44 + (searchable ? 48 : 0), 300);
    const goUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    return {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      backgroundColor: 'var(--bg-card)',
      border: '1.5px solid var(--avg-green)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      zIndex: 99999,
      maxHeight: '300px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...(goUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    };
  }, [filtered.length, searchable]);

  const openMenu = () => {
    if (disabled) return;
    if (!open) {
      setMenuStyle(calcPosition());
      setQuery('');
    }
    setOpen(o => !o);
  };

  // Focus search input when menu opens
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setMenuStyle(calcPosition());
    };
    const handleResize = () => setMenuStyle(calcPosition());
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, calcPosition]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
    setQuery('');
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={openMenu}
        style={{
          width: '100%',
          padding: '0.75rem 2.5rem 0.75rem 1rem',
          backgroundColor: 'var(--bg-card)',
          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
          border: `1.5px solid ${open ? 'var(--avg-green)' : 'var(--border-color)'}`,
          borderRadius: '8px',
          fontSize: '1rem',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          boxShadow: open ? '0 0 0 3px rgba(var(--brand-primary-rgb),0.1)' : 'none',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={open ? 'var(--avg-green)' : 'var(--text-secondary)'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, marginLeft: '0.5rem', transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && ReactDOM.createPortal(
        <div ref={menuRef} style={menuStyle}>
          {/* Search box */}
          {searchable && (
            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
                  style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => { if (!composingRef.current) setQuery(e.target.value); }}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={e => { composingRef.current = false; setQuery(e.target.value); }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
                    if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value);
                  }}
                  placeholder={searchPlaceholder || 'Search…'}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.45rem 0.75rem 0.45rem 2rem',
                    border: '1px solid var(--border-color)', borderRadius: '6px',
                    fontSize: '0.875rem', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                {query && (
                  <button onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
                No results for "{query}"
              </div>
            ) : filtered.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  background: option.value === value ? 'rgba(var(--brand-primary-rgb),0.06)' : 'none',
                  border: 'none',
                  borderBottom: index < filtered.length - 1 ? '1px solid var(--border-color)' : 'none',
                  color: option.value === value ? 'var(--avg-green)' : 'var(--text-primary)',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: option.value === value ? 600 : 400,
                }}
                onMouseEnter={e => { if (option.value !== value) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (option.value !== value) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{option.label}</span>
                {option.value === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="var(--avg-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Dropdown;
