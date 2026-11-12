/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { badges as badgesApi } from '../api/client';
import { IF_ROLES } from './IFRoleBadges';

export function formatBadgeHours(hours) {
  const h = Number(hours) || 0;
  return h >= 1000 && h % 1000 === 0 ? `${h / 1000}k` : `${h}`;
}

export function roleLabel(roleId) {
  return IF_ROLES[roleId]?.label || `IF role ${roleId}`;
}

export function badgeSummary(badge) {
  if (badge.type === 'event') return badge.description || 'Event';
  return badge.type === 'if_role'
    ? `${roleLabel(badge.if_role_id)} on the Infinite Flight Community`
    : `${Number(badge.hours_required).toLocaleString()} hours`;
}

// Hour badges first (lowest to highest), then role badges, then event badges.
const KIND_ORDER = { hours: 0, if_role: 1, event: 2 };
export function sortBadges(list) {
  return [...list].sort((a, b) => {
    const kind = (KIND_ORDER[a.type] ?? 0) - (KIND_ORDER[b.type] ?? 0);
    if (kind) return kind;
    if (a.type === 'event') return String(a.name).localeCompare(String(b.name));
    return a.type === 'if_role' ? a.if_role_id - b.if_role_id : a.hours_required - b.hours_required;
  });
}

export function BadgeIcon({ badge, size = 56, title }) {
  const tip = title ?? `${badge.name} — ${badgeSummary(badge)}`;
  if (badge.image_url) {
    return <img src={badge.image_url} alt={badge.name} title={tip} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />;
  }
  const isRole = badge.type === 'if_role';
  const isEvent = badge.type === 'event';
  const text = isEvent ? (String(badge.name).match(/\d{4}/)?.[0] || String(badge.name).slice(0, 4))
    : isRole ? roleLabel(badge.if_role_id).replace(/^IFATC\s+/, '') : formatBadgeHours(badge.hours_required);
  const sub = isEvent ? 'EVENT' : isRole ? (roleLabel(badge.if_role_id).startsWith('IFATC ') ? 'IFATC' : 'IFC') : 'HRS';
  const fontScale = isRole ? Math.min(0.3, 1.5 / Math.max(text.length, 1)) : 0.32;
  return (
    <div title={tip} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: isRole ? (IF_ROLES[badge.if_role_id]?.color || '#546e7a') : 'var(--avg-green)', color: '#fff',
      border: `${Math.max(2, Math.round(size / 18))}px solid var(--avg-gold, var(--brand-accent))`,
      boxSizing: 'border-box', lineHeight: 1, overflow: 'hidden', textAlign: 'center',
    }}>
      <span style={{ fontWeight: 800, fontSize: size * fontScale }}>{text}</span>
      <span style={{ fontWeight: 600, fontSize: Math.max(8, size * 0.15), letterSpacing: '0.05em', marginTop: size * 0.03 }}>{sub}</span>
    </div>
  );
}

export function PilotBadges({ userId, title = 'Badges', style = { marginTop: '2rem' } }) {
  const [earned, setEarned] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    badgesApi.forPilot(userId)
      .then(d => { if (!cancelled) setEarned(d.badges || []); })
      .catch(() => { if (!cancelled) setEarned([]); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!earned || earned.length === 0) return null;

  return (
    <div className="card" style={style}>
      <h3 style={{ margin: '0 0 1rem' }}>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
        {sortBadges(earned).map(b => (
          <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: 84, textAlign: 'center' }}>
            <BadgeIcon badge={b} />
            <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.25 }}>{b.name}</div>
            {b.earned_at && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {new Date(b.earned_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
