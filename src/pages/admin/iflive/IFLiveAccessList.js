/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ifLiveStats } from '../../../api/client';
import UserAvatar from '../../../components/UserAvatar';
import { DeveloperBadge } from '../../../components/DeveloperBadge';
import { Users, ShieldCheck, Satellite } from 'lucide-react';

function Badge({ children, tone }) {
  const tones = {
    staff: { bg: 'var(--avg-gold-pale)', fg: 'var(--avg-gold-dark)' },
    live:  { bg: 'var(--avg-green-pale)', fg: 'var(--avg-green)' },
  };
  const c = tones[tone] || tones.live;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: c.bg, color: c.fg, padding: '2px 7px', borderRadius: '999px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Tile({ member }) {
  const hasCallsignOrRank = member.callsign || member.rank;
  return (
    <div className="if-pilot-tile" style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.8rem',
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
      padding: '0.9rem 1rem', transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    }}>
      <UserAvatar user={{ ifc_username: member.ifcUsername, first_name: member.name }} size={48} fontSize="1rem" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
          {member.name}
        </div>
        {hasCallsignOrRank ? (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
            {member.callsign && (
              <span style={{
                fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-primary)',
                background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: 5,
                padding: '0.1rem 0.4rem', lineHeight: 1.4,
              }}>
                {member.callsign}
              </span>
            )}
            {member.rank && (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{member.rank}</span>
            )}
          </div>
        ) : null}
        {member.ifcUsername && (
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', opacity: 0.75, marginTop: hasCallsignOrRank ? '0.1rem' : '0.15rem', wordBreak: 'break-word' }}>
            @{member.ifcUsername}
          </div>
        )}
        {!hasCallsignOrRank && !member.ifcUsername && (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>—</div>
        )}
        {(member.isStaff || member.liveAccess || member.isDeveloper) && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {member.isStaff && <Badge tone="staff">{member.staffRole || 'Staff'}</Badge>}
            {member.liveAccess && <Badge tone="live">Live access</Badge>}
            {member.isDeveloper && <DeveloperBadge />}
          </div>
        )}
      </div>
    </div>
  );
}

function IFLiveAccessList() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ifLiveStats.members()
      .then(d => setMembers(d.members || []))
      .catch(() => setError('Could not load the pilot list.'));
  }, []);

  if (error) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{error}</div>;
  }

  if (!members) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;
  }

  const staffCount = members.filter(m => m.isStaff).length;
  const liveOnlyCount = members.length - staffCount;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.1rem', marginBottom: '1.25rem', flexWrap: 'wrap',
        background: '#16201b', color: '#eef3ea', borderRadius: 14, padding: '0.9rem 1.15rem',
        boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={16} color="#e8c766" />
          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 800 }}>{staffCount}</span>
          <span style={{ fontSize: '0.78rem', color: 'rgba(238,243,234,0.65)' }}>staff</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid rgba(238,243,234,0.2)', paddingLeft: '1.1rem' }}>
          <Satellite size={16} color="#6fe08f" />
          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 800 }}>{liveOnlyCount}</span>
          <span style={{ fontSize: '0.78rem', color: 'rgba(238,243,234,0.65)' }}>with Live access</span>
        </div>
      </div>

      {members.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
          padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem',
        }}>
          <Users size={22} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
          <div>Nobody has Live Mode access yet.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {members.map(m => <Tile key={m.id} member={m} />)}
        </div>
      )}

      <style>{`
        .if-pilot-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
      `}</style>
    </div>
  );
}

export default IFLiveAccessList;
