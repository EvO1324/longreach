/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { features } from '../brand';
import React from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import {
  Users, FileText, Globe, SlidersHorizontal, BookOpen,
  ChevronRight, UserCheck, Activity, ClipboardList,
  Bell, Shield, Map, Star, Plane, Trophy, Layers, CalendarDays,
  Sliders, Image, Bot, BarChart2, DatabaseBackup, Umbrella,
  Newspaper, Satellite,
} from 'lucide-react';

import FleetManager        from './admin/FleetManager';
import AirlinesManager     from './admin/AirlinesManager';
import PilotsManager       from './admin/PilotsManager';
import PirepsManager       from './admin/PirepsManager';
import RoutesManager       from './admin/RoutesManager';
import AssetsManager       from './admin/AssetsManager';
import FeaturedRoutes      from './admin/FeaturedRoutes';
import MultipliersManager  from './admin/MultipliersManager';
import RanksManager        from './admin/RanksManager';
import BadgesManager       from './admin/BadgesManager';
import RolesManager        from './admin/RolesManager';
import NotamsManager       from './admin/NotamsManager';
import ActivityManager     from './admin/ActivityManager';
import LeaveManager       from './admin/LeaveManager';
import SiteSettings        from './admin/SiteSettings';
import UpdatesManager      from './admin/UpdatesManager';
import Connections         from './admin/Connections';
import Plugins             from './admin/Plugins';
import TicketsManager      from './admin/TicketsManager';
import Embeds              from './admin/Embeds';
import PartnersManager     from './admin/PartnersManager';
import AuditLog            from './admin/AuditLog';
import ImportTool          from './admin/ImportTool';
import VAHealth            from './admin/VAHealth';
import ChallengesManager  from './admin/ChallengesManager';
import EventsManager      from './admin/EventsManager';
import Docs               from './Docs';
import StaffApplicationsManager from './admin/StaffApplicationsManager';
import NewsManager        from './admin/NewsManager';

// Tab icon map
const TAB_ICONS = {
  pilots:       UserCheck,
  recruitment:  ClipboardList,
  activity:     Activity,
  leave:         Umbrella,
  pireps:       BarChart2,
  notams:       Bell,
  audit:        Shield,
  routes:       Map,
  featured:     Star,
  fleet:        Plane,
  ranks:        Trophy,
  roles:        Layers,
  multipliers:  Sliders,
  assets:       Image,
  challenges:   Trophy,
  events:       CalendarDays,
  site:         Bot,
  updates:      Bot,
  import:       DatabaseBackup,
  health:       BarChart2,
  qvg:          BarChart2,
  docs:         BookOpen,
  staffapps: ClipboardList,
  news:         Newspaper,
  'if-live':    Satellite,
};

// Categories
const CATEGORIES = [
  {
    id: 'pilots', label: 'Pilots', Icon: Users,
    tabs: [
      { id: 'pilots',      label: 'Active Pilots', perm: 'pilots.view' },
      { id: 'recruitment', label: 'Recruitment',   perm: 'recruitment.view' },
      { id: 'activity',    label: 'Activity',      perm: 'pilots.edit' },
      { id: 'leave',       label: 'Leave Requests', perm: 'leave.manage' },
      { id: 'staffapps', label: 'Staff Applications', perm: 'recruitment.manage' },
    ],
  },
  {
    id: 'operations', label: 'Operations', Icon: FileText,
    tabs: [
      { id: 'pireps',    label: 'PIREPs',           perm: 'pireps.view' },
      { id: 'notams',    label: 'NOTAMs',            perm: 'notams.manage' },
      { id: 'news',      label: 'News',              perm: 'notams.manage' },
      { id: 'tickets',   label: 'Tickets',           perm: null, adminOnly: true, feature: 'tickets' },
      { id: 'audit',     label: 'Audit Log',         perm: 'audit.view' },
      { id: 'import',    label: 'Import',            perm: null, adminOnly: true },
      { id: 'health',    label: 'VA Health',          perm: null, adminOnly: true },
      { id: 'if-live',   label: 'IF Live',            perm: null, adminOnly: true, feature: 'liveMode' },
    ],
  },
  {
    id: 'network', label: 'Network', Icon: Globe,
    tabs: [
      { id: 'routes',     label: 'Routes',         perm: null, adminOnly: true },
      { id: 'featured',   label: 'Featured Routes', perm: null, adminOnly: true, feature: 'routesOfTheWeek' },
      { id: 'fleet',      label: 'Fleet',           perm: null, adminOnly: true },
      { id: 'airlines',   label: 'Airlines',        perm: null, adminOnly: true },
      { id: 'partners',   label: 'Partners',        perm: null, adminOnly: true, feature: 'partners' },
      { id: 'events',     label: 'Events',          perm: 'events.manage', feature: 'events' },
      { id: 'challenges', label: 'Challenges',      perm: null, adminOnly: true, feature: 'challenges' },
    ],
  },
  {
    id: 'resources', label: 'Resources', Icon: BookOpen,
    tabs: [
      { id: 'docs', label: 'Docs', perm: 'pilots.view' },
    ],
  },
  {
    id: 'configuration', label: 'Configuration', Icon: SlidersHorizontal,
    tabs: [
      { id: 'ranks',        label: 'Ranks',        perm: null, adminOnly: true },
      { id: 'badges',       label: 'Badges',       perm: null, adminOnly: true },
      { id: 'roles',        label: 'Staff Roles',  perm: null, adminOnly: true },
      { id: 'multipliers',  label: 'Multipliers',  perm: null, adminOnly: true },
      { id: 'assets',       label: 'Assets',       perm: null, adminOnly: true },
      { id: 'site',         label: 'Site settings',     perm: null, adminOnly: true },
      { id: 'plugins',      label: 'Plugins',           perm: null, adminOnly: true },
      { id: 'connections',  label: 'Connections',       perm: null, adminOnly: true },
      { id: 'embeds',       label: 'Embeds',            perm: null, adminOnly: true },
      { id: 'updates',      label: 'Updates',           perm: null, adminOnly: true },
    ],
  },
];

const ALL_TAB_IDS = CATEGORIES.flatMap(c => c.tabs.map(t => t.id));

// Sidebar category header
function CategoryGroup({ category, activeTab, onTabSelect, isAdmin, can }) {
  const visibleTabs = category.tabs.filter(t =>
    (!t.feature || features[t.feature] !== false) && (t.adminOnly ? isAdmin : (isAdmin || can(t.perm)))
  );
  if (!visibleTabs.length) return null;

  const isActive = visibleTabs.some(t => t.id === activeTab);

  return (
    <div style={{ marginBottom: '0.25rem' }}>
      {/* Category label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 1rem 0.35rem',
        fontSize: '0.68rem', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: isActive ? 'var(--avg-gold)' : 'var(--text-secondary)',
        opacity: isActive ? 1 : 0.6,
        transition: 'color 0.2s, opacity 0.2s',
      }}>
        <category.Icon size={11} strokeWidth={2.5} />
        {category.label}
      </div>

      {/* Tabs */}
      {visibleTabs.map(tab => {
        const TabIcon = TAB_ICONS[tab.id];
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: '0.65rem',
              padding: '0.55rem 1rem 0.55rem 1.35rem',
              background: active ? 'rgba(var(--brand-primary-rgb),0.1)' : 'transparent',
              border: 'none',
              borderLeft: active ? '2px solid var(--avg-green)' : '2px solid transparent',
              color: active ? 'var(--avg-green)' : 'var(--text-secondary)',
              fontWeight: active ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              borderRadius: '0 6px 6px 0',
              marginRight: '0.5rem',
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            {TabIcon && <TabIcon size={14} strokeWidth={active ? 2.5 : 2} style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{tab.label}</span>
            {active && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
          </button>
        );
      })}
    </div>
  );
}

// Main
function AdminPanel({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, isAdmin } = usePermissions(user);
  const rawTab    = searchParams.get('tab');
  const activeTab = ALL_TAB_IDS.includes(rawTab) ? rawTab : 'pilots';
  const setActiveTab = (id) => {
    setSearchParams({ tab: id }, { replace: false });
  };

  // Active tab label for the mobile header
  const activeLabel = CATEGORIES.flatMap(c => c.tabs).find(t => t.id === activeTab)?.label || 'Admin';
  const ActiveTabIcon = TAB_ICONS[activeTab];

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 64px)', position: 'relative' }}>

      {/* Sidebar hidden — navigation handled by main sidebar */}
      <aside style={{ display: 'none' }}>
        {/* Sidebar header */}
        <div style={{
          padding: '0 1rem 0.75rem',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '0.25rem',
        }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--avg-green)',
          }}>
            Admin Panel
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {user?.first_name} {user?.last_name}
          </div>
        </div>

        {/* Category groups */}
        {CATEGORIES.map(cat => (
          <CategoryGroup
            key={cat.id}
            category={cat}
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            isAdmin={isAdmin}
            can={can}
          />
        ))}
      </aside>

      {/* Content */}
      <main className="admin-main" style={{ flex: 1, minWidth: 0 }}>

        {/* Page title */}
        <div className="admin-page-title" style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            {ActiveTabIcon && <ActiveTabIcon size={20} color="var(--avg-green)" strokeWidth={2} />}
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {activeLabel}
            </h2>
          </div>
          <div style={{ height: '2px', width: '32px', background: 'var(--avg-gold)', borderRadius: '2px', marginLeft: '28px' }} />
        </div>

        {/* Tab content */}
        <div style={{ animation: 'adminFadeIn 0.2s ease-out' }}>
          {/* a switched-off plugin's page says so instead of showing nothing */}
          {(() => {
            const def = CATEGORIES.flatMap(c => c.tabs).find(t => t.id === activeTab);
            if (!def?.feature || features[def.feature] !== false) return null;
            return (
              <div className="card" style={{ maxWidth: 520 }}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{def.label} is switched off</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.9rem' }}>
                  Switch it on in Plugins to use it.
                </div>
                <a href="/admin?tab=plugins" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Open Plugins</a>
              </div>
            );
          })()}
          {activeTab === 'pilots'       && <PilotsManager initialTab='pilots' user={user} />}
          {activeTab === 'recruitment'  && <PilotsManager initialTab='recruitment' user={user} />}
          {activeTab === 'activity'     && <ActivityManager />}
          {activeTab === 'leave'        && <LeaveManager />}
          {activeTab === 'pireps'       && <PirepsManager />}
          {activeTab === 'notams'       && <NotamsManager />}
          {activeTab === 'news'         && <NewsManager />}
          {activeTab === 'audit'        && <AuditLog />}
          {activeTab === 'routes'       && <RoutesManager />}
          {activeTab === 'featured'     && features.routesOfTheWeek !== false && <FeaturedRoutes />}
          {activeTab === 'fleet'        && <FleetManager />}
          {activeTab === 'airlines'     && <AirlinesManager />}
          {activeTab === 'challenges'   && features.challenges !== false && <ChallengesManager />}
          {activeTab === 'events'       && features.events !== false && <EventsManager />}
          {activeTab === 'docs'         && <Docs user={user} />}
          {activeTab === 'ranks'        && <RanksManager />}
          {activeTab === 'badges'       && <BadgesManager />}
          {activeTab === 'roles'        && <RolesManager />}
          {activeTab === 'multipliers'  && <MultipliersManager />}
          {activeTab === 'assets'       && <AssetsManager />}
          {activeTab === 'site'         && <SiteSettings />}
          {activeTab === 'plugins'      && <Plugins />}
          {activeTab === 'tickets'      && features.tickets !== false && <TicketsManager />}
          {activeTab === 'connections'  && <Connections />}
          {activeTab === 'embeds'       && <Embeds />}
          {activeTab === 'partners'     && features.partners !== false && <PartnersManager />}
          {activeTab === 'updates'      && <UpdatesManager />}
          {activeTab === 'import'       && <ImportTool />}
          {activeTab === 'health'       && <VAHealth />}
          {activeTab === 'staffapps' && <StaffApplicationsManager />}
          {activeTab === 'if-live'      && <Navigate to="/if-live?tab=admin" replace />}
        </div>
      </main>

      <style>{`
        .admin-main { padding: 1.25rem 2rem; margin-left: 0; }

        @keyframes adminFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          aside { display: none !important; }
          .admin-main { margin-left: 0 !important; padding: 0.75rem 1rem !important; }
        }
      `}</style>
    </div>
  );
}

export default AdminPanel;
