/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';

const REG_ONLY = /^IF-[A-Z0-9]{4}$/i;
const MAKERS = /^(Airbus|Boeing|Bombardier|Embraer|De Havilland( Canada)?|McDonnell Douglas|Cessna|Daher|ATR)\s+/i;

export function splitAircraft(flight) {
  const raw = String(flight?.aircraft || '').trim();
  const registration = flight?.registration || (REG_ONLY.test(raw) ? raw : '');
  if (!raw || raw === registration) return { type: '', airline: '', registration };
  const i = raw.indexOf(' - ');
  return i === -1
    ? { type: raw, airline: '', registration }
    : { type: raw.slice(0, i).trim(), airline: raw.slice(i + 3).trim(), registration };
}

export function RegTag({ registration, onDark = false }) {
  if (!registration) return null;
  return (
    <span title="Live Mode aircraft" style={{
      display: 'inline-block', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
      lineHeight: 1.5, padding: '0 0.35rem', borderRadius: 4, whiteSpace: 'nowrap', verticalAlign: 'middle',
      color: onDark ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
      background: onDark ? 'rgba(255,255,255,0.12)' : 'var(--bg-secondary)',
      border: `1px solid ${onDark ? 'rgba(255,255,255,0.2)' : 'var(--border-color)'}`,
    }}>{registration}</span>
  );
}

export default function AircraftLabel({ flight, inline = false, empty = '—' }) {
  const { type, airline, registration } = splitAircraft(flight);
  if (!type && !registration) return <>{empty}</>;

  if (inline) {
    const short = type.replace(MAKERS, '');
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', minWidth: 0 }}>
        {type && <span title={type}>{short || type}{airline ? ` · ${airline}` : ''}</span>}
        <RegTag registration={registration} />
      </span>
    );
  }

  return (
    <div style={{ lineHeight: 1.3 }}>
      {type && <div>{type}</div>}
      {(airline || registration) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: type ? '0.15rem' : 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {airline && <span>{airline}</span>}
          <RegTag registration={registration} />
        </div>
      )}
    </div>
  );
}
