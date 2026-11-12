/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { badges as badgesApi } from '../api/client';
import { BadgeIcon, badgeSummary, sortBadges } from './PilotBadge';

export default function BadgeUnlockedModal() {
  const [unseen, setUnseen] = useState([]);

  useEffect(() => {
    let cancelled = false;
    badgesApi.unseen()
      .then(d => { if (!cancelled) setUnseen(d.badges || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (unseen.length === 0) return null;

  const sorted = sortBadges(unseen);
  const top = sorted[sorted.length - 1];
  const others = sorted.slice(0, -1);

  const dismiss = () => {
    setUnseen([]);
    badgesApi.markSeen().catch(() => {});
  };

  return (
    <div onClick={dismiss} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
        width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        padding: '2rem 1.75rem 1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--avg-gold)', marginBottom: '1.25rem' }}>
          {unseen.length > 1 ? `${unseen.length} badges unlocked` : 'Badge unlocked'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <BadgeIcon badge={top} size={104} />
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.35rem' }}>{top.name}</div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {top.description || (top.type === 'if_role' ? `Recognised as ${badgeSummary(top)}.` : `You've flown ${badgeSummary(top)}.`)}
        </div>

        {others.length > 0 && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Also unlocked</div>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              {others.map(b => <BadgeIcon key={b.id} badge={b} size={44} />)}
            </div>
          </div>
        )}

        <button onClick={dismiss} className="btn btn-primary" style={{ marginTop: '1.75rem', width: '100%', padding: '0.7rem' }}>
          Nice
        </button>
      </div>
    </div>
  );
}
