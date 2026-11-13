/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { changelog as changelogApi, liveMap as liveMapApi } from '../api/client';
import { useLocation, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import ReportIssueModal from './ReportIssueModal';

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/logbook':    'Logbook',
  '/statistics': 'Statistics',
  '/routes':     'Routes',
  '/rotw':       'Routes of the Week',
  '/log-flight': 'File PIREP',
  '/career':     'Career Mode',
  '/livemap':    'Live Map',
  '/challenges': 'Challenges',
  '/tools':      'Tools',
  '/docs':       'Docs',
  '/profile':    'My Profile',
  '/admin':      'Admin Panel',
  '/if-live':    'Live Mode',
};

export default function Topbar({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen]           = useState(false);
  const [utcTime, setUtcTime]             = useState('');
  const [liveFlight, setLiveFlight]       = useState(null);

  useEffect(() => {
    if (!user?.if_user_id) return;
    liveMapApi.pilotFlight(user.if_user_id).then(data => {
      if (data?.flying) setLiveFlight(data);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${h}:${m}:${s}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogData, setChangelogData] = useState([]);
  const [changelogLoaded, setChangelogLoaded] = useState(false);

  const TAG_COLORS = {
    new:      { color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
    improved: { color: '#1565c0', bg: 'rgba(21,101,192,0.1)' },
    fixed:    { color: '#e65100', bg: 'rgba(230,81,0,0.1)' },
    removed:  { color: '#c62828', bg: 'rgba(198,40,40,0.1)' },
  };

  const openChangelog = async () => {
    setMenuOpen(false);
    setChangelogOpen(true);
    if (!changelogLoaded) {
      try {
        const data = await changelogApi.list();
        setChangelogData((data.changelog || []).map(r => ({
          ...r,
          entries: typeof r.entries === 'string' ? JSON.parse(r.entries || '[]') : r.entries || [],
        })));
      } catch {}
      setChangelogLoaded(true);
    }
  };

  const title = PAGE_TITLES[location.pathname]
    || (location.pathname.startsWith('/admin') ? 'Admin Panel' : '');

  return (
    <>
      <div className="topbar-desktop" style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: 0,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 200,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.75rem',
          height: 64,
        }}>
        {/* Page title */}
        <span style={{
          fontWeight: 700,
          fontSize: '0.9rem',
          color: 'var(--text-primary)',
          letterSpacing: '-0.2px',
        }}>
          {title}
        </span>

        {/* UTC Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {utcTime} <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', opacity: 0.6 }}>UTC</span>
        </div>

        {/* User area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

          {/* Live flight indicator */}
          {liveFlight && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600, borderRight: '1px solid var(--border-color)', paddingRight: '0.75rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--avg-green)', flexShrink: 0 }} />
              {liveFlight.destination
                ? <span>{liveFlight.destination.from} <span style={{ opacity: 0.4 }}>→</span> {liveFlight.destination.to}</span>
                : <span>Airborne</span>
              }
              {liveFlight.aircraft && (
                <span style={{ opacity: 0.45 }}>· {liveFlight.aircraft.split(' - ')[0]}</span>
              )}
            </div>
          )}

          <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.3rem 0.5rem', borderRadius: '8px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <UserAvatar user={user} size={28} fontSize="0.72rem" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user.first_name}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setMenuOpen(false)} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '12px', boxShadow: '0 8px 24px var(--shadow-hover)',
                minWidth: 200, zIndex: 999, overflow: 'hidden',
              }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.first_name} {user.last_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--avg-gold-dark)', fontWeight: 600, marginTop: 2 }}>{user.callsign}</div>
                </div>
                <button onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                  style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  My Profile
                </button>
                <button onClick={openChangelog}
                  style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  What's New
                </button>
                <button onClick={() => { setMenuOpen(false); setReportIssueOpen(true); }}
                  style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Report an Issue
                </button>
                <button onClick={() => { setMenuOpen(false); onLogout(); }}
                  style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#c0392b', borderTop: '1px solid var(--border-color)', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
        </div>{/* end right wrapper */}
        </div>
        </div>
      <ReportIssueModal open={reportIssueOpen} onClose={() => setReportIssueOpen(false)} />
      {/* Changelog modal */}
      {changelogOpen && (
        <div onClick={() => setChangelogOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '5rem 1.5rem 1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 7rem)', background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style={{ fontWeight: 700, fontSize: '1rem', flex: 1 }}>What's New</span>
              <button onClick={() => setChangelogOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {changelogData.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No releases yet.</p>}
              {changelogData.map(r => (
                <div key={r.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: 'var(--avg-green)' }}>v{String(r.version || '').replace(/^v/i, '')}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.title}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{r.date?.split('T')[0] || ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {r.entries.map((e, i) => {
                      const t = TAG_COLORS[e.tag] || TAG_COLORS.new;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.18rem 0.45rem', borderRadius: '4px', background: t.bg, color: t.color, flexShrink: 0, marginTop: '0.1rem' }}>{e.tag}</span>
                          <span>{e.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @media (max-width: 768px) {
          .topbar-desktop { display: none !important; }
        }
      `}</style>
    </>
  );
}
