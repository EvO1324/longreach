/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../api/client';
import brand from '../brand';

const logo = brand.logos.light;

function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong');
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

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📧</div>
            <h3 style={{ color: '#2d2d2d', marginBottom: '0.75rem' }}>Check your email</h3>
            <p style={{ color: '#6e6e6e', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox — it may take a minute.
            </p>
            <button onClick={() => navigate('/')} className="btn btn-primary" style={{ width: '100%' }}>
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ textAlign: 'center', color: '#2d2d2d', marginBottom: '0.5rem' }}>Forgot Password</h3>
            <p style={{ textAlign: 'center', color: '#6e6e6e', marginBottom: '2rem', fontSize: '0.9rem' }}>
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d' }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus placeholder="your@email.com"
                />
              </div>

              {error && (
                <div style={{ padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
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

export default ForgotPassword;
