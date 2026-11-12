/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ranks as ranksApi } from '../api/client';
import { cacheGet } from '../cache';

const EPAULETTE_CONFIG = [
  { bars: 0, diamonds: 0 },
  { bars: 1, diamonds: 0 },
  { bars: 2, diamonds: 0 },
  { bars: 3, diamonds: 0 },
  { bars: 4, diamonds: 0 },
  { bars: 4, diamonds: 1 },
  { bars: 4, diamonds: 2 },
  { bars: 4, diamonds: 3 },
];

const BAR_COLOUR = 'var(--brand-accent)';

function getEpauletteConfig(orderPosition) {
  return EPAULETTE_CONFIG[Math.min(orderPosition - 1, EPAULETTE_CONFIG.length - 1)];
}

export function Epaulette({ orderPosition, size = 48, badgeUrl = null }) {
  // If a custom badge image is uploaded, show it at the same dimensions as the SVG
  if (badgeUrl) {
    const w = size;
    const h = Math.round(size * 0.55);
    return (
      <img
        src={badgeUrl}
        alt="Rank badge"
        style={{ width: w, height: h, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
      />
    );
  }

  const cfg = getEpauletteConfig(orderPosition);
  const { bars, diamonds } = cfg;

  const w = size;
  const h = Math.round(size * 0.55);
  const cornerR = h * 0.12;
  const base = '#0a0a0a';
  const border = '#000000';
  const colour = BAR_COLOUR;
  const gradId = `ep-sheen-${size}-${orderPosition}`;

  // Bars: anchored from the left with a fixed left pad
  const padX = w * 0.10;
  const padY = h * 0.14;
  const barH = h - padY * 2;
  const barW = w * 0.072;
  const barGap = barW * 0.75;

  const barXs = Array.from({ length: bars }, (_, i) => padX + i * (barW + barGap));

  // Diamonds: sit to the right of the bars, vertically centred, evenly spaced
  const barsEndX = bars > 0 ? barXs[barXs.length - 1] + barW : padX;
  const diamondZoneStart = barsEndX + barGap * 2;
  const diamondZoneEnd = w - padX * 0.8;
  const dSize = barW * 0.72;         // half-diagonal of diamond

  let diamondCXs = [];
  if (diamonds > 0) {
    const zoneW = diamondZoneEnd - diamondZoneStart;
    const spacing = zoneW / diamonds;
    diamondCXs = Array.from({ length: diamonds }, (_, i) =>
      diamondZoneStart + spacing * i + spacing / 2
    );
  }

  const dCY = h / 2;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Board */}
      <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5}
        rx={cornerR} ry={cornerR}
        fill={base} stroke={border} strokeWidth={1.5} />

      {/* Sheen */}
      <rect x={0.75} y={0.75} width={w - 1.5} height={h * 0.4}
        rx={cornerR} ry={cornerR}
        fill={`url(#${gradId})`} />

      {barXs.map((x, i) => (
        <rect
          key={i}
          x={x}
          y={padY}
          width={barW}
          height={barH}
          rx={barW * 0.25}
          fill={colour}
          opacity={0.95}
        />
      ))}

      {/* Diamonds to the right of bars */}
      {diamondCXs.map((cx, i) => (
        <polygon
          key={i}
          points={`${cx},${dCY - dSize} ${cx + dSize},${dCY} ${cx},${dCY + dSize} ${cx - dSize},${dCY}`}
          fill={colour}
          opacity={0.92}
        />
      ))}
    </svg>
  );
}

// RankPill
export function RankPill({ rank, size = 'md' }) {
  if (!rank) return null;
  const { colour } = getEpauletteConfig(rank.order_position);
  const sizes = {
    sm: { fontSize: '0.7rem', padding: '0.2rem 0.6rem' },
    md: { fontSize: '0.8rem', padding: '0.3rem 0.8rem' },
    lg: { fontSize: '0.95rem', padding: '0.4rem 1rem' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      background: colour + '18', color: colour,
      border: `1px solid ${colour}40`,
      borderRadius: '999px', fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap',
      ...sizes[size],
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: colour, flexShrink: 0 }} />
      {rank.name}
    </span>
  );
}

// resolveRank
export function resolveRank(ranks, totalHours) {
  if (!ranks || ranks.length === 0) return { currentRank: null, nextRank: null, progressPercent: 0 };
  const sorted = [...ranks].sort((a, b) => a.hours_required - b.hours_required);
  let currentRank = sorted[0];
  for (const rank of sorted) {
    if (totalHours >= rank.hours_required) currentRank = rank;
    else break;
  }
  const idx = sorted.indexOf(currentRank);
  const nextRank = sorted[idx + 1] || null;
  let progressPercent = 100;
  if (nextRank) {
    progressPercent = Math.min(100, Math.round(
      ((totalHours - currentRank.hours_required) / (nextRank.hours_required - currentRank.hours_required)) * 100
    ));
  }
  return { currentRank, nextRank, progressPercent };
}

// useRanks hook
export function useRanks() {
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const prefetched = cacheGet('prefetch-ranks-raw');
    if (prefetched) {
      setRanks(prefetched.ranks || []);
      setLoading(false);
      return;
    }
    ranksApi.list()
      .then(data => setRanks(data.ranks || []))
      .catch(() => setRanks([]))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ranks, loading };
}

// Dashboard Rank Widget
export function DashboardRankWidget({ user, ranks, onClick }) {
  const totalHours = user?.total_hours || 0;
  const { currentRank, nextRank, progressPercent } = resolveRank(ranks, totalHours);
  if (!currentRank) return null;

  const hoursToNext   = nextRank ? (nextRank.hours_required - totalHours).toFixed(1) : null;
  const hoursEarned   = nextRank ? (totalHours - currentRank.hours_required).toFixed(1) : totalHours.toFixed(1);
  const hoursRequired = nextRank ? (nextRank.hours_required - currentRank.hours_required) : null;

  return (
    <>
      <style>{`
        .rank-widget {
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
        }
        .rank-widget:hover { box-shadow: 0 4px 12px var(--shadow-hover) !important; }
        .rank-widget-epaulette { flex-shrink: 0; }
        .rank-widget-body { flex: 1; min-width: 0; }
        .rank-widget-top { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
        .rank-widget-name { font-weight: 800; font-size: 1.1rem; line-height: 1.2; }
        .rank-widget-next { font-size: 0.78rem; color: var(--text-secondary); white-space: nowrap; }
        .rank-widget-next strong { color: var(--avg-green); font-weight: 700; }
        .rank-widget-bar-wrap { position: relative; height: 6px; border-radius: 4px; background: var(--border-color); overflow: hidden; }
        .rank-widget-bar-fill { height: 100%; border-radius: 4px; background: var(--avg-green); transition: width 0.9s cubic-bezier(0.4,0,0.2,1); }
        .rank-widget-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 0.3rem; }
        .rank-widget-hrs { font-size: 0.72rem; color: var(--text-secondary); font-weight: 500; }
        .rank-widget-pct { font-size: 0.72rem; color: var(--avg-green); font-weight: 700; }
        @media (max-width: 480px) {
          .rank-widget { gap: 0.75rem; }
          .rank-widget-name { font-size: 1rem; }
        }
      `}</style>
      <div
        onClick={onClick}
        className="rank-widget"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderLeft: '4px solid var(--avg-green)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          cursor: onClick ? 'pointer' : 'default',
          height: '100%',
          boxSizing: 'border-box',
          transition: 'box-shadow 0.2s ease',
          boxShadow: '0 1px 3px var(--shadow)',
        }}
      >
        {/* Epaulette */}
        <div className="rank-widget-epaulette">
          <Epaulette orderPosition={currentRank.order_position} size={72} badgeUrl={currentRank.badge_url || null} />
        </div>

        {/* Body */}
        <div className="rank-widget-body">
          {/* Rank name + next rank inline */}
          <div className="rank-widget-top">
            <span className="rank-widget-name">{currentRank.name}</span>
            {nextRank && (
              <span className="rank-widget-next">
                → <strong>{nextRank.name}</strong>
              </span>
            )}
          </div>

          {nextRank ? (
            <>
              {/* Progress bar */}
              <div className="rank-widget-bar-wrap">
                <div className="rank-widget-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              {/* Hours below bar */}
              <div className="rank-widget-meta">
                <span className="rank-widget-hrs">{hoursEarned}h / {hoursRequired}h</span>
                <span className="rank-widget-pct">{progressPercent}% · {hoursToNext}h to go</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--avg-green)', fontWeight: 700, marginTop: '0.25rem' }}>
              ★ Highest rank achieved
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Full Rank Card (Profile page)
export function RankCard({ user, ranks, compact = false }) {
  const totalHours = user?.total_hours || 0;
  const { currentRank, nextRank, progressPercent } = resolveRank(ranks, totalHours);

  if (!currentRank) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
        No ranks configured yet. Ask an admin to set up ranks in the Admin Panel.
      </div>
    );
  }

  if (compact) return <DashboardRankWidget user={user} ranks={ranks} />;

  const sorted = [...ranks].sort((a, b) => a.hours_required - b.hours_required);

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1.75rem' }}>Rank &amp; Progression</h3>

      {/* Hero row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2rem',
        padding: '1.75rem', background: 'var(--bg-hover)',
        borderRadius: '10px', marginBottom: '2rem', flexWrap: 'wrap',
      }}>
<Epaulette orderPosition={currentRank.order_position} size={140} badgeUrl={currentRank.badge_url || null} />
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.4rem' }}>
            Current Rank
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            {currentRank.name}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            {totalHours.toFixed(1)} hours logged
          </div>
        </div>
      </div>

      {/* Progress */}
      {nextRank ? (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                Progress to next rank
              </div>
              <div style={{ fontWeight: 700 }}>{nextRank.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--avg-green)', fontSize: '1.1rem' }}>{progressPercent}%</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {(nextRank.hours_required - totalHours).toFixed(1)}h remaining
              </div>
            </div>
          </div>
          <div style={{ height: '8px', background: 'var(--bg-hover)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{
              height: '100%', width: `${progressPercent}%`,
              background: 'var(--avg-green)', borderRadius: '999px',
              transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <span>{currentRank.hours_required}h</span>
            <span>{nextRank.hours_required}h</span>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '1rem', color: 'var(--avg-green)', fontWeight: 600,
          fontSize: '0.95rem', border: '1px dashed var(--border-color)',
          borderRadius: '8px', marginBottom: '2rem',
        }}>
          🏆 Highest rank achieved — congratulations!
        </div>
      )}

      {/* Rank ladder */}
      {sorted.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Rank Ladder
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map(rank => {
              const achieved  = totalHours >= rank.hours_required;
              const isCurrent = rank.id === currentRank.id;
              let aircraft = [];
              try { aircraft = rank.aircraft_restrictions ? JSON.parse(rank.aircraft_restrictions) : []; } catch {}
              return (
                <div key={rank.id} style={{
                  padding: '0.75rem 0.9rem', borderRadius: '8px',
                  background: isCurrent ? 'var(--bg-hover)' : 'transparent',
                  border: isCurrent ? '1px solid var(--border-color)' : '1px solid transparent',
                  opacity: achieved ? 1 : 0.38,
                  transition: 'opacity 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
<Epaulette orderPosition={rank.order_position} size={64} badgeUrl={rank.badge_url || null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: isCurrent ? 700 : 500, marginBottom: aircraft.length ? '0.4rem' : 0 }}>
                        {rank.name}
                        {isCurrent && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>you are here</span>}
                      </div>
                      {aircraft.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {aircraft.map(ac => (
                            <span key={ac} style={{
                              fontSize: '0.72rem', fontWeight: 600,
                              padding: '0.15rem 0.55rem',
                              borderRadius: '5px',
                              background: achieved ? 'rgba(var(--brand-primary-rgb),0.1)' : 'var(--bg-secondary)',
                              color: achieved ? 'var(--avg-green)' : 'var(--text-secondary)',
                              border: `1px solid ${achieved ? 'rgba(var(--brand-primary-rgb),0.25)' : 'var(--border-color)'}`,
                              whiteSpace: 'nowrap',
                            }}>{ac}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{rank.hours_required}h+</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default RankCard;
