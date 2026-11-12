/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { DeveloperBadge } from '../components/DeveloperBadge';
import { colors as BRAND } from '../brand';

export const PERIODS = [
  { label: 'All Time',   key: 'all' },
  { label: 'This Year',  key: 'year' },
  { label: 'This Month', key: 'month' },
  { label: 'Last 90d',   key: '90d' },
  { label: 'Last 30d',   key: '30d' },
];

export const ROSTER_PAGE_SIZE = 15;

export function getPeriodFrom(key) {
  const now = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  if (key === 'all')   return null;
  if (key === 'year')  return fmt(new Date(now.getFullYear(), 0, 1));
  if (key === 'month') return fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  if (key === '90d')   { const d = new Date(now); d.setDate(d.getDate() - 90); return fmt(d); }
  if (key === '30d')   { const d = new Date(now); d.setDate(d.getDate() - 30); return fmt(d); }
  return null;
}

export function pilotDisplay(p) {
  const first = p.first_name || p.pilot_name?.split(' ')[0] || '?';
  const last  = p.last_name  || p.pilot_name?.split(' ').slice(1).join(' ') || '';
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function LegacyBadge() {
  return (
    <span title="Flight history imported from a previous crew centre" style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '1px 5px', borderRadius: '4px',
      background: 'rgba(198,40,40,0.1)', color: '#c62828',
      border: '1px solid rgba(198,40,40,0.25)', flexShrink: 0, lineHeight: 1.6,
    }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      Legacy
    </span>
  );
}

export function Ico({ children, size = 16, color = 'currentColor', sw = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}

export const Icons = {
  plane:    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>,
  clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  users:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  bar:      <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  route:    <><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v4a3 3 0 0 0 3 3h6"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  award:    <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
  map:      <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></>,
  trend:    <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  chevL:    <polyline points="15 18 9 12 15 6"/>,
  chevR:    <polyline points="9 18 15 12 9 6"/>,
  check:    <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  zap:      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
};

export function StatCard({ label, value, sub, iconKey }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderTop: '3px solid var(--avg-gold)', borderRadius: '12px',
      padding: '1.25rem 1.5rem', boxShadow: '0 1px 4px var(--shadow)',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {iconKey && <Ico size={13} color="var(--avg-gold)">{Icons[iconKey]}</Ico>}
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 300, color: 'var(--avg-green)', letterSpacing: '-1px', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>{sub}</div>}
    </div>
  );
}

export function Section({ title, children, extra, noPad, iconKey }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 1px 4px var(--shadow)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
        <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {iconKey && <Ico size={14} color="var(--avg-gold)">{Icons[iconKey]}</Ico>}
          {title}
        </h3>
        {extra}
      </div>
      <div style={noPad ? {} : { padding: '1.25rem 1.5rem' }}>{children}</div>
    </div>
  );
}

export function PlainSection({ title, children, extra }) {
  return (
    <section style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function SummarySentence({ parts, details }) {
  return (
    <div style={{ marginBottom: '2.25rem', maxWidth: '54rem' }}>
      <p style={{ fontSize: 'clamp(1.35rem, 1rem + 1.6vw, 2.1rem)', lineHeight: 1.3, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0 }}>
        {parts.map((part, i) => typeof part === 'string'
          ? <React.Fragment key={i}>{part}</React.Fragment>
          : <span key={i} style={{ fontWeight: 600, color: part.color || 'var(--avg-green)', whiteSpace: 'nowrap' }}>{part.text}</span>
        )}
      </p>
      {details.length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '1rem 1.5rem', margin: '1.5rem 0 0' }}>
          {details.map(d => (
            <div key={d.label}>
              <dd style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{d.value}</dd>
              <dt style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.label}</dt>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const PODIUM_PLACES = ['1st', '2nd', '3rd'];

export function Podium({ pilots, formatValue, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
      {pilots.map((p, i) => (
        <button
          key={p.id || p.user_id || i}
          onClick={() => onSelect(p)}
          style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', minWidth: 0 }}
        >
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: i === 0 ? 'var(--avg-gold-dark)' : 'var(--text-secondary)', marginBottom: '0.15rem' }}>{PODIUM_PLACES[i]}</div>
          <div style={{ fontSize: i === 0 ? '1.4rem' : '1.1rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {pilotDisplay(p)}
            {p.has_imported_history && <LegacyBadge />}
            {p.is_developer && <DeveloperBadge />}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {formatValue(p)}{p.callsign ? ` · ${p.callsign}` : ''}
          </div>
        </button>
      ))}
    </div>
  );
}

export function ProgressRow({ label, value, max, formatted, color = 'var(--avg-green)', rank, sub, legacy, developer }) {
  const pct     = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const medalBg = rank === 1 ? 'var(--brand-accent)' : rank === 2 ? '#909090' : rank === 3 ? '#cd7f32' : null;
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {rank !== undefined && (
            <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, background: medalBg || 'var(--border-color)', color: medalBg ? 'white' : 'var(--text-secondary)' }}>{rank}</span>
          )}
          {label}
          {legacy && <LegacyBadge />}
          {developer && <DeveloperBadge />}
          {sub && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{sub}</span>}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0, marginLeft: '1rem' }}>{formatted ?? value}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export function LineGraph({ data, height = 160 }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data || data.length < 2) return (
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>Not enough data points for a line graph.</p>
  );
  const VW = 800;
  const PAD = { top: 12, right: 20, bottom: 32, left: 38 };
  const innerW = VW - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const maxFlights = Math.max(...data.map(d => d.flights), 1);
  const maxHours   = Math.max(...data.map(d => d.hours),   1);
  const xS  = i => PAD.left + (i / (data.length - 1)) * innerW;
  const yF  = v => PAD.top + innerH - (v / maxFlights) * innerH;
  const yH  = v => PAD.top + innerH - (v / maxHours)   * innerH;
  const fPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yF(d.flights)}`).join(' ');
  const hPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yH(d.hours)}`).join(' ');
  const fArea = `${fPath} L${xS(data.length-1)},${PAD.top+innerH} L${xS(0)},${PAD.top+innerH} Z`;
  const hArea = `${hPath} L${xS(data.length-1)},${PAD.top+innerH} L${xS(0)},${PAD.top+innerH} Z`;
  const grid  = [0.25, 0.5, 0.75, 1];
  const step  = Math.ceil(data.length / 10);
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${VW} ${height + 8}`} style={{ display: 'block', width: '100%' }}
        onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id="lgFlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND.primary} stopOpacity="0.22"/><stop offset="100%" stopColor={BRAND.primary} stopOpacity="0.02"/></linearGradient>
          <linearGradient id="lgHour" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND.accent} stopOpacity="0.18"/><stop offset="100%" stopColor={BRAND.accent} stopOpacity="0.02"/></linearGradient>
        </defs>
        {grid.map((f, i) => { const y = PAD.top + innerH - f * innerH; return (<g key={i}><line x1={PAD.left} x2={VW - PAD.right} y1={y} y2={y} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4,4"/><text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-secondary)">{Math.round(f * maxFlights)}</text></g>); })}
        <line x1={PAD.left} x2={VW - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--border-color)" strokeWidth="1"/>
        <path d={hArea} fill="url(#lgHour)"/><path d={fArea} fill="url(#lgFlight)"/>
        <path d={hPath} fill="none" stroke={BRAND.accent} strokeWidth="2" strokeLinejoin="round" opacity="0.85"/>
        <path d={fPath} fill="none" stroke={BRAND.primary} strokeWidth="2.5" strokeLinejoin="round"/>
        {data.map((d, i) => (
          <circle key={i} cx={xS(i)} cy={yF(d.flights)} r="5" fill={BRAND.primary} fillOpacity="0" stroke="none"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setTooltip({ i, x: xS(i), y: Math.min(yF(d.flights), yH(d.hours)) - 10, d })}
          />
        ))}
        {data.map((d, i) => (<circle key={i} cx={xS(i)} cy={yF(d.flights)} r="3.5" fill={BRAND.primary} style={{ pointerEvents: 'none' }}/>))}
        {data.map((d, i) => i % step === 0 && (<text key={i} x={xS(i)} y={height + 4} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">{d.shortLabel || d.label}</text>))}
        {tooltip && (() => {
          const tx = Math.min(Math.max(tooltip.x - 55, 4), VW - 114);
          const ty = Math.max(tooltip.y - 52, 4);
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width="110" height="48" rx="6" fill="var(--bg-card)" stroke="var(--border-color)" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"/>
              <text x={tx + 55} y={ty + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-primary)">{tooltip.d.label}</text>
              <circle cx={tx + 12} cy={ty + 27} r="3.5" fill={BRAND.primary}/>
              <text x={tx + 20} y={ty + 31} fontSize="9" fill="var(--text-secondary)">Flights: </text>
              <text x={tx + 57} y={ty + 31} fontSize="9" fontWeight="700" fill="var(--text-primary)">{tooltip.d.flights}</text>
              <circle cx={tx + 12} cy={ty + 41} r="3.5" fill={BRAND.accent}/>
              <text x={tx + 20} y={ty + 45} fontSize="9" fill="var(--text-secondary)">Hours: </text>
              <text x={tx + 51} y={ty + 45} fontSize="9" fontWeight="700" fill="var(--text-primary)">{Math.round(tooltip.d.hours)}</text>
            </g>
          );
        })()}
      </svg>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
        {[['var(--brand-primary)', 'Flights'], ['var(--brand-accent)', 'Hours']].map(([color, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'inline-block', width: 20, height: 2, background: color, borderRadius: 1 }}/> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DualBarChart({ data, height = 140 }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data || data.length === 0) return null;
  const maxFlights = Math.max(...data.map(d => d.flights), 1);
  const maxHours   = Math.max(...data.map(d => d.hours),   1);
  const w = 100 / data.length;
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ minWidth: Math.max(data.length * 52, 300) }}>
        <svg width="100%" height={height + 32} style={{ display: 'block' }}
          onMouseLeave={() => setTooltip(null)}>
          {[0.25, 0.5, 0.75, 1].map(f => (<line key={f} x1="0" x2="100%" y1={height - f * height} y2={height - f * height} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3"/>))}
          {data.map((d, i) => {
            const fH = Math.max((d.flights / maxFlights) * height, d.flights > 0 ? 2 : 0);
            const hH = Math.max((d.hours   / maxHours)   * height, d.hours   > 0 ? 2 : 0);
            return (
              <g key={i}>
                <rect x={`${i * w + w * 0.06}%`} y={height - fH} width={`${w * 0.42}%`} height={fH} fill={BRAND.primary} rx="3" opacity="0.9"/>
                <rect x={`${i * w + w * 0.52}%`} y={height - hH} width={`${w * 0.42}%`} height={hH} fill={BRAND.accent} rx="3" opacity="0.7"/>
                <text x={`${i * w + w * 0.5}%`} y={height + 18} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{d.shortLabel || d.label}</text>
                {/* Invisible hover target */}
                <rect x={`${i * w}%`} y={0} width={`${w}%`} height={height} fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    const pct  = (i + 0.5) / data.length;
                    setTooltip({ d, pct });
                  }}
                />
              </g>
            );
          })}
          {tooltip && (() => {
            const svgW = 800;
            const cx   = tooltip.pct * svgW;
            const tx   = Math.min(Math.max(cx - 55, 4), svgW - 114);
            const ty   = 4;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={`${tooltip.pct * 100}%`} y={0} width="1" height={height} fill="var(--border-color)" opacity="0.5"/>
                <rect x={tx / svgW * 100 + '%'} y={ty} width="110" height="48" rx="6" fill="var(--bg-card)" stroke="var(--border-color)" strokeWidth="1"/>
                <text x={(tx + 55) / svgW * 100 + '%'} y={ty + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-primary)">{tooltip.d.label}</text>
                <circle cx={(tx + 12) / svgW * 100 + '%'} cy={ty + 27} r="3.5" fill={BRAND.primary}/>
                <text x={(tx + 20) / svgW * 100 + '%'} y={ty + 31} fontSize="9" fill="var(--text-secondary)">Flights: </text>
                <text x={(tx + 57) / svgW * 100 + '%'} y={ty + 31} fontSize="9" fontWeight="700" fill="var(--text-primary)">{tooltip.d.flights}</text>
                <circle cx={(tx + 12) / svgW * 100 + '%'} cy={ty + 41} r="3.5" fill={BRAND.accent}/>
                <text x={(tx + 20) / svgW * 100 + '%'} y={ty + 45} fontSize="9" fill="var(--text-secondary)">Hours: </text>
                <text x={(tx + 51) / svgW * 100 + '%'} y={ty + 45} fontSize="9" fontWeight="700" fill="var(--text-primary)">{Math.round(tooltip.d.hours)}</text>
              </g>
            );
          })()}
        </svg>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          {[['var(--brand-primary)', 'Flights'], ['var(--brand-accent)', 'Hours']].map(([color, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color }}/> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BarChart({ data, height = 120 }) {
  if (!data || data.length === 0) return null;
  const max    = Math.max(...data.map(d => d.value), 1);
  const maxVal = Math.max(...data.map(d => d.value));
  const w      = 100 / data.length;
  return (
    <svg width="100%" height={height + 28} style={{ display: 'block' }}>
      {[0.5, 1].map(f => (<line key={f} x1="0" x2="100%" y1={height - f * height} y2={height - f * height} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3"/>))}
      {data.map((d, i) => {
        const barH  = Math.max((d.value / max) * height, d.value > 0 ? 2 : 0);
        const isMax = d.value === maxVal && maxVal > 0;
        return (<g key={i}><rect x={`${i * w + w * 0.15}%`} y={height - barH} width={`${w * 0.7}%`} height={barH} fill={isMax ? BRAND.accent : BRAND.primary} rx="3" opacity={isMax ? 0.95 : 0.7}/><text x={`${i * w + w * 0.5}%`} y={height + 18} textAnchor="middle" fontSize="10" fill={isMax ? 'var(--avg-gold-dark)' : 'var(--text-secondary)'}>{d.label}</text></g>);
      })}
    </svg>
  );
}

export function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', borderRadius: '7px', padding: '0.2rem' }}>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{ padding: '0.25rem 0.65rem', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: value === o.key ? 'var(--avg-green)' : 'transparent', color: value === o.key ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>{o.label}</button>
      ))}
    </div>
  );
}
