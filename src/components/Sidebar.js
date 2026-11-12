/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, BookOpen, FilePlus, Plane, BarChart2,
  Map, Star, Trophy, Wrench, Calendar, RefreshCw, Link2, Puzzle, Ticket,
  Users, UserPlus, Activity, Bell, ScrollText,
  DatabaseBackup, HeartPulse, PackagePlus, BarChart3,
  ListOrdered, UserCog, SlidersHorizontal, Image,
  LayoutGrid, ClipboardList, FileText, Satellite, Newspaper, Code, Award, CalendarDays
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { DeveloperBadge, isDeveloper } from './DeveloperBadge';
import { loadSettings } from '../services/settingsService';
import { flights as flightsApi, changelog as changelogApi } from '../api/client';
import { usePermissions } from '../hooks/usePermissions';
import { canSeeEvents } from '../utils/eventsAccess';

import brand, { logoFor, features } from '../brand';

const NAV_GROUPS = [
  {
    label: 'Flight Ops',
    items: [
      { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { to: '/logbook',    label: 'Logbook',    icon: BookOpen },
      { to: '/log-flight', label: 'File PIREP', icon: FilePlus },
      { to: '/career',     label: 'Career',     icon: Plane, adminOnly: true, beta: true, feature: 'career' },
      { to: '/leave',      label: 'Leave',      icon: Calendar },
      { to: '/statistics', label: 'Statistics', icon: BarChart2 },
      { to: '/if-live', label: 'IF Live', icon: Satellite, liveAccess: true, adminOnly: true, feature: 'liveMode' },
    ],
  },
  {
    label: 'Network',
    items: [
      { to: '/routes',  label: 'Routes',   icon: Map },
      { to: '/rotw',    label: 'ROTW',     icon: Star, feature: 'routesOfTheWeek' },
      { to: '/events',  label: 'Events',   icon: CalendarDays, beta: true, feature: 'events' },
      { to: '/livemap', label: 'Live Map', icon: Map },
      { to: '/challenges', label: 'Challenges', icon: Trophy, adminOnly: true, beta: true, feature: 'challenges' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/tools', label: 'Tools', icon: Wrench },
      { to: '/docs',  label: 'Docs',  icon: FilePlus },
    ],
  },
];

const ADMIN_GROUPS = [
  {
    label: 'Pilots',
    items: [
      { tab: 'pilots',      label: 'Active Pilots',    icon: Users,     perm: 'pilots.view' },
      { tab: 'recruitment', label: 'Recruitment',      icon: UserPlus,  perm: 'recruitment.view' },
      { tab: 'activity',    label: 'Activity',         icon: Activity,  perm: 'pilots.edit' },
      { tab: 'leave',       label: 'Leave Requests',   icon: Calendar,  perm: 'leave.manage' },
      { tab: 'staffapps', label: 'Staff Applications', icon: ClipboardList, perm: 'recruitment.manage' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { tab: 'pireps',     label: 'PIREPs',           icon: FilePlus,       perm: 'pireps.view' },
      { tab: 'notams',     label: 'NOTAMs',           icon: Bell,           perm: 'notams.manage' },
      { tab: 'news',       label: 'News',             icon: Newspaper,      perm: 'notams.manage' },
      { tab: 'tickets',    label: 'Tickets',          icon: Ticket,         adminOnly: true, feature: 'tickets' },
      { tab: 'audit',      label: 'Audit Log',        icon: ScrollText,     perm: 'audit.view' },
      { tab: 'import',     label: 'Import',           icon: DatabaseBackup, adminOnly: true },
      { tab: 'health',     label: 'VA Health',        icon: HeartPulse,     adminOnly: true },
      { tab: 'if-live',    label: 'IF Live',          icon: Satellite,      adminOnly: true, feature: 'liveMode' },
    ],
  },
  {
    label: 'Network',
    items: [
      { tab: 'routes',     label: 'Routes',          icon: Map,         adminOnly: true },
      { tab: 'featured',   label: 'Featured Routes', icon: Star,        adminOnly: true, feature: 'routesOfTheWeek' },
      { tab: 'fleet',      label: 'Fleet',           icon: PackagePlus, adminOnly: true },
      { tab: 'airlines',  label: 'Airlines',        icon: Plane,       adminOnly: true },
      { tab: 'events',     label: 'Events',          icon: CalendarDays, perm: 'events.manage', feature: 'events' },
      { tab: 'challenges', label: 'Challenges',      icon: Trophy,      adminOnly: true, feature: 'challenges' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { tab: 'docs', label: 'Docs', icon: BookOpen, perm: 'pilots.view' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { tab: 'ranks',       label: 'Ranks',        icon: ListOrdered,       adminOnly: true },
      { tab: 'badges',      label: 'Badges',       icon: Award,             adminOnly: true },
      { tab: 'roles',       label: 'Staff Roles',  icon: UserCog,           adminOnly: true },
      { tab: 'multipliers', label: 'Multipliers',  icon: SlidersHorizontal, adminOnly: true },
      { tab: 'assets',      label: 'Assets',       icon: Image,             adminOnly: true },
      { tab: 'site',        label: 'Site settings', icon: Wrench,           adminOnly: true },
      { tab: 'plugins',     label: 'Plugins',       icon: Puzzle,           adminOnly: true },
      { tab: 'connections', label: 'Connections',   icon: Link2,            adminOnly: true },
      { tab: 'updates',     label: 'Updates',       icon: RefreshCw,        adminOnly: true },
    ],
  },
];

const LIVE_ITEMS = [
  { tab: 'dashboard', label: 'Fly',     icon: Plane },
  { tab: 'fleet',     label: 'Fleet',   icon: PackagePlus },
  { tab: 'logbook',   label: 'Logbook', icon: ClipboardList },
  { tab: 'pilots',    label: 'Pilots',  icon: Users },
  { tab: 'stats',     label: 'Stats',   icon: BarChart3 },
];

function NavIcon({ icon: Icon }) {
  return <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />;
}

export default function Sidebar({ user, darkMode, onToggleDarkMode, onLogout }) {
  const location  = useLocation();
  const [logo, setLogo]               = useState('');
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [mobileUserMenu, setMobileUserMenu] = useState(false);
  const [changelogOpen, setChangelogOpen]     = useState(false);
  const [changelogData, setChangelogData]     = useState([]);
  const [changelogLoaded, setChangelogLoaded] = useState(false);
  const [challengesVisible, setChallengesVisible] = useState(false);

  const TAG_COLORS = {
    new:      { color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
    improved: { color: '#1565c0', bg: 'rgba(21,101,192,0.1)' },
    fixed:    { color: '#e65100', bg: 'rgba(230,81,0,0.1)' },
    removed:  { color: '#c62828', bg: 'rgba(198,40,40,0.1)' },
  };

  const openChangelog = async () => {
    setMobileUserMenu(false);
    setChangelogOpen(true);
    if (!changelogLoaded) {
      try {
        const data = await changelogApi.list();
        setChangelogData((data.changelog || []).map(r => ({
          ...r,
          entries: typeof r.entries === 'string' ? JSON.parse(r.entries || '[]') : r.entries || [],
        })));
        setChangelogLoaded(true);
      } catch {}
    }
  };
  const [pendingCount, setPending]    = useState(0);

  useEffect(() => { setMobileOpen(false); }, [location]);

  // Allow the tour to open/close the mobile sidebar via custom events
  useEffect(() => {
    const open  = () => setMobileOpen(true);
    const close = () => setMobileOpen(false);
    window.addEventListener('tour:open-sidebar',  open);
    window.addEventListener('tour:close-sidebar', close);
    return () => {
      window.removeEventListener('tour:open-sidebar',  open);
      window.removeEventListener('tour:close-sidebar', close);
    };
  }, []);

  useEffect(() => {
    loadSettings(true).then(s => {
      setLogo(s[darkMode ? 'logo_dark' : 'logo_light'] || logoFor(darkMode));
      setChallengesVisible(s['challenges_visible'] !== 'false');
    });
  }, [darkMode]);

  useEffect(() => {
    if (user.role !== 'admin' && !user.staff_role && !isDeveloper(user)) return;
    const fetch = () => flightsApi.pending().then(d => setPending((d.flights || []).length)).catch(() => {});
    fetch();
    const t = setInterval(fetch, 60000);
    return () => clearInterval(t);
    // Deliberately narrower than [user] — only role/staff_role actually
    // change whether this poller should run; `user` itself gets a new object
    // identity on unrelated updates (e.g. profile edits), which would
    // otherwise restart the 60s interval for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role, user.staff_role]);

  const navigate     = useNavigate();
  const isAdmin      = user.role === 'admin' || user.staff_role || isDeveloper(user);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isLiveRoute  = location.pathname.startsWith('/if-live');
  const activeTab    = new URLSearchParams(location.search).get('tab') || 'pilots';
  const liveTab      = new URLSearchParams(location.search).get('tab') || 'dashboard';
  const sidebarWidth = collapsed ? 64 : 220;
  const { can } = usePermissions(user);

  // The dark mode button at the bottom of the sidebar
  const footerButtonStyle = (mobile) => ({
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    width: '100%', padding: collapsed && !mobile ? '0.55rem 0' : '0.55rem 0.75rem',
    justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
    background: 'none', border: 'none', cursor: 'pointer',
    borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.875rem',
    fontFamily: 'inherit', transition: 'all 0.15s', marginTop: '0.15rem',
  });
  const footerButtonHover = {
    onMouseEnter: e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; },
    onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; },
  };

  const SidebarContent = ({ mobile = false }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      width: mobile ? 260 : sidebarWidth, transition: 'width 0.2s ease',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed && !mobile ? '1.25rem 0' : '1.25rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: collapsed && !mobile ? 'center' : 'space-between',
        borderBottom: '1px solid var(--border-color)', flexShrink: 0,
        minHeight: 68,
      }}>
        {(!collapsed || mobile) && (
          logo
            ? <img src={logo} alt={brand.name} style={{ height: 40, objectFit: 'contain', maxWidth: 140 }} onError={() => setLogo('')} />
            : <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>{brand.shortName}</span>
        )}
        {!mobile && (
          <button onClick={() => setCollapsed(c => !c)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '8px',
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--avg-green)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'none'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {collapsed
                ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
                : <path d="M11 5l-7 7 7 7M19 5l-7 7 7 7"/>
              }
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <nav data-tour="sidebar-nav" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0', overflowX: 'hidden', display: isAdminRoute ? 'block' : 'none' }}>
          <>
            {/* Back to main nav */}
            <button onClick={() => navigate('/dashboard')} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              width: 'calc(100% - 1rem)', margin: '0 0.5rem 0.5rem',
              padding: '0.5rem 0.75rem', borderRadius: '8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              {(!collapsed || mobile) && <span>Back</span>}
            </button>

            {(!collapsed || mobile) && (
              <div style={{ padding: '0.25rem 1rem 0.5rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--avg-green)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Admin Panel
              </div>
            )}

            {ADMIN_GROUPS.map(group => {
              const visibleItems = group.items.filter(item => {
                if (item.feature && features[item.feature] === false) return false;
                if (item.adminOnly) return user.role === 'admin' || isDeveloper(user);
                if (item.perm) return can(item.perm);
                return true;
              });
              if (!visibleItems.length) return null;
              return (
              <div key={group.label} style={{ marginBottom: '0.25rem' }}>
                {(!collapsed || mobile) && (
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', padding: '0.5rem 1rem 0.2rem', opacity: 0.5 }}>
                    {group.label}
                  </div>
                )}
                {visibleItems.map(item => {
                  const isActive = activeTab === item.tab;
                  return (
                    <button key={item.tab} onClick={() => navigate(`/admin?tab=${item.tab}`)} style={{
                      display: 'flex', alignItems: 'center',
                      gap: collapsed && !mobile ? 0 : '0.65rem',
                      padding: collapsed && !mobile ? '0.65rem 0' : '0.5rem 1rem',
                      justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
                      margin: '0.05rem 0.5rem', width: 'calc(100% - 1rem)', boxSizing: 'border-box',
                      borderRadius: '8px', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '0.855rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--avg-green)' : 'var(--text-primary)',
                      background: isActive ? 'var(--avg-green-pale)' : 'transparent',
                      boxShadow: isActive ? 'inset 3px 0 0 0 var(--avg-green)' : 'inset 3px 0 0 0 transparent',
                      transition: 'all 0.15s', textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--avg-green)'; }}}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
                    >
                      <NavIcon icon={item.icon} />
                      {(!collapsed || mobile) && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
              );
            })}
          </>
      </nav>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0', overflowX: 'hidden', display: isLiveRoute ? 'block' : 'none' }}>
        <button onClick={() => navigate('/dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          width: 'calc(100% - 1rem)', margin: '0 0.5rem 0.5rem',
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {(!collapsed || mobile) && <span>Back</span>}
        </button>
        {(!collapsed || mobile) && (
          <div style={{ padding: '0.25rem 1rem 0.5rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--avg-green)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Live Mode
          </div>
        )}
        {[
          ...LIVE_ITEMS,
          ...(user.role === 'admin' || isDeveloper(user) ? [{ tab: 'playground', label: 'API playground', icon: Code }] : []),
          ...(user.role === 'admin' || isDeveloper(user) ? [{ tab: 'admin', label: 'Live admin', icon: LayoutGrid }] : []),
        ].map(item => {
          const isActive = isLiveRoute && !item.to && liveTab === item.tab;
          return (
            <button key={item.tab || item.to} onClick={() => navigate(item.to || `/if-live?tab=${item.tab}`)} style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed && !mobile ? 0 : '0.65rem',
              padding: collapsed && !mobile ? '0.65rem 0' : '0.55rem 1rem',
              justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
              margin: '0.05rem 0.5rem', width: 'calc(100% - 1rem)', boxSizing: 'border-box',
              borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.875rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--avg-green)' : 'var(--text-primary)',
              background: isActive ? 'var(--avg-green-pale)' : 'transparent',
              boxShadow: isActive ? 'inset 3px 0 0 0 var(--avg-green)' : 'inset 3px 0 0 0 transparent',
              transition: 'all 0.15s', textAlign: 'left',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--avg-green)'; }}}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
            >
              <NavIcon icon={item.icon} />
              {(!collapsed || mobile) && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0', overflowX: 'hidden', display: isAdminRoute || isLiveRoute ? 'none' : 'block' }}>
          <>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom: '0.25rem' }}>
                {(!collapsed || mobile) && (
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', padding: '0.5rem 1rem 0.25rem', opacity: 0.55 }}>
                    {group.label}
                  </div>
                )}
                {group.items.filter(item => {
                  // Switched off in va.config.json features
                  if (item.feature && features[item.feature] === false) return false;
                  if (item.liveAccess) return isAdmin || user.live_access;
                  if (item.adminOnly && !isAdmin && user.role !== 'beta_tester') return false;
                  if (item.staffOnly && !isAdmin) return false;
                  if (item.to === '/challenges' && !challengesVisible) return false;
                  if (item.to === '/events' && !canSeeEvents(user)) return false;
                  return true;
                }).map(item => (
                  <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: collapsed && !mobile ? 0 : '0.65rem',
                    padding: collapsed && !mobile ? '0.65rem 0' : '0.55rem 1rem',
                    justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
                    margin: '0.05rem 0.5rem', width: 'calc(100% - 1rem)', borderRadius: '8px',
                    boxSizing: 'border-box',
                    textDecoration: 'none', fontSize: '0.875rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--avg-green)' : 'var(--text-primary)',
                    background: isActive ? 'var(--avg-green-pale)' : 'transparent',
                    boxShadow: isActive ? 'inset 3px 0 0 0 var(--avg-green)' : 'inset 3px 0 0 0 transparent',
                    transition: 'all 0.15s',
                  })}
                  onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--avg-green)'; }}}
                  onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
                  >
                    <NavIcon icon={item.icon} />
                    {(!collapsed || mobile) && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                        {item.beta && (
                          <span style={{ flexShrink: 0, fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--avg-gold)', color: 'var(--avg-green-dark, var(--brand-primary-dark))', padding: '1px 5px', borderRadius: '4px', lineHeight: '1.6' }}>
                            Beta
                          </span>
                        )}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}

            {/* Admin link */}
            {isAdmin && (
              <div style={{ padding: '0.5rem 0.5rem 0.25rem' }}>
                <NavLink to="/admin" style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center',
                  gap: collapsed && !mobile ? 0 : '0.65rem',
                  padding: collapsed && !mobile ? '0.65rem 0' : '0.6rem 1rem',
                  justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
                  borderRadius: '8px',
                  textDecoration: 'none', fontSize: '0.875rem',
                  fontWeight: 700,
                  color: isActive ? 'var(--avg-gold)' : 'var(--avg-gold)',
                  background: isActive ? 'var(--avg-green)' : 'var(--avg-green-dark)',
                  transition: 'all 0.15s', position: 'relative',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                })}>
                  <LayoutGrid size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  {(!collapsed || mobile) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                      Admin Panel
                      {pendingCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: '999px', background: 'var(--avg-gold)', color: 'var(--avg-green-dark)', fontSize: '0.62rem', fontWeight: 800, padding: '0 4px', marginLeft: 'auto' }}>
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </span>
                  )}
                  {collapsed && !mobile && pendingCount > 0 && (
                    <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--avg-gold)' }} />
                  )}
                </NavLink>
              </div>
            )}
          </>
      </nav>
      </div>

      {/* Bottom: legal link + theme toggle */}
      <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem 0.5rem', flexShrink: 0 }}>
        <NavLink to="/legal" style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '0.65rem',
          width: '100%', padding: collapsed && !mobile ? '0.55rem 0' : '0.55rem 0.75rem',
          justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
          borderRadius: '8px', textDecoration: 'none', fontSize: '0.875rem',
          color: isActive ? 'var(--avg-green)' : 'var(--text-secondary)',
          background: isActive ? 'var(--avg-green-pale)' : 'transparent',
          transition: 'all 0.15s',
        })}
        onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
        onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}}
        >
          <FileText size={17} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {(!collapsed || mobile) && <span>Terms &amp; Privacy</span>}
        </NavLink>

        <button onClick={onToggleDarkMode} style={footerButtonStyle(mobile)} {...footerButtonHover}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {darkMode
              ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            }
          </svg>
          {(!collapsed || mobile) && <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>}
        </button>

      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: sidebarWidth, flexShrink: 0, height: '100vh',
        position: 'sticky', top: 0, overflowY: 'auto', overflowX: 'hidden',
        background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)',
        boxShadow: '2px 0 8px rgba(0,0,0,0.03)',
        transition: 'width 0.2s ease', zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }} className="sidebar-desktop">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
        boxShadow: '0 1px 0 var(--border-color)',
        paddingTop: 'env(safe-area-inset-top)',
      }} className="sidebar-mobile-bar">
        <div style={{ height: 56, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem' }}>

          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '0.25rem', display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          {logo
            ? <img src={logo} alt={brand.abbreviation} style={{ height: 32, width: 140, objectFit: 'contain' }} onError={() => setLogo('')} />
            : <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--avg-gold)' }}>AUSTRALIA VIRTUAL</span>
          }

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMobileUserMenu(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem', display: 'flex', alignItems: 'center', borderRadius: '50%' }}
            >
              <UserAvatar user={user} size={32} fontSize="0.75rem" />
            </button>

            {mobileUserMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 2998 }} onClick={() => setMobileUserMenu(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  minWidth: 200, zIndex: 2999, overflow: 'hidden',
                }}>
                  <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.first_name} {user.last_name}</span>
                      {isDeveloper(user) && <DeveloperBadge />}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--avg-gold-dark)', fontWeight: 600, marginTop: 2 }}>{user.callsign}</div>
                  </div>
                  <button onClick={() => { setMobileUserMenu(false); setMobileOpen(false); navigate('/profile'); }}
                    style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    My Profile
                  </button>
                  <button onClick={openChangelog}
                    style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    What's New
                  </button>
                  <button onClick={() => { setMobileUserMenu(false); setMobileOpen(false); navigate('/legal'); }}
                    style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    Terms &amp; Privacy
                  </button>
                  <button onClick={() => { setMobileUserMenu(false); onLogout(); }}
                    style={{ width: '100%', padding: '0.8rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#c0392b', borderTop: '1px solid var(--border-color)', fontFamily: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2100 }} />
          <div data-tour="sidebar-nav" style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 2200,
            background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
            animation: 'slideInLeft 0.2s ease-out',
            display: 'flex', flexDirection: 'column',
          }}>
            <SidebarContent mobile />
          </div>
        </>
      )}

      {/* Mobile changelog modal */}
      {changelogOpen && (
        <div onClick={() => setChangelogOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '5rem 1.5rem 1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: 420, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>What's New</h3>
              <button onClick={() => setChangelogOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', flex: 1 }}>
              {changelogData.length === 0 && !changelogLoaded && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading...</p>
              )}
              {changelogData.map((release, ri) => (
                <div key={ri} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--avg-green)' }}>{release.version || release.title}</div>
                  {release.entries.map((entry, ei) => {
                    const tag = (entry.tag || '').toLowerCase();
                    const tc = TAG_COLORS[tag] || { color: 'var(--text-secondary)', bg: 'var(--bg-hover)' };
                    return (
                      <div key={ei} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                        {tag && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, marginTop: 2 }}>{tag}</span>}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{entry.text}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-bar { display: flex !important; }
        }
      `}</style>
    </>
  );
}
