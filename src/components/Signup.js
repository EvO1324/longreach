/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { auth, ifAuth } from '../api/client';
import { loadSettings, getCachedSettings } from '../services/settingsService';
import { LEGAL_DOCS, LAST_UPDATED } from '../pages/Legal';
import { useAuthTransition } from '../hooks/useAuthTransition';

import brand, { callsign } from '../brand';

const logo = brand.logos.light;
const MIN_GRADE = Number(brand.requirements?.minimumGrade) || 0;
function Signup() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    ifcUsername: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gradeCheck, setGradeCheck] = useState({ status: 'idle', grade: null });
  const [blocked, setBlocked] = useState(false);
  const [showTosModal, setShowTosModal] = useState(false);
  const [tosDocId, setTosDocId] = useState('terms');
  const [scrolledDocs, setScrolledDocs] = useState({});
  const tosBodyRef = useRef(null);
  const navigate = useNavigate();
  const { cardTransitionStyle, go } = useAuthTransition(navigate);
  const [searchParams, setSearchParams] = useSearchParams();
  const bypassCode = searchParams.get('code');
  const [ifSignupToken, setIfSignupToken] = useState(null);
  const [ifVerified, setIfVerified] = useState(false);
  const [ifStarting, setIfStarting] = useState(false);
  const [authBg, setAuthBg] = useState(() => getCachedSettings()?.auth_background || '');

  useEffect(() => {
    loadSettings().then(settings => {
      setAuthBg(settings.auth_background || '');
    });
  }, []);

  useEffect(() => {
    const token = searchParams.get('if_signup_token');
    if (!token) return;

    setIfSignupToken(token);
    setIfVerified(true);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('if_signup_token');
      return next;
    }, { replace: true });

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.if_username) {
        setFormData(prev => ({ ...prev, ifcUsername: payload.if_username }));
        checkGrade(payload.if_username);
        checkBlocked(payload.if_username);
      }
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIfSignupStart = async () => {
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

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const checkGrade = async (username) => {
    const u = username.trim();
    if (!u) { setGradeCheck({ status: 'idle', grade: null }); return; }
    setGradeCheck({ status: 'checking', grade: null });
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/if/grade-check?username=${encodeURIComponent(u)}`);
      const data = await res.json();
      if (!data.found) {
        setGradeCheck({ status: 'unknown', grade: null });
        return;
      }
      setGradeCheck({ status: data.grade >= MIN_GRADE ? 'eligible' : 'ineligible', grade: data.grade });
    } catch {
      setGradeCheck({ status: 'unknown', grade: null });
    }
  };

  const checkBlocked = async (username) => {
    const u = username.trim();
    if (!u) { setBlocked(false); return; }
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/watchlist/check?username=${encodeURIComponent(u)}`);
      const data = await res.json();
      setBlocked(!!data.blocked);
    } catch {
      setBlocked(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (gradeCheck.status === 'ineligible') {
      setError('You must be Grade 3 or above in Infinite Flight to apply.');
      return;
    }

    if (blocked) {
      setError('Your account is currently listed on the IFVARB blacklist, this means we cannot accept your application at this time.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setTosDocId('terms');
    setScrolledDocs({});
    setShowTosModal(true);
  };

  useEffect(() => {
    const el = tosBodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
    if (el.scrollHeight - el.clientHeight < 24) {
      setScrolledDocs(prev => ({ ...prev, [tosDocId]: true }));
    }
  }, [tosDocId]);

  const handleTosScroll = () => {
    const el = tosBodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) setScrolledDocs(prev => ({ ...prev, [tosDocId]: true }));
  };

  const canAcceptTos = LEGAL_DOCS.every(doc => scrolledDocs[doc.id]);

  const handleDeclineTos = () => {
    setShowTosModal(false);
    setError('You need to accept the Terms of Service and Privacy Policy to create an account.');
  };

  const handleAcceptTos = async () => {
    setShowTosModal(false);
    setError('');
    setLoading(true);
    try {
      await auth.signup(formData.email, formData.password, {
        ...(bypassCode ? { bypass_code: bypassCode } : {}),
        ...(ifSignupToken ? { if_signup_token: ifSignupToken } : {}),
        first_name: formData.firstName,
        last_name: formData.lastName,
        ifc_username: formData.ifcUsername,
        tos_accepted: true,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', position: 'relative',
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
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: '400px', textAlign: 'center', position: 'relative', zIndex: 2,
          ...cardTransitionStyle,
        }}>
          <img
            src={logo}
            alt={brand.name}
            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain', marginBottom: '1.5rem' }}
          />
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
          <h2 style={{ color: 'var(--brand-primary)', marginBottom: '1rem' }}>{bypassCode ? 'Re-Registration Received!' : 'Application Received!'}</h2>
          <p style={{ color: '#6e6e6e', marginBottom: '0.75rem' }}>
            {bypassCode ? <>Welcome back, <strong>{formData.firstName}</strong>! Head to Discord and run <strong>/verify</strong> to reactivate your account.</> : <>Thanks, <strong>{formData.firstName}</strong>! Your application has been recieved.</>}
          </p>
          <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#2d2d2d', fontSize: '0.9rem' }}>What happens next?</p>
            <p style={{ margin: 0, color: '#6e6e6e', fontSize: '0.875rem' }}>
              {bypassCode ? 'Once you verify in Discord your account will be fully reactivated and you can log in.' : "Keep an eye on your IFC messages - we'll be in touch shortly with next steps to get you verified and flying with the virtual airline."}
            </p>
          </div>
          <button onClick={() => go('/')} style={{ width: '100%', background: 'none', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '0.75rem', cursor: 'pointer', color: '#6e6e6e', fontSize: '0.875rem' }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', position: 'relative',
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
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: '500px', position: 'relative', zIndex: 2,
        ...cardTransitionStyle,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src={logo}
            alt={brand.name}
            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
          />
        </div>
        <p style={{ textAlign: 'center', color: '#6e6e6e', marginBottom: '2rem' }}>{bypassCode ? 'Current Pilot Registration' : 'Join Our Crew'}</p>

        {!ifVerified && (
          <>
            <button
              type="button"
              onClick={handleIfSignupStart}
              disabled={ifStarting}
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
              or sign up with email
              <div style={{ flex: 1, height: '1px', background: '#e2e5e2' }} />
            </div>
          </>
        )}

        <form onSubmit={handleFormSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>First Name</label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '1rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>Last Name</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '1rem' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>IFC Username</label>
            <div style={{ position: 'relative' }}>
              <input type="text" name="ifcUsername" value={formData.ifcUsername} onChange={handleChange} required
                onBlur={e => { checkGrade(e.target.value); checkBlocked(e.target.value); }}
                placeholder="Your Infinite Flight Community username"
                readOnly={ifVerified}
                style={{ width: '100%', padding: '0.75rem', border: `1px solid ${blocked || gradeCheck.status === 'ineligible' ? '#c62828' : (ifVerified || gradeCheck.status === 'eligible') ? '#2e7d32' : '#e8e8e8'}`, borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', transition: 'border-color 0.2s', background: ifVerified ? '#f6faf7' : '#fff' }} />
              {gradeCheck.status === 'checking' && (
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6e6e6e', fontWeight: 600 }}>Checking...</div>
              )}
            </div>

            {ifVerified && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <small style={{ color: '#2e7d32', fontSize: '0.8rem', fontWeight: 600 }}>Verified via Infinite Flight — locked in</small>
              </div>
            )}

            {blocked && (
              <div style={{ marginTop: '0.6rem', padding: '0.75rem 1rem', background: '#ffebee', border: '1px solid rgba(198,40,40,0.3)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, color: '#c62828', fontSize: '0.875rem', marginBottom: '0.2rem' }}>IFVARB BLACKLISTED</div>
                <div style={{ color: '#c62828', fontSize: '0.8rem' }}>Your account is currently listed on the IFVARB blacklist, this means we cannot accept your application at this time.</div>
              </div>
            )}

            {!blocked && gradeCheck.status === 'ineligible' && (
              <div style={{ marginTop: '0.6rem', padding: '0.75rem 1rem', background: '#ffebee', border: '1px solid rgba(198,40,40,0.3)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, color: '#c62828', fontSize: '0.875rem', marginBottom: '0.2rem' }}>Not Eligible — Grade {gradeCheck.grade}</div>
                <div style={{ color: '#c62828', fontSize: '0.8rem' }}>{brand.shortName} requires Grade {MIN_GRADE} or above in Infinite Flight. Keep flying and come back when you reach Grade 3.</div>
              </div>
            )}

            {!blocked && gradeCheck.status === 'eligible' && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <small style={{ color: '#2e7d32', fontSize: '0.8rem', fontWeight: 600 }}>Grade {gradeCheck.grade} - eligible to apply</small>
              </div>
            )}

            {!blocked && gradeCheck.status === 'unknown' && (
              <small style={{ color: '#e65100', fontSize: '0.8rem', marginTop: '0.35rem', display: 'block' }}>Could not verify IFC username — please double-check your spelling. Your application will be reviewed manually.</small>
            )}

            {!blocked && gradeCheck.status === 'idle' && (
              <small style={{ color: '#6e6e6e', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                Your callsign will be automatically assigned (e.g., {callsign.format(callsign.min + 23)})
              </small>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '1rem' }} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>Password</label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '1rem' }} />
            {formData.password.length > 0 && (() => {
              const p = formData.password;
              const score = [p.length >= 8, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
              const levels = [
                { label: 'Too short', color: '#e53935', width: '20%' },
                { label: 'Weak',      color: '#e53935', width: '35%' },
                { label: 'Fair',      color: '#fb8c00', width: '60%' },
                { label: 'Good',      color: '#43a047', width: '80%' },
                { label: 'Strong',    color: '#2e7d32', width: '100%' },
              ];
              const lvl = p.length < 8 ? levels[0] : levels[score];
              return (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ height: 4, borderRadius: 2, background: '#e8e8e8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: lvl.width, background: lvl.color, borderRadius: 2, transition: 'width 0.2s, background 0.2s' }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: lvl.color, marginTop: '0.25rem', fontWeight: 600 }}>{lvl.label}</div>
                </div>
              );
            })()}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#2d2d2d', fontSize: '0.9rem' }}>Confirm Password</label>
            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '1rem' }} />
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <p style={{ textAlign: 'center', color: '#8a8a8a', fontSize: '0.78rem', marginBottom: '1rem' }}>
            You'll be asked to read and accept the {brand.name} Terms of Service and Privacy Policy before your account is created.
          </p>

          <button
            type="submit"
            disabled={loading || blocked || gradeCheck.status === 'ineligible'}
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '1rem', opacity: (blocked || gradeCheck.status === 'ineligible') ? 0.5 : 1 }}
          >
            {loading ? 'Creating Account...' : blocked ? 'Not Available' : gradeCheck.status === 'ineligible' ? 'Not Eligible' : 'Sign Up'}
          </button>

          <p style={{ textAlign: 'center', color: '#6e6e6e', fontSize: '0.9rem' }}>
            Already have an account?{' '}
            <span onClick={() => go('/')} style={{ color: 'var(--avg-green)', cursor: 'pointer', fontWeight: 600 }}>Sign In</span>
          </p>
        </form>
      </div>

      {showTosModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', width: '100%', maxWidth: '640px',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }}>
            <div style={{ padding: '1.5rem 1.5rem 0' }}>
              <h3 style={{ color: '#2d2d2d', marginBottom: '0.25rem' }}>Terms of Service &amp; Privacy Policy</h3>
              <p style={{ color: '#6e6e6e', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Please read both documents before creating your account. Last updated: {LAST_UPDATED}.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {LEGAL_DOCS.map(doc => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setTosDocId(doc.id)}
                    style={{
                      flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
                      border: tosDocId === doc.id ? '1px solid var(--brand-primary)' : '1px solid #e8e8e8',
                      background: tosDocId === doc.id ? '#fff5f5' : 'white',
                      color: tosDocId === doc.id ? 'var(--brand-primary)' : '#4a4a4a',
                      cursor: 'pointer',
                    }}
                  >
                    {doc.label}{scrolledDocs[doc.id] ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={tosBodyRef}
              onScroll={handleTosScroll}
              style={{ overflowY: 'auto', padding: '0 1.5rem', flex: 1 }}
            >
              {LEGAL_DOCS.filter(d => d.id === tosDocId).map(doc => (
                <div key={doc.id} style={{ paddingBottom: '1rem' }}>
                  <p style={{ color: '#4a4a4a', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                    {doc.content.intro}
                  </p>
                  {doc.content.sections.map((section, i) => (
                    <div key={i} style={{ marginBottom: '1.25rem' }}>
                      <h4 style={{ color: '#2d2d2d', fontSize: '0.92rem', marginBottom: '0.4rem' }}>{section.heading}</h4>
                      {section.body && (
                        <p style={{ color: '#5a5a5a', fontSize: '0.85rem', lineHeight: 1.6 }}>{section.body}</p>
                      )}
                      {section.list && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {section.list.map((item, j) => (
                            <div key={j} style={{ fontSize: '0.85rem', color: '#5a5a5a', lineHeight: 1.5 }}>
                              <strong style={{ color: '#2d2d2d' }}>{item.label}:</strong> {item.desc}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {!canAcceptTos && (
                <p style={{ textAlign: 'center', color: '#b08c2a', fontSize: '0.78rem', paddingBottom: '0.5rem' }}>
                  Scroll to the bottom of the Terms of Service and Privacy Policy to enable "I Accept".
                </p>
              )}
            </div>

            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #eee', display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleDeclineTos}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={handleAcceptTos}
                disabled={!canAcceptTos}
                className="btn btn-primary"
                style={{ flex: 1, opacity: canAcceptTos ? 1 : 0.5 }}
              >
                I Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Signup;
