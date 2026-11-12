/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useMemo } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';

const STATUS_META = {
  pending: { label: 'Awaiting approval', icon: Clock, color: 'var(--avg-gold-dark)' },
  active:  { label: 'Confirmed', icon: CheckCircle2, color: 'var(--avg-green)' },
};

function earliestOpenDeadline(bid) {
  const open = (bid.legs || []).filter(l => !l.pirepId && !l.expired && l.deadlineUtc);
  if (!open.length) return null;
  return open.reduce((min, l) => !min || new Date(l.deadlineUtc) < new Date(min) ? l.deadlineUtc : min, null);
}

function untilLabel(bid) {
  if (bid.status === 'pending') return 'Awaiting approval';
  const deadline = earliestOpenDeadline(bid);
  if (!deadline) return 'All legs logged';
  const d = new Date(deadline);
  const hrs = Math.max(0, Math.round((d.getTime() - Date.now()) / (60 * 60 * 1000) * 10) / 10);
  return `Frees ~${d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC (${hrs}h)`;
}

function pilotLabel(bid) {
  if (bid.isMine) return 'You';
  return bid.pilot?.callsign || `${bid.pilot?.first_name || ''} ${bid.pilot?.last_name || ''}`.trim() || 'Unknown pilot';
}

function IFLiveOpsBoard({ bids }) {
  const rows = useMemo(() => {
    return [...bids].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      const da = earliestOpenDeadline(a);
      const db = earliestOpenDeadline(b);
      if (da && db) return new Date(da) - new Date(db);
      return da ? -1 : db ? 1 : 0;
    });
  }, [bids]);

  if (rows.length === 0) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '1rem 0' }}>Nothing booked right now.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map((bid) => {
        const meta = STATUS_META[bid.status] || STATUS_META.pending;
        const StatusIcon = meta.icon;
        return (
          <div key={bid.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.9rem',
            background: bid.isMine ? 'var(--avg-green-pale)' : 'var(--bg-card)',
            border: `1px solid ${bid.isMine ? 'var(--avg-green)' : 'var(--border-color)'}`, borderRadius: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-hover)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <StatusIcon size={14} color={meta.color} />
            </div>
            <div style={{ fontWeight: 800, fontSize: '0.82rem', width: 84, flexShrink: 0 }}>{bid.aircraftRegistration}</div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', width: 96, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pilotLabel(bid)}
            </div>
            <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(bid.legs || []).map(l => `${l.flightNumber} ${l.originIcao}→${l.destIcao}`).join('   ·   ')}
            </div>
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '0.28rem 0.6rem', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
              background: bid.status === 'pending' ? 'var(--avg-gold-pale)' : 'var(--bg-hover)',
              color: bid.status === 'pending' ? 'var(--avg-gold-dark)' : 'var(--text-secondary)',
            }}>
              {untilLabel(bid)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { untilLabel };
export default IFLiveOpsBoard;
