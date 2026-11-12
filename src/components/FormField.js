/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';

export const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  border: '1.5px solid var(--border-color)',
  borderRadius: '7px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

export const labelStyle = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.35rem',
};

export const hintStyle = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  marginTop: '0.35rem',
};

// Components

export function Label({ children, optional, hint, style, ...rest }) {
  return (
    <label style={{ ...labelStyle, ...style }} {...rest}>
      {children}
      {optional && (
        <span style={{ textTransform: 'none', fontWeight: 400 }}> (optional)</span>
      )}
      {hint && (
        <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-secondary)' }}> {hint}</span>
      )}
    </label>
  );
}

export const TextInput = React.forwardRef(function TextInput({ mono, style, ...rest }, ref) {
  return (
    <input
      ref={ref}
      style={{ ...inputStyle, ...(mono ? { fontFamily: 'monospace' } : null), ...style }}
      {...rest}
    />
  );
});

export const TextArea = React.forwardRef(function TextArea({ mono, style, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      style={{ ...inputStyle, resize: 'vertical', ...(mono ? { fontFamily: 'monospace' } : null), ...style }}
      {...rest}
    />
  );
});

export function Select({ style, children, ...rest }) {
  return (
    <select style={{ ...inputStyle, cursor: 'pointer', ...style }} {...rest}>
      {children}
    </select>
  );
}

export function FormField({ label, optional, hint, note, children }) {
  return (
    <div style={{ marginBottom: '0.7rem' }}>
      {label && <Label optional={optional} hint={hint}>{label}</Label>}
      {children}
      {note && <div style={hintStyle}>{note}</div>}
    </div>
  );
}
