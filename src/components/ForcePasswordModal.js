/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';
import { pilots } from '../api/client';

// Force Password Change Modal
function ForcePasswordModal({ onDone }) {
  const [form, setForm]       = React.useState({ current: '', next: '', confirm: '' });
  const [error, setError]     = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) { setError('New passwords do not match'); return; }
    if (form.next.length < 8)       { setError('Password must be at least 8 characters'); return; }
    try {
      setLoading(true);
      await pilots.changePassword({ current_password: form.current, new_password: form.next });
      onDone();
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem', marginTop: '0.35rem',
    border: '1.5px solid var(--border-color)', borderRadius: '8px',
    fontSize: '0.95rem', backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '14px',
        padding: '2rem', width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e65100" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Password Reset Required</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          An admin has reset your password. You must set a new password before continuing.
        </p>
        <form onSubmit={handleSubmit}>
          {[
            { key: 'current', label: 'Temporary Password',   ph: 'Enter the temporary password' },
            { key: 'next',    label: 'New Password',          ph: 'At least 8 characters' },
            { key: 'confirm', label: 'Confirm New Password',  ph: 'Repeat new password' },
          ].map(({ key, label, ph }) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
              <input
                type="password" required value={form[key]} placeholder={ph}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={inputStyle}
              />
            </div>
          ))}
          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.6rem 0.875rem', background: 'rgba(198,40,40,0.07)', border: '1px solid #ffcdd2', borderRadius: '6px', fontSize: '0.875rem', color: '#c62828' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '0.85rem', background: 'var(--avg-green)', color: 'white',
            border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Saving...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ForcePasswordModal;
