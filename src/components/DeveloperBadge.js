/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';

import brand from '../brand';
const DEVELOPER_EMAILS = String(process.env.REACT_APP_DEVELOPER_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export function isDeveloper(user) {
  return !!user?.email && DEVELOPER_EMAILS.includes(String(user.email).toLowerCase());
}

export function DeveloperBadge() {
  return (
    <span title={`${brand.abbreviation} Developer`} style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '1px 5px', borderRadius: '4px',
      background: 'rgba(25,118,210,0.1)', color: '#1976d2',
      border: '1px solid rgba(25,118,210,0.25)', flexShrink: 0, lineHeight: 1.6, cursor: 'default',
    }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
      Developer
    </span>
  );
}
