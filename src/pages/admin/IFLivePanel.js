/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IFLiveProvider, useIFLive } from './iflive/IFLiveContext';
import IFLiveFly from './iflive/IFLiveFly';
import IFLiveFleetBoard from './iflive/IFLiveFleetBoard';
import IFLiveStatsTab from './iflive/IFLiveStatsTab';
import IFLiveLogbook from './iflive/IFLiveLogbook';
import IFLiveLeaderboard from './iflive/IFLiveLeaderboard';
import IFLiveAccessList from './iflive/IFLiveAccessList';
import IFLiveOrgMembers from './iflive/IFLiveOrgMembers';
import IFLivePlayground from './iflive/IFLivePlayground';
import IFLiveAdminTab from './iflive/IFLiveAdminTab';
import { isDeveloper } from '../../components/DeveloperBadge';

// The VA's Infinite Flight organisation (REACT_APP_IF_LIVE_ORG_ID)
const PILOT_ORG_ID = process.env.REACT_APP_IF_LIVE_ORG_ID || null;

const TITLES = {
  dashboard: 'Live Mode',
  fleet:     'Fleet',
  logbook:   'Logbook',
  pilots:    'Pilots',
  stats:     'Stats',
  playground: 'API playground',
  admin:     'Live admin',
};
// Old ?tab= values from before the pages were merged still land somewhere sensible.
const ALIASES = { book: 'dashboard', bookings: 'dashboard', map: 'fleet', schedule: 'fleet', history: 'logbook', leaderboard: 'pilots' };

function IFLivePanelInner({ user }) {
  const {
    status, loading, connecting, handleConnect, handleDisconnect,
    primaryOrg, chooseOrg, orgId,
  } = useIFLive();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const isAdmin = user?.role === 'admin' || isDeveloper(user);
  const allowedTab = TITLES[requested] && ((requested !== 'playground' && requested !== 'admin') || isAdmin);
  const tab = allowedTab ? requested : (ALIASES[requested] || 'dashboard');
  const goTo = (next, extra = {}) => setSearchParams(next === 'dashboard' ? extra : { tab: next, ...extra });

  useEffect(() => {
    if (PILOT_ORG_ID && status?.connected && !status.primary_org_id) {
      chooseOrg({ id: PILOT_ORG_ID }, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, status?.primary_org_id]);

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;
  }

  const header = (
    <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0 }}>{TITLES[tab]}</h2>
      {status?.connected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--avg-green)' }} />
            {primaryOrg?.name || 'Connected'}
          </span>
          <button onClick={handleDisconnect} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit', textDecoration: 'underline' }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );

  if (!status?.allowed) {
    return (
      <div>
        {header}
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Not available</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Live Mode is limited to invited pilots for now.
          </div>
        </div>
      </div>
    );
  }

  const ready = status.connected && status.primary_org_id;

  if (tab === 'admin') {
    return <div>{header}<IFLiveAdminTab /></div>;
  }

  if (tab === 'stats') {
    return <div>{header}<IFLiveStatsTab onNavigate={goTo} /></div>;
  }

  if (tab === 'pilots') {
    return (
      <div>
        {header}
        {ready && <IFLiveLeaderboard />}
        <IFLiveAccessList />
        {ready && <IFLiveOrgMembers orgId={orgId} />}
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div>
        {header}
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem' }}>Connect your Infinite Flight account</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Sign in with Infinite Flight to book an aircraft from the Live fleet. Flights you fly on a booking are filed from your IF logbook.
          </div>
          <button onClick={handleConnect} disabled={connecting} className="btn btn-primary" style={{ opacity: connecting ? 0.6 : 1 }}>
            {connecting ? 'Redirecting…' : 'Connect Infinite Flight'}
          </button>
        </div>
      </div>
    );
  }

  if (!status.primary_org_id) {
    return <div>{header}<div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Setting up…</div></div>;
  }

  if (tab === 'playground') {
    return <div>{header}<IFLivePlayground /></div>;
  }
  if (tab === 'fleet') {
    return <div>{header}<IFLiveFleetBoard onBook={id => goTo('dashboard', { ac: id })} /></div>;
  }
  if (tab === 'logbook') {
    return <div>{header}<IFLiveLogbook user={user} /></div>;
  }
  return (
    <div>
      {header}
      <IFLiveFly focusAircraftId={searchParams.get('ac')} onNavigate={goTo} />
    </div>
  );
}

function IFLivePanel({ user }) {
  return (
    <IFLiveProvider returnTo="/if-live">
      <IFLivePanelInner user={user} />
    </IFLiveProvider>
  );
}

export default IFLivePanel;
