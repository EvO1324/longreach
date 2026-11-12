/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { health as healthApi } from '../../api/client';
import Loader from '../../components/Loader';
import { RefreshCw } from 'lucide-react';

import brand from '../../brand';

const CSS = `
.vh { max-width: 1080px; display: grid; gap: 1.25rem; }
.vh-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.25rem 1.4rem; min-width: 0; }
.vh-title { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
.vh-sub { margin: 0.15rem 0 0; font-size: 0.8rem; color: var(--text-secondary); }
.vh-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.vh-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); }

.vh-bar { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
.vh-seg { display: inline-flex; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 9px; padding: 3px; flex-wrap: wrap; }
.vh-seg button { border: none; background: none; padding: 0.4rem 0.75rem; border-radius: 6px; font: inherit; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.vh-seg button.is-on { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 1px 2px var(--shadow); }
.vh-dates { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--text-secondary); }
.vh-dates input { border: 1px solid var(--border-color); border-radius: 7px; padding: 0.38rem 0.5rem; font: inherit; font-size: 0.8rem; background: var(--bg-card); color: var(--text-primary); }
.vh-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.vh-btn:hover { border-color: var(--avg-green); }
.vh-btn.is-primary { background: var(--avg-green); border-color: var(--avg-green); color: #fff; }
.vh-btn:disabled { opacity: 0.55; cursor: default; }
.vh-period { margin-left: auto; text-align: right; }
.vh-period b { display: block; font-size: 0.95rem; color: var(--text-primary); }
.vh-period span { font-size: 0.75rem; color: var(--text-secondary); }

.vh-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
.vh-kpi { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.05rem 1.15rem 1rem; min-width: 0; }
.vh-kpi-mark { width: 18px; height: 3px; border-radius: 2px; background: var(--avg-green); margin-bottom: 0.7rem; }
.vh-kpi.is-lead .vh-kpi-mark { background: var(--avg-gold); }
.vh-kpi.is-alert .vh-kpi-mark { background: #c0582f; }
.vh-kpi-value { font-size: 1.85rem; font-weight: 800; line-height: 1.1; color: var(--text-primary); margin: 0.35rem 0 0.55rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vh-kpi-foot { display: flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; color: var(--text-secondary); min-height: 1.4rem; flex-wrap: wrap; }
.vh-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.12rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.vh-pill.up { background: rgba(46, 125, 79, 0.12); color: #2e7d4f; }
.vh-pill.down { background: rgba(180, 68, 47, 0.12); color: #b4442f; }
.vh-pill.flat { background: var(--bg-secondary); color: var(--text-secondary); }
.vh-tri { width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; }
.vh-tri.is-up { border-bottom: 6px solid currentColor; }
.vh-tri.is-down { border-top: 6px solid currentColor; }

.vh-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.vh-chart text { font-family: inherit; }

.vh-three { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 1.25rem; }
.vh-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 1.25rem; }

.vh-stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg-secondary); margin: 0.2rem 0 1rem; }
.vh-legend { display: grid; gap: 0.55rem; }
.vh-legend-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; gap: 0.6rem; align-items: center; font-size: 0.85rem; }
.vh-swatch { width: 10px; height: 10px; border-radius: 3px; }
.vh-num { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.vh-pct { color: var(--text-secondary); font-size: 0.78rem; min-width: 2.8rem; text-align: right; font-variant-numeric: tabular-nums; }

.vh-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; margin-top: 1.1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); }
.vh-fact b { display: block; font-size: 1.05rem; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.vh-fact span { font-size: 0.75rem; color: var(--text-secondary); }

.vh-meter { margin-bottom: 1rem; }
.vh-meter-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.85rem; margin-bottom: 0.4rem; }
.vh-meter-top b { font-variant-numeric: tabular-nums; }
.vh-track { height: 8px; border-radius: 4px; background: var(--bg-secondary); overflow: hidden; }
.vh-track i { display: block; height: 100%; border-radius: 4px; }

.vh-rank { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr) auto; gap: 0.2rem 0.6rem; align-items: baseline; padding: 0.6rem 0; border-top: 1px solid var(--border-color); }
.vh-rank.is-first { border-top: none; padding-top: 0.2rem; }
.vh-rank-n { font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.vh-rank.is-first .vh-rank-n { color: var(--avg-gold); }
.vh-rank-main { min-width: 0; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vh-rank-main small { display: block; font-weight: 400; font-size: 0.75rem; color: var(--text-secondary); font-family: inherit; letter-spacing: 0; }
.vh-rank-bar { grid-column: 2 / -1; height: 4px; border-radius: 2px; background: var(--bg-secondary); overflow: hidden; margin-top: 0.3rem; }
.vh-rank-bar i { display: block; height: 100%; border-radius: 2px; background: var(--avg-green); }
.vh-rank.is-first .vh-rank-bar i { background: var(--avg-gold); }
.vh-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.02em; }
.vh-empty { font-size: 0.85rem; color: var(--text-secondary); margin: 0; }

.vh-card-img { border-radius: 10px; overflow: hidden; border: 1px solid var(--border-color); aspect-ratio: 16 / 9; background: var(--bg-secondary); }
.vh-card-img img { display: block; width: 100%; height: 100%; }
@keyframes vh-spin { to { transform: rotate(360deg); } }
@media (max-width: 700px) { .vh-period { margin-left: 0; text-align: left; } .vh-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

const num = n => (n == null ? 'n/a' : Number(n).toLocaleString('en-AU'));
// "705h" for big totals, "2h 35m" for small ones
function hours(h) {
  if (!h) return '0h';
  if (h >= 100) return `${Math.round(h).toLocaleString('en-AU')}h`;
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
const toInputDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const niceDate = (iso, year = true) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
// "7 days" is today and the 6 days before it
const startFor = days => { const d = new Date(); d.setDate(d.getDate() - (days - 1)); return toInputDate(d); };

function Change({ cur, prev, lowerIsBetter = false, format = num }) {
  if (prev == null) return null;
  if (!prev) return <span>{cur ? 'None in the previous period' : 'Same as the previous period'}</span>;
  const pct = Math.round(((cur - prev) / prev) * 100) || 0;
  const tone = pct === 0 ? 'flat' : (pct > 0) !== lowerIsBetter ? 'up' : 'down';
  return (
    <>
      <span className={`vh-pill ${tone}`}>
        {pct !== 0 && <i className={`vh-tri ${pct > 0 ? 'is-up' : 'is-down'}`} />}
        {pct > 0 ? '+' : ''}{pct}%
      </span>
      <span>from {format(prev)}</span>
    </>
  );
}

function Kpi({ label, value, children, tone }) {
  return (
    <div className={`vh-kpi${tone ? ` is-${tone}` : ''}`}>
      <div className="vh-kpi-mark" />
      <div className="vh-label">{label}</div>
      <div className="vh-kpi-value">{value}</div>
      <div className="vh-kpi-foot">{children}</div>
    </div>
  );
}

function Panel({ title, sub, right, children }) {
  return (
    <section className="vh-panel">
      <div className="vh-head">
        <div><h3 className="vh-title">{title}</h3>{sub && <p className="vh-sub">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function ActivityChart({ data }) {
  const W = 1000, H = 240, left = 34, bottom = 26, top = 8;
  const max = Math.max(1, ...data.map(d => d.count));
  const step = max <= 4 ? 1 : Math.max(1, Math.ceil(max / 4 / 5) * 5);
  const ceil = Math.max(step, Math.ceil(max / step) * step);
  const plotW = W - left, plotH = H - bottom - top;
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(36, slot * 0.62));
  const peak = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0);
  const ticks = [];
  for (let v = 0; v <= ceil; v += step) ticks.push(v);
  const marks = [...new Set(data.length > 2 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : data.map((_, i) => i))];
  const anchor = k => (marks.length > 1 && k === 0 ? 'start' : marks.length > 1 && k === marks.length - 1 ? 'end' : 'middle');
  return (
    <div className="vh-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flights over the period">
        {ticks.map(v => {
          const y = top + plotH - (v / ceil) * plotH;
          return (
            <g key={v}>
              <line x1={left} x2={W} y1={y} y2={y} stroke="var(--border-color)" strokeWidth="1" />
              <text x={left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">{v}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.count / ceil) * plotH;
          return (
            <g key={i}>
              <title>{`${d.label}: ${d.count} ${d.count === 1 ? 'flight' : 'flights'}`}</title>
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && <rect x={left + i * slot + (slot - bw) / 2} y={top + plotH - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={i === peak ? 'var(--avg-gold)' : 'var(--avg-green)'} />}
            </g>
          );
        })}
        {marks.map((i, k) => (
          <text key={i} x={left + i * slot + slot / 2 + (anchor(k) === 'start' ? -bw / 2 : anchor(k) === 'end' ? bw / 2 : 0)} y={H - 6}
            fontSize="12" fill="var(--text-secondary)" textAnchor={anchor(k)}>
            {data[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Ranked({ rows, empty = 'No flights in this period.' }) {
  if (!rows.length) return <p className="vh-empty">{empty}</p>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.map((r, i) => (
    <div key={r.key} className={`vh-rank${i === 0 ? ' is-first' : ''}`}>
      <span className="vh-rank-n">{i + 1}</span>
      <span className={`vh-rank-main${r.mono ? ' vh-mono' : ''}`}>{r.title}{r.sub && <small>{r.sub}</small>}</span>
      <span className="vh-num">{num(r.value)}</span>
      <span className="vh-rank-bar"><i style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></span>
    </div>
  ));
}

function Meter({ label, value, detail, colour }) {
  return (
    <div className="vh-meter">
      <div className="vh-meter-top"><span>{label}</span><b>{value}%</b></div>
      <div className="vh-track"><i style={{ width: `${Math.min(100, value)}%`, background: colour }} /></div>
      <p className="vh-sub" style={{ marginTop: '0.35rem' }}>{detail}</p>
    </div>
  );
}

export default function VAHealth() {
  const today = toInputDate(new Date());
  const [fromDate, setFromDate] = useState(() => startFor(7));
  const [toDate, setToDate] = useState(today);
  const [preset, setPreset] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (from, to, silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      setData(await healthApi.get({ from, to }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(fromDate, toDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = days => {
    const f = startFor(days);
    setFromDate(f); setToDate(today); setPreset(days);
    load(f, today);
  };

  if (loading) return <Loader />;
  if (!data) return <p className="vh-empty" style={{ padding: '2rem' }}>Couldn't load VA Health. Try refreshing.</p>;

  const { range, pireps, signups, pilots, exam, topRoutes, topAircraft, dailyTrend, topPilots } = data;
  const per = range.days > 60 ? 'week' : 'day';
  const busiest = Math.max(0, ...dailyTrend.map(d => d.count));
  const filed = pireps.inRange + pireps.rejected;
  const outcomes = [
    { label: 'Auto-approved', value: pireps.autoApproved, colour: 'var(--avg-green)' },
    { label: 'Approved by staff', value: Math.max(0, pireps.inRange - pireps.autoApproved), colour: 'var(--avg-green-light)' },
    { label: 'Rejected', value: pireps.rejected, colour: '#c0582f' },
  ];
  const pctOf = (v, total) => (total ? Math.round((v / total) * 100) : 0);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);

  return (
    <div className="vh">
      <style>{CSS}</style>

      {/* Range */}
      <div className="vh-panel vh-bar">
        <div className="vh-seg">
          {PRESETS.map(p => <button key={p.days} className={preset === p.days ? 'is-on' : ''} onClick={() => pick(p.days)}>{p.label}</button>)}
        </div>
        <div className="vh-dates">
          <input type="date" value={fromDate} max={toDate} onChange={e => { setFromDate(e.target.value); setPreset(null); }} aria-label="From" />
          <span>to</span>
          <input type="date" value={toDate} min={fromDate} max={today} onChange={e => { setToDate(e.target.value); setPreset(null); }} aria-label="To" />
          {preset == null && <button className="vh-btn is-primary" onClick={() => load(fromDate, toDate)}>Apply</button>}
        </div>
        <button className="vh-btn" onClick={() => load(fromDate, toDate, true)} disabled={refreshing} aria-label="Refresh">
          <RefreshCw size={14} style={{ animation: refreshing ? 'vh-spin 1s linear infinite' : 'none' }} />
        </button>
        <div className="vh-period">
          <b>{niceDate(range.from, !sameYear)} to {niceDate(range.to)}</b>
          <span>{range.days} {range.days === 1 ? 'day' : 'days'}, compared with the {range.days} before</span>
        </div>
      </div>

      {/* Headline figures */}
      <div className="vh-kpis">
        <Kpi label="Flights" value={num(pireps.inRange)} tone="lead"><Change cur={pireps.inRange} prev={pireps.prevPeriod} /></Kpi>
        <Kpi label="Hours flown" value={hours(pireps.totalHours)}><Change cur={pireps.totalHours} prev={pireps.prevHours} format={hours} /></Kpi>
        <Kpi label="Pilots flying" value={num(pireps.uniquePilots)}><Change cur={pireps.uniquePilots} prev={pireps.prevUniquePilots} /></Kpi>
        <Kpi label="New members" value={num(signups.inRange)}><Change cur={signups.inRange} prev={signups.prevPeriod} /></Kpi>
        <Kpi label="Active pilots" value={`${pilots.activePct}%`}><span>{num(pilots.activeCount)} of {num(pilots.total)} flew in 30 days</span></Kpi>
        <Kpi label="To review" value={num(pireps.pending)} tone={pireps.pending > 5 ? 'alert' : undefined}>
          <span>{pireps.pending ? `PIREP${pireps.pending === 1 ? '' : 's'} pending` : 'Queue is clear'}</span>
        </Kpi>
      </div>

      {/* Activity */}
      <Panel title={`Flights per ${per}`} sub={`Average ${hours(pireps.avgFlightTime)} per flight, ${pireps.pirepsPerPilot} flights per pilot`}
        right={<span className="vh-sub">Busiest {per}: <b style={{ color: 'var(--text-primary)' }}>{num(busiest)}</b></span>}>
        <ActivityChart data={dailyTrend} />
      </Panel>

      <div className="vh-two">
        <Panel title="PIREP outcomes" sub={`${num(filed)} filed in this period`}>
          <div className="vh-stack">
            {outcomes.map(o => o.value > 0 && <span key={o.label} style={{ width: `${pctOf(o.value, filed)}%`, background: o.colour }} />)}
          </div>
          <div className="vh-legend">
            {outcomes.map(o => (
              <div key={o.label} className="vh-legend-row">
                <span className="vh-swatch" style={{ background: o.colour }} /><span>{o.label}</span>
                <span className="vh-num">{num(o.value)}</span><span className="vh-pct">{pctOf(o.value, filed)}%</span>
              </div>
            ))}
          </div>
          <div className="vh-facts">
            <div className="vh-fact"><b>{num(pireps.multiplied)}</b><span>with a multiplier</span></div>
            <div className="vh-fact"><b>{hours(pireps.avgFlightTime)}</b><span>average flight</span></div>
            <div className="vh-fact"><b>{num(pireps.pending)}</b><span>waiting for review</span></div>
          </div>
        </Panel>

        <Panel title="Pilots and recruitment" sub="Activity over the last 30 days, exam all time">
          <Meter label="Pilots who flew in the last 30 days" value={pilots.activePct}
            detail={`${num(pilots.activeCount)} of ${num(pilots.total)} approved pilots`}
            colour={pilots.activePct >= 50 ? 'var(--avg-green)' : '#c0582f'} />
          {exam.passRate != null && (
            <Meter label="Entry exam pass rate" value={exam.passRate}
              detail={`${num(exam.passed)} passed and ${num(exam.total - exam.passed)} failed`}
              colour={exam.passRate >= 70 ? 'var(--avg-green)' : 'var(--avg-gold)'} />
          )}
          <div className="vh-facts">
            <div className="vh-fact"><b>{num(pilots.total)}</b><span>approved pilots</span></div>
            <div className="vh-fact"><b>{num(pilots.total - pilots.activeCount)}</b><span>not flown in 30 days</span></div>
            <div className="vh-fact"><b>{num(signups.inRange)}</b><span>joined this period</span></div>
          </div>
        </Panel>
      </div>

      <div className="vh-three">
        <Panel title="Most flown routes">
          <Ranked rows={(topRoutes || []).slice(0, 6).map(r => ({ key: `${r.departure_icao}-${r.arrival_icao}`, title: `${r.departure_icao} → ${r.arrival_icao}`, mono: true, value: r.count }))} />
        </Panel>
        <Panel title="Popular aircraft">
          <Ranked rows={(topAircraft || []).slice(0, 6).map(a => ({ key: a.name, title: a.name, value: a.count }))} />
        </Panel>
        <Panel title="Top pilots" sub="By flights">
          <Ranked rows={(topPilots || []).map(p => ({
            key: p.id, title: p.callsign || p.name || 'Unknown',
            sub: [p.name && p.callsign ? p.name : null, `${hours(p.hours)} flown`].filter(Boolean).join(' | '),
            value: p.flights,
          }))} />
        </Panel>
      </div>

      <ReportCard from={range.from} to={range.to} />
    </div>
  );
}

function ReportCard({ from, to }) {
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setUrl(null); setError(null);
    healthApi.card({ from, to })
      .then(b => { if (cancelled) return; objectUrl = URL.createObjectURL(b); setBlob(b); setUrl(objectUrl); })
      .catch(err => { if (!cancelled) setError(err.message || "Couldn't draw the report"); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [from, to]);

  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `avg-report-${from}-to-${to}.png`;
    a.click();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser wouldn't copy the image. Download it instead.");
    }
  };

  return (
    <Panel title="Report card" sub="This period as an image to share"
      right={
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {window.ClipboardItem && <button className="vh-btn" onClick={copy} disabled={!blob}>{copied ? 'Copied' : 'Copy image'}</button>}
          <button className="vh-btn is-primary" onClick={download} disabled={!url}>Download PNG</button>
        </div>
      }>
      {error && <p className="vh-empty" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      <div className="vh-card-img">
        {url
          ? <img src={url} alt={`${brand.abbreviation} network report, ${from} to ${to}`} />
          : !error && <div className="vh-empty" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Drawing the report…</div>}
      </div>
    </Panel>
  );
}
