/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { auth, ifAuth } from '../api/client';
import { loadSettings, getCachedSettings } from '../services/settingsService';
import { useAuthTransition } from '../hooks/useAuthTransition';

import brand from '../brand';

const logo = brand.logos.light;
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authBg, setAuthBg] = useState(() => getCachedSettings()?.auth_background || '');
  const [ifStarting, setIfStarting] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cardTransitionStyle, go } = useAuthTransition(navigate);

  useEffect(() => {
    loadSettings().then(settings => {
      setAuthBg(settings.auth_background || '');
    });
  }, []);

  useEffect(() => {
    const code = searchParams.get('if_login_code');
    const ifError = searchParams.get('if_login_error');

    if (code) {
      ifAuth.exchange(code)
        .then(data => onLogin(data.token, data.user))
        .catch(err => setError(err.message))
        .finally(() => setSearchParams({}, { replace: true }));
    } else if (ifError) {
      setError(ifError);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIfLogin = async () => {
    setError('');
    setIfStarting(true);
    try {
      const { authUrl } = await ifAuth.start();
      window.location.href = authUrl;
    } catch (err) {
      setError(err.message || 'Could not start Infinite Flight sign-in.');
      setIfStarting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await auth.login(email, password);
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      background: authBg ? 'none' : 'linear-gradient(135deg, var(--avg-green) 0%, var(--avg-green-dark) 100%)',
    }}>
      {authBg && (
        <>
          <div style={{
            position: 'fixed', inset: 0,
            backgroundImage: `url(${authBg})`,
            backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0,
          }} />
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1 }} />
        </>
      )}

      <div className="auth-card" style={{
        background: 'rgba(255, 255, 255, 0.86)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        padding: '3rem', borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%',
        maxWidth: '400px', position: 'relative', zIndex: 2,
        ...cardTransitionStyle,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src={logo}
            alt={brand.name}
            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
          />
        </div>
        <p style={{ textAlign: 'center', color: '#6e6e6e', marginBottom: '2rem' }}>
          Crew Centre Login
        </p>

        <button
          type="button"
          onClick={handleIfLogin}
          disabled={ifStarting}
          className="btn"
          style={{
            width: '100%', marginBottom: '1.25rem', padding: '0.75rem',
            background: '#1f2a26', color: '#fff', border: 'none', borderRadius: '8px',
            fontWeight: 600, cursor: ifStarting ? 'default' : 'pointer', opacity: ifStarting ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
          }}
        >
          <Plane size={18} strokeWidth={2.2} aria-hidden="true" style={{ transform: 'rotate(45deg)' }} />
          {ifStarting ? 'Redirecting to Infinite Flight…' : 'Continue with Infinite Flight'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0 0 1.5rem', color: '#a3aca6', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: '1px', background: '#e2e5e2' }} />
          or sign in with email
          <div style={{ flex: 1, height: '1px', background: '#e2e5e2' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={{ textAlign: 'center', color: '#6e6e6e', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            <span onClick={() => navigate('/forgot-password')} style={{ color: 'var(--avg-green)', cursor: 'pointer', fontWeight: 600 }}>
              Forgot password?
            </span>
          </p>
          <p style={{ textAlign: 'center', color: '#6e6e6e', fontSize: '0.9rem' }}>
            Don't have an account?{' '}
            <span onClick={() => go('/signup')} style={{ color: 'var(--avg-green)', cursor: 'pointer', fontWeight: 600 }}>
              Sign Up
            </span>
          </p>
        </form>
      </div>
    </div>
  );
}

export default Login;
