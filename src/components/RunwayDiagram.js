/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';
import { colors as BRAND } from '../brand';

export const GRADE_COLOR = { A: '#2e7d32', B: '#558b2f', C: '#f57f17', D: '#e65100', F: '#c62828' };

function RunwayDiagram({ landings }) {
  const [hovered, setHovered] = React.useState(null);

  const plotted = landings.filter(l => l.dist_1k_ft != null);
  if (!plotted.length) return null;

  const W = 800, H = 200;
  const RH = 110;  // runway height (top-down, now = visual height in landscape)
  const RY = (H - RH) / 2;
  const RX = 80;   // left edge of runway (space for label)
  const RW = W - RX - 20; // runway runs to right edge

  // 1000ft marker at 25% along runway
  const MARKER_X = RX + RW * 0.22;

  // Map dist_1k_ft (metres) to X. Range: -100m (before) to +500m (past)
  const MIN_M = -100, MAX_M = 500;
  const mToX = m => RX + ((Math.max(MIN_M, Math.min(MAX_M, m)) - MIN_M) / (MAX_M - MIN_M)) * RW;

  // Map centerline offset (metres) to Y within runway
  const MAX_CL = 25;
  const clToY = cl => {
    if (cl == null) return H / 2;
    return H / 2 + (Math.max(-MAX_CL, Math.min(MAX_CL, cl)) / MAX_CL) * (RH / 2 - 9);
  };

  // Threshold stripes at the left (approach end)
  const numStripes = 6;
  const stripeH = Math.floor((RH - 14 - (numStripes - 1) * 4) / numStripes);
  const clDash = 26, clGap = 16;
  const clDashes = Array.from({ length: Math.floor(RW / (clDash + clGap)) });

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>

        {/* Runway surface */}
        <rect x={RX} y={RY} width={RW} height={RH} rx={3} fill="#2a2a2a" />

        {/* Edge stripes top/bottom */}
        <rect x={RX} y={RY}           width={RW} height={5} fill="#d8d0b0" opacity="0.9" />
        <rect x={RX} y={RY + RH - 5}  width={RW} height={5} fill="#d8d0b0" opacity="0.9" />

        <clipPath id="rwy-clip-h">
          <rect x={RX} y={RY + 5} width={RW} height={RH - 10} />
        </clipPath>
        <g clipPath="url(#rwy-clip-h)">
          {/* Threshold stripes at left (approach end) */}
          {Array.from({ length: numStripes }).map((_, i) => (
            <rect key={i} x={RX + 10} y={RY + 7 + i * (stripeH + 4)} width={32} height={stripeH} rx={1} fill="#d8d0b0" opacity="0.85" />
          ))}
          {/* Centreline dashes */}
          {clDashes.map((_, i) => {
            const x = RX + 55 + i * (clDash + clGap);
            if (x + clDash > RX + RW - 8) return null;
            return <rect key={i} x={x} y={H / 2 - 2.5} width={clDash} height={5} rx={1} fill="#d8d0b0" opacity="0.4" />;
          })}
          {/* TDZ bars */}
          {[-1, 1].map(side => (
            <rect key={`tdz1-${side}`} x={MARKER_X - 26} y={side === -1 ? RY + 5 : RY + RH - 20} width={52} height={15} rx={1} fill="#d8d0b0" opacity="0.85" />
          ))}
        </g>

        <line x1={MARKER_X} y1={RY} x2={MARKER_X} y2={RY + RH} stroke={BRAND.accent} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.75" />
        <text x={MARKER_X} y={RY - 6} textAnchor="middle" fill={BRAND.accent} fontSize="10" fontWeight="700" fontFamily="monospace">1000ft</text>

        {/* Distance labels along bottom */}
        {[0, 100, 200, 300, 400, 500].map(m => (
          <g key={m}>
            <line x1={mToX(m)} y1={RY + RH} x2={mToX(m)} y2={RY + RH + 5} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <text x={mToX(m)} y={RY + RH + 16} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace">{m > 0 ? `+${m}m` : `${m}m`}</text>
          </g>
        ))}
        {[-100].map(m => (
          <text key={m} x={mToX(m)} y={RY + RH + 16} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace">{m}m</text>
        ))}

        {/* Landing dots */}
        {plotted.map((l, i) => {
          const x   = mToX(l.dist_1k_ft);
          const y   = clToY(l.centerline);
          const col = GRADE_COLOR[l.grade];
          const isH = hovered === i;
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
              {isH && <circle cx={x} cy={y} r={14} fill={col} opacity="0.2" />}
              <circle cx={x} cy={y} r={isH ? 9 : 8} fill={col} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
              <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="8" fontWeight="900">{l.grade}</text>
            </g>
          );
        })}

        {/* Tooltip */}
        {hovered !== null && plotted[hovered] && (() => {
          const l    = plotted[hovered];
          const dotX = mToX(l.dist_1k_ft);
          const dotY = clToY(l.centerline);
          const cl   = l.centerline != null ? `${Math.round(Math.abs(l.centerline))}m ${l.centerline >= 0 ? 'right' : 'left'} of CL` : null;
          const tipW = 148, tipH = cl ? 72 : 58;
          // Place horizontally: right of dot if space, else left
          const tipX = dotX + 14 + tipW > W - 4 ? dotX - tipW - 14 : dotX + 14;
          // Place vertically: centred on dot, clamped to canvas
          const tipY = Math.max(4, Math.min(dotY - tipH / 2, H - tipH - 4));
          const dist = l.dist_1k_ft >= 0 ? `+${Math.round(l.dist_1k_ft)}m past` : `${Math.round(Math.abs(l.dist_1k_ft))}m before`;
          return (
            <g>
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={7} fill="#1a1a1a" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <text x={tipX + 10} y={tipY + 16} fill="#fff" fontSize="11" fontWeight="700">{l.dep} → {l.arr}</text>
              <text x={tipX + 10} y={tipY + 31} fill={GRADE_COLOR[l.grade]} fontSize="11" fontWeight="800">{l.grade} · {l.vs_fpm} fpm · {l.g_force}g</text>
              <text x={tipX + 10} y={tipY + 46} fill="rgba(255,255,255,0.5)" fontSize="10">{dist} 1000ft marker</text>
              {cl && <text x={tipX + 10} y={tipY + 60} fill="rgba(255,255,255,0.5)" fontSize="10">{cl}</text>}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default RunwayDiagram;
