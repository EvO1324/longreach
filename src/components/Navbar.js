/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { loadSettings } from '../services/settingsService';
import { flights as flightsApi, changelog as changelogApi } from '../api/client';
import UserAvatar from './UserAvatar';
import ReportIssueModal from './ReportIssueModal';
import { isDeveloper } from './DeveloperBadge';

import brand, { logoFor } from '../brand';
function Navbar({ user, darkMode, onToggleDarkMode, onLogout }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logo, setLogo] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const [changelogOpen, setChangelogOpen]     = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [changelogData, setChangelogData]     = useState([]);
  const [changelogLoaded, setChangelogLoaded] = useState(false);
  const TAG_COLORS = {
    new:      { color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
    improved: { color: '#1565c0', bg: 'rgba(21,101,192,0.1)' },
    fixed:    { color: '#e65100', bg: 'rgba(230,81,0,0.1)' },
    removed:  { color: '#c62828', bg: 'rgba(198,40,40,0.1)' },
  };

  const openChangelog = async () => {
    setChangelogOpen(true);
    if (!changelogLoaded) {
      try {
        const data = await changelogApi.list();
        const parsed = (data.changelog || []).map(r => ({
          ...r,
          entries: typeof r.entries === 'string' ? JSON.parse(r.entries || '[]') : r.entries || [],
        }));
        setChangelogData(parsed);
      } catch {}
      setChangelogLoaded(true);
    }
  };

  useEffect(() => { setMobileMenuOpen(false); }, [location]);

  useEffect(() => {
    loadSettings(true).then(settings => {
      setLogo(settings[darkMode ? 'logo_dark' : 'logo_light'] || logoFor(darkMode));
    });
  }, [darkMode]);

  // Poll pending PIREP count for admin/staff users
  useEffect(() => {
    if (user.role !== 'admin' && !user.staff_role && !isDeveloper(user)) return;
    const fetchPending = () => {
      flightsApi.pending().then(data => {
        setPendingCount((data.flights || []).length);
      }).catch(() => {});
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [user.role, user.staff_role]);

  const navLinks = [
    { to: '/dashboard',  label: 'Dashboard' },
    { to: '/logbook',    label: 'Logbook' },
    { to: '/statistics', label: 'Statistics' },
    { to: '/routes',     label: 'Routes' },
    { to: '/rotw',       label: 'ROTW' },
    { to: '/log-flight', label: 'File PIREP' },
    { to: '/career',     label: 'Career' },
    { to: '/livemap',    label: 'Live Map' },
    { to: '/tools',      label: 'Tools' },
    { to: '/docs',       label: 'Docs' },
    ...(user.role === 'admin' || user.staff_role || isDeveloper(user) ? [{ to: '/admin', label: 'Admin', admin: true }] : []),
  ];

  return (
    <>
      <nav className="navbar">
        <div className="nav-container">
          <button className="hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
          </button>

          {/* Logo */}
          <div className="nav-logo">
            {logo ? (
              <img
                src={logo}
                alt={brand.name}
                style={{ objectFit: 'contain' }}
                onError={() => { console.warn('Logo failed to load:', logo); setLogo(''); }}
              />
            ) : (
              <h1>AUSTRALIA VIRTUAL</h1>
            )}
          </div>

          {/* Desktop links */}
          <div className="nav-links nav-links-desktop">
            {navLinks.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                style={link.admin ? { backgroundColor: 'rgba(var(--brand-primary-rgb),0.08)', borderRadius: '6px' } : {}}
              >
                {link.label}
                {link.admin && pendingCount > 0 && (
                  <span style={{
                    marginLeft: '0.4rem',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 18, height: 18, borderRadius: '999px',
                    background: 'var(--avg-green)', color: 'white',
                    fontSize: '0.65rem', fontWeight: 700, lineHeight: 1,
                    padding: '0 4px',
                  }}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Actions */}
          <div className="nav-actions">
            <button onClick={onToggleDarkMode} className="theme-toggle" aria-label="Toggle dark mode">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {darkMode ? (
                  <>
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  </>
                ) : (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                )}
              </svg>
            </button>

            {/* Desktop user menu */}
            <div style={{ position: 'relative' }} className="nav-user-desktop">
              <button className="user-menu-button" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <UserAvatar user={user} size={32} />
                <span className="user-menu-name">{user.first_name}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {userMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setUserMenuOpen(false)} />
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <div className="user-dropdown-name">{user.first_name} {user.last_name}</div>
                      <div className="user-dropdown-callsign">{user.callsign}</div>
                    </div>
                    <button className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}>
                      My Profile
                    </button>
                    <button className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); openChangelog(); }}>
                      What's New
                    </button>
                    <button className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); setReportIssueOpen(true); }}>
                      Report an Issue
                    </button>
                    <button className="user-dropdown-item logout" onClick={() => { setUserMenuOpen(false); onLogout(); }}>
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              className="nav-user-mobile"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: '50%' }}
            >
              <UserAvatar user={user} size={34} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-menu">
            <div className="mobile-menu-header">
              <UserAvatar user={user} size={44} fontSize="1.1rem" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{user.first_name} {user.last_name}</div>
                <div style={{ color: 'var(--avg-gold)', fontSize: '0.85rem', fontWeight: 500 }}>{user.callsign}</div>
              </div>
            </div>

            {navLinks.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {link.label}
                  {link.admin && pendingCount > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 18, height: 18, borderRadius: '999px',
                      background: 'var(--avg-green)', color: 'white',
                      fontSize: '0.65rem', fontWeight: 700, padding: '0 4px',
                    }}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </span>
              </NavLink>
            ))}

            <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
            <button
              className="mobile-nav-link"
              onClick={() => { navigate('/profile'); setMobileMenuOpen(false); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none' }}
            >
              My Profile
            </button>
            <button
              className="mobile-nav-link"
              onClick={() => { openChangelog(); setMobileMenuOpen(false); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none' }}
            >
              What's New
            </button>
            <button
              className="mobile-nav-link"
              onClick={() => { setReportIssueOpen(true); setMobileMenuOpen(false); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none' }}
            >
              Report an Issue
            </button>
            <button
              className="mobile-nav-link"
              onClick={() => { onLogout(); setMobileMenuOpen(false); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none', color: '#c62828' }}
            >
              Sign Out
            </button>
          </div>
        </>
      )}

      <ReportIssueModal open={reportIssueOpen} onClose={() => setReportIssueOpen(false)} />
      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        entries={changelogData}
        tagColors={TAG_COLORS}
      />
    </>
  );
}

function ChangelogModal({ open, onClose, entries, tagColors }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '5rem 1.5rem 1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 7rem)', background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span style={{ fontWeight: 700, fontSize: '1rem', flex: 1 }}>What's New</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {entries.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0, textAlign: 'center', padding: '2rem 0' }}>No releases yet.</p>
          )}
          {entries.map(r => (
            <div key={r.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: 'var(--avg-green)' }}>v{String(r.version || '').replace(/^v/i, '')}</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{r.date?.split('T')[0] || ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {r.entries.map((e, i) => {
                  const t = tagColors[e.tag] || tagColors.new;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.18rem 0.45rem', borderRadius: '4px', background: t.bg, color: t.color, flexShrink: 0, marginTop: '0.1rem' }}>{e.tag}</span>
                      <span style={{ color: 'var(--text-primary)', lineHeight: 1.55 }}>{e.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Navbar;
