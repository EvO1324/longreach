/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, X } from 'lucide-react';
import { events as eventsApi } from '../api/client';
import { fmtWhen } from '../pages/Events';

const SEEN_KEY = 'eventsSeen';
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
function markSeen(id) {
  try {
    const seen = [...readSeen(), id].slice(-100);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* storage blocked: it just shows again next time */ }
}

export default function EventPopup() {
  const [ev, setEv] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const onEventsPage = location.pathname.startsWith('/events');

  useEffect(() => {
    let cancelled = false;
    eventsApi.list().then(({ events }) => {
      if (cancelled) return;
      const seen = readSeen();
      const now = Date.now();
      const fresh = events
        .filter(e => e.status === 'published' && !e.myRegistration && !seen.has(e.id))
        .filter(e => now - new Date(e.created).getTime() < RECENT_MS)
        .filter(e => new Date(e.end_at || new Date(e.start_at).getTime() + 12 * 3600 * 1000).getTime() > now)
        .sort((a, b) => new Date(b.created) - new Date(a.created));
      if (fresh[0]) setEv(fresh[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!ev || onEventsPage) return null;

  const close = () => { markSeen(ev.id); setEv(null); };
  const open = () => { markSeen(ev.id); setEv(null); navigate(`/events?id=${ev.id}`); };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="event-popup-title" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', height: 180, background: 'linear-gradient(135deg, var(--avg-green-dark), var(--avg-green))' }}>
          {ev.header_image && <img src={ev.header_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
          <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
          <span style={{ position: 'absolute', left: 14, top: 12, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', padding: '0.2rem 0.55rem', borderRadius: 6, background: 'var(--avg-gold)', color: '#1c1c1a' }}>NEW EVENT</span>
        </div>
        <div style={{ padding: '1.25rem 1.4rem 1.4rem' }}>
          <h2 id="event-popup-title" style={{ margin: '0 0 0.6rem', fontSize: '1.25rem' }}>{ev.title}</h2>
          <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span><CalendarDays size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{fmtWhen(ev.start_at, ev.end_at)}</span>
            <span><MapPin size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{ev.departure_icao} → {ev.arrival_icao}{ev.multiplier > 1 ? ` · ×${ev.multiplier} hours` : ''}</span>
          </div>
          {ev.body && <p style={{ margin: '0 0 1.1rem', fontSize: '0.9rem', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.body}</p>}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={close}>Later</button>
            <button className="btn btn-primary" onClick={open}>{ev.gates?.length ? 'Pick a gate' : 'View event'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
