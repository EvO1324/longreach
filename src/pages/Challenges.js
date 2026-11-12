/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { challenges as challengesApi } from '../api/client';
import { showToast } from '../components/Toast';
import Loader from '../components/Loader';
import { getAirport } from '../services/airportService';
import { useNavigate, useParams } from 'react-router-dom';
import { colors as BRAND } from '../brand';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtHours(h) {
  if (!h && h !== 0) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

const CSS = `
  .ch-fade { animation: chFade 0.3s ease both; }
  @keyframes chFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .ch-card { transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer; }
  .ch-card:hover { border-color: var(--avg-green) !important; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }

  .ch-leg-row:hover { background: var(--bg-hover) !important; }
  .ch-file-btn { transition: opacity 0.15s, transform 0.1s; }
  .ch-file-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .ch-enroll-btn { transition: opacity 0.15s, transform 0.1s; }
  .ch-enroll-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }

  @media (max-width: 840px) {
    .ch-detail-grid { grid-template-columns: 1fr !important; }
    .ch-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
  @media (max-width: 480px) {
    .ch-next-row { flex-direction: column !important; align-items: flex-start !important; }
    .ch-header-row { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
    .ch-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
`;

// Globe
const MiniGlobe = memo(function MiniGlobe({ legs, completions }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const [ready, setReady] = useState(!!window.Globe);
  const [arcs, setArcs] = useState([]);
  const [points, setPoints] = useState([]);

  useEffect(() => {
    if (window.Globe) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/globe.gl@2.27.2/dist/globe.gl.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!legs.length) return;
    let dead = false;
    (async () => {
      const icaos = [...new Set(legs.flatMap(l => [l.departure_icao, l.arrival_icao]))];
      const coords = {};
      await Promise.all(icaos.map(async icao => {
        try { const ap = await getAirport(icao); if (ap?.lat && ap?.lng) coords[icao] = ap; } catch {}
      }));
      if (dead) return;
      const doneIds = new Set((completions || []).map(c => c.leg));
      setArcs(legs.filter(l => coords[l.departure_icao] && coords[l.arrival_icao]).map(l => ({
        startLat: coords[l.departure_icao].lat, startLng: coords[l.departure_icao].lng,
        endLat: coords[l.arrival_icao].lat, endLng: coords[l.arrival_icao].lng,
        done: doneIds.has(l.id),
      })));
      const pm = {};
      legs.forEach(l => {
        if (coords[l.departure_icao]) pm[l.departure_icao] = coords[l.departure_icao];
        if (coords[l.arrival_icao]) pm[l.arrival_icao] = coords[l.arrival_icao];
      });
      setPoints(Object.entries(pm).map(([icao, c]) => ({ icao, lat: c.lat, lng: c.lng })));
    })();
    return () => { dead = true; };
  }, [legs, completions]);

  useEffect(() => {
    if (!globeRef.current || !arcs.length) return;
    globeRef.current.arcsData(arcs).arcColor(a => a.done
      ? [`rgba(${BRAND.primaryRgb}, 0.2)`, 'rgba(74,222,128,0.9)']
      : [`rgba(${BRAND.accentRgb}, 0.1)`, `rgba(${BRAND.accentRgb}, 0.85)`]);
  }, [arcs]);

  useEffect(() => {
    if (!ready || !mountRef.current || globeRef.current) return;
    const w = mountRef.current.clientWidth || 320;
    const g = window.Globe()
      .globeImageUrl('/earth-dark.jpg')
      .backgroundImageUrl('/night-sky.png')
      .arcsData(arcs)
      .arcColor(a => a.done
        ? [`rgba(${BRAND.primaryRgb}, 0.2)`, 'rgba(74,222,128,0.9)']
        : [`rgba(${BRAND.accentRgb}, 0.1)`, `rgba(${BRAND.accentRgb}, 0.85)`])
      .arcAltitudeAutoScale(0.35).arcStroke(0.6)
      .arcDashLength(1).arcDashGap(0).arcDashAnimateTime(0)
      .pointsData(points).pointLat(p => p.lat).pointLng(p => p.lng)
      .pointColor(() => `rgba(${BRAND.accentRgb}, 0.9)`).pointRadius(0.28).pointAltitude(0.01)
      .width(w).height(260);
    g(mountRef.current);
    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.4;
    if (arcs.length) {
      const mid = { lat: (arcs[0].startLat + arcs[arcs.length - 1].endLat) / 2, lng: (arcs[0].startLng + arcs[arcs.length - 1].endLng) / 2 };
      g.pointOfView({ ...mid, altitude: 1.1 }, 0);
    } else {
      g.pointOfView({ lat: -25, lng: 133, altitude: 1.1 }, 0);
    }
    globeRef.current = g;
  }, [ready, arcs, points]); // eslint-disable-line

  return <div ref={mountRef} style={{ width: '100%', height: 260 }} />;
});

// Challenge card (list view)
function ChallengeCard({ challenge, legs, enrolledCount, onClick }) {
  const now = new Date().toISOString().slice(0, 10);
  const hasStarted = challenge.start_date ? challenge.start_date <= now : true;
  const days = daysUntil(hasStarted ? challenge.end_date : challenge.start_date);
  let rewards = [];
  try { rewards = JSON.parse(challenge.rewards || '[]'); } catch {}
  const hasRewards = rewards.some(r => r?.bonus_hours > 0);

  return (
    <div className="ch-card" onClick={onClick} style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {challenge.image_url && (
        <div style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
          <img src={challenge.image_url} alt={challenge.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.parentElement.style.display = 'none'; }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
        </div>
      )}
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      {/* Status dot + name */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasStarted ? 'var(--avg-green)' : 'var(--avg-gold)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: hasStarted ? 'var(--avg-green)' : 'var(--avg-gold)' }}>
            {hasStarted ? 'Active' : 'Upcoming'}
          </span>
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
          {challenge.name}
        </div>
        {challenge.description && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
            {challenge.description}
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{legs.length}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>legs</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{enrolledCount || 0}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>enrolled</div>
        </div>
        {days !== null && days >= 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: !hasStarted ? 'var(--avg-gold)' : days <= 5 ? '#e53935' : 'var(--text-primary)', lineHeight: 1 }}>{days}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{hasStarted ? 'days left' : 'days until'}</div>
          </div>
        )}
        {hasRewards && (
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--avg-gold)', background: 'rgba(var(--brand-accent-rgb),0.1)', padding: '0.25rem 0.7rem', borderRadius: 20, border: '1px solid rgba(var(--brand-accent-rgb),0.25)' }}>
            Prizes
          </div>
        )}
        <div style={{ fontSize: '0.8rem', color: 'var(--avg-green)', fontWeight: 600 }}>
          View →
        </div>
      </div>
      </div>
    </div>
  );
}

// Leg row
function LegRow({ leg, index, done, current, onFile }) {
  return (
    <div className="ch-leg-row" style={{
      display: 'flex', alignItems: 'center', gap: '0.875rem',
      padding: '0.75rem 1rem',
      borderBottom: '1px solid var(--border-color)',
      background: current ? 'rgba(var(--brand-accent-rgb),0.03)' : 'transparent',
      position: 'relative', transition: 'background 0.1s',
    }}>
      {current && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--avg-gold)', borderRadius: '0 2px 2px 0' }} />}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--avg-green)' : current ? 'transparent' : 'var(--bg-secondary)',
        border: `1.5px solid ${done ? 'var(--avg-green)' : current ? 'var(--avg-gold)' : 'var(--border-color)'}`,
        fontSize: '0.68rem', fontWeight: 800, fontFamily: 'monospace',
        color: done ? 'white' : current ? 'var(--avg-gold)' : 'var(--text-secondary)',
      }}>
        {done
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          : index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', textDecorationColor: 'var(--border-color)' }}>{leg.departure_icao}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={current ? 'var(--avg-gold)' : done ? 'var(--border-color)' : 'var(--text-secondary)'} strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', textDecorationColor: 'var(--border-color)' }}>{leg.arrival_icao}</span>
          {leg.flight_number && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.7 }}>{leg.flight_number}</span>}
        </div>
        {(leg.livery_name || leg.notes) && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {leg.livery_name}{leg.livery_name && leg.notes && ' · '}{leg.notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {leg.multiplier && parseFloat(leg.multiplier) > 1.0 && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', color: current ? 'var(--avg-gold)' : 'var(--text-secondary)', background: current ? 'rgba(var(--brand-accent-rgb),0.08)' : 'transparent', padding: current ? '0.15rem 0.45rem' : 0, borderRadius: 4 }}>
            ×{parseFloat(leg.multiplier).toFixed(2)}
          </span>
        )}
        {current && onFile && (
          <button onClick={onFile} className="ch-file-btn" style={{ padding: '0.35rem 0.875rem', background: 'var(--avg-gold)', color: '#1a1200', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            File →
          </button>
        )}
      </div>
    </div>
  );
}

// Leaderboard entry
function LbEntry({ entry, rank, isMe, totalLegs }) {
  const medals = ['1st', '2nd', '3rd'];
  const isCompleted = entry.status === 'completed';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.6rem 0.875rem',
      background: isMe ? 'rgba(var(--brand-primary-rgb),0.06)' : 'transparent',
      borderBottom: '1px solid var(--border-color)',
      borderLeft: isMe ? '2px solid var(--avg-green)' : '2px solid transparent',
    }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', minWidth: 24, color: rank === 0 ? 'var(--avg-gold)' : rank === 1 ? '#9e9e9e' : rank === 2 ? '#cd7f32' : 'var(--text-secondary)' }}>
        {medals[rank] || `#${rank + 1}`}
      </span>
      <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: isMe ? 700 : 400, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.expand?.user?.first_name} {(entry.expand?.user?.last_name || '').charAt(0).toUpperCase()}.
        {isMe && <span style={{ marginLeft: '0.4rem', fontSize: '0.62rem', color: 'var(--avg-green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>you</span>}
      </span>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isCompleted
          ? <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--avg-green)', fontWeight: 600 }}>{fmtHours(entry.total_flight_time)}</span>
          : <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{entry.current_leg_index ?? 0}/{totalLegs} legs</span>
        }
      </div>
    </div>
  );
}

function fmtDuration(enrolledAt, completedAt) {
  if (!enrolledAt || !completedAt) return null;
  const days = Math.ceil((new Date(completedAt) - new Date(enrolledAt)) / 86400000);
  return days === 1 ? '1 day' : `${days} days`;
}

// Completion modal
function CompletionModal({ entry, challenge, legs, completions, onClose }) {
  const placement = entry.placement;
  const placementBonus = entry.placement_bonus_hours || 0;
  const duration = fmtDuration(entry.enrolled_at, entry.completed_at);
  const placementLabels = ['1st', '2nd', '3rd'];
  const placementEmojis = ['🥇', '🥈', '🥉'];
  const isTop3 = placement >= 1 && placement <= 3;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '2rem', maxWidth: 440, width: '100%', textAlign: 'center', animation: 'chFade 0.3s ease both' }}>

        {/* Trophy / placement */}
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>
          {isTop3 ? placementEmojis[placement - 1] : '🏆'}
        </div>

        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Challenge Complete!
        </h2>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          You've completed <strong style={{ color: 'var(--text-primary)' }}>{challenge.name}</strong>
        </p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Legs flown', value: legs.length },
            { label: 'Flight time', value: fmtHours(entry.total_flight_time) },
            { label: 'Duration', value: duration || '—' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '0.875rem 0.5rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Placement */}
        {isTop3 && (
          <div style={{ background: 'rgba(var(--brand-accent-rgb),0.08)', border: '1px solid rgba(var(--brand-accent-rgb),0.25)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--avg-gold)', marginBottom: '0.3rem' }}>
              {placementLabels[placement - 1]} Place
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {placementBonus > 0
                ? `+${placementBonus}h bonus hours have been credited to your account`
                : `You finished in the top 3!`}
            </div>
          </div>
        )}

        {!isTop3 && placement && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            You finished in position #{placement}
          </div>
        )}

        <button onClick={onClose} style={{ width: '100%', padding: '0.75rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          View Results
        </button>
      </div>
    </div>
  );
}

// Completion banner
function CompletionBanner({ entry, challenge, legs }) {
  const placement = entry.placement;
  const placementBonus = entry.placement_bonus_hours || 0;
  const duration = fmtDuration(entry.enrolled_at, entry.completed_at);
  const isTop3 = placement >= 1 && placement <= 3;
  const placementLabels = ['1st', '2nd', '3rd'];
  const placementEmojis = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--brand-primary-rgb),0.3)', borderLeft: '3px solid var(--avg-green)', borderRadius: '0 12px 12px 0', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--avg-green)' }}>
              ✓ Completed
            </span>
            {isTop3 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--avg-gold)', background: 'rgba(var(--brand-accent-rgb),0.1)', padding: '0.1rem 0.5rem', borderRadius: 20 }}>
                {placementEmojis[placement - 1]} {placementLabels[placement - 1]} Place
              </span>
            )}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            You completed {challenge.name}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Legs', value: legs.length },
              { label: 'Flight time', value: fmtHours(entry.total_flight_time) },
              ...(duration ? [{ label: 'Duration', value: duration }] : []),
              ...(placementBonus > 0 ? [{ label: 'Bonus earned', value: `+${placementBonus}h`, accent: 'var(--avg-gold)' }] : []),
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{s.label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: s.accent || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        {!isTop3 && placement && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>#{placement} overall</div>
        )}
      </div>
    </div>
  );
}
function ChallengeDetail({ challenge, legs, enrolledCount, user }) {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [lbEntries, setLbEntries] = useState([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const prevStatusRef = useRef(null);

  const load = useCallback(async () => {
    setLoadingEntry(true);
    try {
      const [entryData, lbData] = await Promise.all([
        challengesApi.myEntry(challenge.id),
        challengesApi.leaderboard(challenge.id),
      ]);
      setEntry(entryData.entry);
      setCompletions(entryData.completions || []);
      setLbEntries(lbData.entries || []);
      // Show modal if just completed (status transitioned from non-completed to completed)
      if (entryData.entry?.status === 'completed' && prevStatusRef.current && prevStatusRef.current !== 'completed') {
        setShowCompletionModal(true);
      }
      prevStatusRef.current = entryData.entry?.status || null;
    } catch {}
    finally { setLoadingEntry(false); }
  }, [challenge.id]);

  useEffect(() => { load(); }, [load]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const d = await challengesApi.enroll(challenge.id);
      setEntry(d.entry);
      showToast('Enrolled! Good luck.', 'success');
      load();
    } catch (err) { showToast(err?.message || 'Failed to enroll', 'error'); }
    finally { setEnrolling(false); }
  };

  const handleFilePirep = () => {
    const nextLeg = entry && legs[entry.current_leg_index];
    if (!nextLeg) return;
    navigate('/log-flight', {
      state: {
        prefill: {
          challenge_leg_id: nextLeg.id,
          challenge_name: challenge.name,
          departure_icao: nextLeg.departure_icao,
          arrival_icao: nextLeg.arrival_icao,
          flight_number: nextLeg.flight_number || '',
          aircraft: nextLeg.livery_name || '',
          aircraft_restriction: nextLeg.aircraft_restriction || '',
          multiplier: nextLeg.multiplier && parseFloat(nextLeg.multiplier) !== 1.0 ? {
            code: `LEG${(entry.current_leg_index || 0) + 1}`,
            value: parseFloat(nextLeg.multiplier),
            name: `${challenge.name} — Leg ${(entry.current_leg_index || 0) + 1}`,
          } : null,
        },
      },
    });
  };

  const now = new Date().toISOString().slice(0, 10);
  const hasStarted = challenge.start_date ? challenge.start_date <= now : true;
  const daysUntilStart = challenge.start_date ? Math.ceil((new Date(challenge.start_date) - new Date()) / 86400000) : 0;
  const days = daysUntil(challenge.end_date);
  const doneIds = new Set(completions.map(c => c.leg));
  const completed = entry?.current_leg_index ?? 0;
  const pct = legs.length ? Math.round((completed / legs.length) * 100) : 0;
  const nextLeg = entry ? legs[entry.current_leg_index] : null;
  let rewards = [];
  try { rewards = JSON.parse(challenge.rewards || '[]'); } catch {}
  const hasRewards = rewards.some(r => r?.bonus_hours > 0);
  const isClosed = challenge.status === 'closed' || (challenge.end_date && challenge.end_date < now);

  return (
    <div className="ch-fade">
      {/* Completion modal */}
      {showCompletionModal && entry && (
        <CompletionModal
          entry={entry}
          challenge={challenge}
          legs={legs}
          completions={completions}
          onClose={() => setShowCompletionModal(false)}
        />
      )}

      {/* Back + header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => navigate('/challenges')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'inherit' }}>
          ← All challenges
        </button>
        {challenge.image_url && (
          <div style={{ borderRadius: '12px', overflow: 'hidden', height: 200, marginBottom: '1.25rem', position: 'relative' }}>
            <img src={challenge.image_url} alt={challenge.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.parentElement.style.display = 'none'; }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
            <div style={{ position: 'absolute', bottom: '1rem', left: '1.25rem' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{challenge.name}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }} className="ch-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isClosed ? 'var(--text-secondary)' : hasStarted ? 'var(--avg-green)' : 'var(--avg-gold)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: isClosed ? 'var(--text-secondary)' : hasStarted ? 'var(--avg-green)' : 'var(--avg-gold)' }}>
                {isClosed ? 'Closed' : hasStarted ? 'Active' : 'Upcoming'}
              </span>
              {entry?.status === 'completed' && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--avg-green)' }}>· Completed ✓</span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, display: challenge.image_url ? 'none' : undefined }}>{challenge.name}</h2>
            {challenge.description && (
              <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 560 }}>{challenge.description}</p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
            {!loadingEntry && !entry && !isClosed && (
              <button onClick={handleEnroll} disabled={enrolling} className="ch-enroll-btn" style={{ padding: '0.65rem 1.5rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: 8, cursor: enrolling ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: enrolling ? 0.7 : 1 }}>
                {enrolling ? 'Enrolling…' : hasStarted ? 'Enroll Now' : 'Enroll Early'}
              </button>
            )}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
              {fmtDate(challenge.start_date)} — {fmtDate(challenge.end_date)}
              {!hasStarted && daysUntilStart > 0 && <div style={{ color: 'var(--avg-gold)', fontWeight: 600 }}>Starts in {daysUntilStart}d</div>}
              {hasStarted && !isClosed && days !== null && days >= 0 && <div style={{ color: days <= 5 ? '#e53935' : 'var(--text-secondary)', fontWeight: days <= 5 ? 600 : 400 }}>{days > 0 ? `${days} day${days !== 1 ? 's' : ''} left` : 'Ends today'}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1.25rem', alignItems: 'start' }} className="ch-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Completion banner */}
          {entry?.status === 'completed' && (
            <CompletionBanner entry={entry} challenge={challenge} legs={legs} />
          )}

          {/* Stats strip */}
          {entry && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }} className="ch-stat-grid">
                {[
                  { label: 'Progress', value: `${completed}/${legs.length}`, sub: `${pct}%`, accent: pct === 100 ? 'var(--avg-green)' : undefined },
                  { label: 'Flight time', value: fmtHours(entry.total_flight_time) },
                  { label: 'Enrolled', value: enrolledCount || '—', sub: 'pilots' },
                  { label: hasStarted ? 'Days left' : 'Days until', value: hasStarted ? (days !== null && days >= 0 ? days : '—') : daysUntilStart, sub: hasStarted ? fmtDate(challenge.end_date) : fmtDate(challenge.start_date), accent: hasStarted && days !== null && days <= 5 ? '#e53935' : undefined },
                ].map((t, i) => (
                  <div key={i} style={{ padding: '1rem', borderRight: i < 3 ? '1px solid var(--border-color)' : 'none' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{t.label}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: t.accent || 'var(--text-primary)', lineHeight: 1 }}>{t.value}</div>
                    {t.sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t.sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 6, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 6, width: `${pct}%`, background: pct === 100 ? 'var(--avg-green)' : 'linear-gradient(90deg, var(--avg-gold), var(--avg-green))', transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 30 }}>{pct}%</span>
              </div>
            </div>
          )}

          {/* Next leg */}
          {nextLeg && (entry?.status === 'active' || entry?.status === 'enrolled') && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--brand-accent-rgb),0.25)', borderLeft: '3px solid var(--avg-gold)', borderRadius: '0 10px 10px 0', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }} className="ch-next-row">
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--avg-gold)', marginBottom: '0.4rem' }}>
                  Up next — Leg {(entry?.current_leg_index ?? 0) + 1} of {legs.length}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.35rem' }}>{nextLeg.departure_icao}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--avg-gold)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.35rem' }}>{nextLeg.arrival_icao}</span>
                  {nextLeg.flight_number && <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{nextLeg.flight_number}</span>}
                  {nextLeg.multiplier && parseFloat(nextLeg.multiplier) > 1.0 && <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--avg-gold)', background: 'rgba(var(--brand-accent-rgb),0.1)', padding: '0.15rem 0.5rem', borderRadius: 4 }}>×{parseFloat(nextLeg.multiplier).toFixed(2)}</span>}
                </div>
                {nextLeg.livery_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{nextLeg.livery_name}</div>}
              </div>
              {hasStarted
                ? <button onClick={handleFilePirep} className="ch-file-btn" style={{ padding: '0.65rem 1.5rem', background: 'var(--avg-gold)', color: '#1a1200', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', whiteSpace: 'nowrap', flexShrink: 0 }}>File PIREP →</button>
                : <div style={{ padding: '0.65rem 1rem', background: 'rgba(var(--brand-accent-rgb),0.08)', color: 'var(--avg-gold)', border: '1px solid rgba(var(--brand-accent-rgb),0.2)', borderRadius: 8, fontWeight: 600, fontSize: '0.78rem', flexShrink: 0 }}>Starts in {daysUntilStart}d</div>
              }
            </div>
          )}

          {/* Legs list */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Route · {legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
              {entry && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: completed === legs.length ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{completed}/{legs.length} complete</span>}
            </div>
            {legs.map((leg, i) => {
              const done = doneIds.has(leg.id);
              const current = !done && i === (entry?.current_leg_index ?? -1) && (entry?.status === 'active' || entry?.status === 'enrolled');
              return <LegRow key={leg.id} leg={leg} index={i} done={done} current={current} onFile={current && hasStarted ? handleFilePirep : null} />;
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#070a0f', height: 260 }}><MiniGlobe legs={legs} completions={completions} /></div>
            <div style={{ padding: '0.5rem 0.875rem', display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: 14, height: 2, background: 'rgba(var(--brand-accent-rgb),0.9)', borderRadius: 2, display: 'inline-block' }} />Upcoming</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: 14, height: 2, background: 'rgba(74,222,128,0.9)', borderRadius: 2, display: 'inline-block' }} />Completed</span>
            </div>
          </div>

          {hasRewards && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Prizes</span>
              </div>
              <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {rewards.slice(0, 3).map((r, i) => r?.bonus_hours > 0 ? (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.6rem', borderRadius: 7, background: 'var(--bg-secondary)' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--avg-gold)' : 'var(--text-primary)' }}>{['1st', '2nd', '3rd'][i]} Place</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--avg-green)', fontSize: '0.82rem' }}>+{r.bonus_hours}h</span>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Leaderboard</span>
            </div>
            {lbEntries.length === 0
              ? <div style={{ padding: '1.25rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No pilots enrolled yet — be the first.</div>
              : <div>
                  {lbEntries.slice(0, 20).map((e, i) => <LbEntry key={e.id} entry={e} rank={i} isMe={e.user === user?.id} totalLegs={legs.length} />)}
                  {lbEntries.length > 20 && <div style={{ padding: '0.6rem 0.875rem', fontSize: '0.72rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>+{lbEntries.length - 20} more pilots enrolled</div>}
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// Challenge list (index)
function ChallengeList({ challenges, legsMap, enrolledMap, navigate }) {
  const now = new Date().toISOString().slice(0, 10);
  const active   = challenges.filter(c => c.status === 'active' && c.end_date >= now);
  const past     = challenges.filter(c => c.status === 'closed' || (c.status !== 'active' && c.end_date < now));

  if (challenges.length === 0) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.3 }}>✈</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>No challenges yet</div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Challenges are multi-leg campaigns where you fly a series of routes in order to earn bonus hours and prizes. Check back soon.
        </p>
      </div>
    );
  }

  const Section = ({ title, items }) => items.length === 0 ? null : (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.875rem' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map(c => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            legs={legsMap[c.id] || []}
            enrolledCount={enrolledMap[c.id] || 0}
            onClick={() => navigate(`/challenges/${c.id}`)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="ch-fade">
      <Section title="Active" items={active} />
      <Section title="Past Challenges" items={past} />
    </div>
  );
}

// Main
function Challenges({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [legsMap, setLegsMap] = useState({});
  const [enrolledMap, setEnrolledMap] = useState({});

  const load = useCallback(async () => {
    try {
      const { challenges: list } = await challengesApi.list();
      setChallenges(list);
      const results = await Promise.all(list.map(c => challengesApi.get(c.id)));
      const lMap = {}, eMap = {};
      results.forEach(r => {
        lMap[r.challenge.id] = r.legs || [];
        eMap[r.challenge.id] = r.enrolled_count || 0;
      });
      setLegsMap(lMap);
      setEnrolledMap(eMap);
    } catch { showToast('Failed to load challenges', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  const current = id ? challenges.find(c => c.id === id) : null;

  return (
    <div className="main-container">
      <style>{CSS}</style>
      <div className="page-header">
        <h2>Challenges</h2>
        <p>Multi-leg campaigns — fly each route in order and earn bonus hours.</p>
      </div>
      {current
        ? <ChallengeDetail challenge={current} legs={legsMap[current.id] || []} enrolledCount={enrolledMap[current.id] || 0} user={user} />
        : <ChallengeList challenges={challenges} legsMap={legsMap} enrolledMap={enrolledMap} navigate={navigate} />
      }
    </div>
  );
}

export default Challenges;
