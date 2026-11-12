/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../api/client';
import brand from '../brand';

const logo = brand.logos.light;

function ResetPassword() {
  const [searchParams]        = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) setError('Invalid reset link — please request a new one.');
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
      background: 'linear-gradient(135deg, var(--avg-green) 0%, var(--avg-green-dark) 100%)',
    }}>
      <div style={{
        background: 'white', padding: '3rem', borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src={logo} alt={brand.name} style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }} />
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ color: '#2d2d2d', marginBottom: '0.75rem' }}>Password Updated</h3>
            <p style={{ color: '#6e6e6e', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Your password has been changed. You can now log in.
            </p>
            <button onClick={() => navigate('/')} className="btn btn-primary" style={{ width: '100%' }}>
              Go to Login
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ textAlign: 'center', color: '#2d2d2d', marginBottom: '0.5rem' }}>Set New Password</h3>
            <p style={{ textAlign: 'center', color: '#6e6e6e', marginBottom: '2rem', fontSize: '0.9rem' }}>
              Choose a new password for your account.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d' }}>New Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required autoFocus minLength={8} placeholder="At least 8 characters"
                  disabled={!token}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d' }}>Confirm Password</label>
                <input
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="Repeat password"
                  disabled={!token}
                />
              </div>

              {error && (
                <div style={{ padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !token} className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
                {loading ? 'Updating…' : 'Update Password'}
              </button>

              <p style={{ textAlign: 'center', color: '#6e6e6e', fontSize: '0.9rem' }}>
                <span onClick={() => navigate('/')} style={{ color: 'var(--avg-green)', cursor: 'pointer', fontWeight: 600 }}>
                  ← Back to Login
                </span>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
