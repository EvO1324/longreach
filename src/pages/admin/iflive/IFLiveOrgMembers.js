/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ifLive } from '../../../api/client';

const ROLES = { 0: 'Member', 1: 'Admin', 2: 'Owner' };

export default function IFLiveOrgMembers({ orgId }) {
  const [members, setMembers] = useState(null);

  useEffect(() => {
    let cancelled = false;
    ifLive.orgMembers(orgId)
      .then(d => { if (!cancelled) setMembers(d.available ? (d.members || []) : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgId]);

  if (!members || members.length === 0) return null;
  const totalLifts = members.reduce((n, m) => n + (m.activeLifts || 0), 0);

  return (
    <div className="card" style={{ marginTop: '1.5rem', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={{ margin: 0 }}>Infinite Flight organisation</h3>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {members.length} member{members.length === 1 ? '' : 's'}, {totalLifts} active lift{totalLifts === 1 ? '' : 's'}.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Member</th><th>Role</th><th>Joined</th><th style={{ textAlign: 'right' }}>Active lifts</th></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.userId}>
                <td style={{ fontWeight: 600 }}>{m.username || 'Unknown'}</td>
                <td>{ROLES[m.role] || 'Member'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: m.activeLifts ? 600 : 400 }}>{m.activeLifts || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
