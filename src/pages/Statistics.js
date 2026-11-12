/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';
import { stats as statsApi, ranks as ranksApi } from '../api/client';
import MyStats from './MyStats';
import { DeveloperBadge } from '../components/DeveloperBadge';
import {
  PERIODS, ROSTER_PAGE_SIZE, getPeriodFrom, pilotDisplay,
  LegacyBadge, Ico, Icons, PlainSection, SummarySentence, Podium, ProgressRow,
  LineGraph, DualBarChart, BarChart, ToggleGroup,
} from './StatisticsComponents';

import brand from '../brand';
function Statistics({ user }) {
  const fetchCache = React.useRef({});
  const navigate = useNavigate();
  const [tab, setTab]               = useState('va');
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState('all');
  const [lbSort, setLbSort]         = useState('hours');
  const [rosterPage, setRosterPage] = useState(1);
  const [chartType, setChartType]   = useState('bar');
  const [rankMap, setRankMap]       = useState({});

  useEffect(() => {
    ranksApi.list()
      .then(res => {
        const list = res.ranks || res || [];
        const map  = {};
        list.forEach(r => { map[r.id] = r.name; });
        setRankMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRosterPage(1);
    const from     = getPeriodFrom(period);
    const cacheKey = from || 'all';
    if (fetchCache.current[cacheKey]) {
      setData(fetchCache.current[cacheKey]);
      setLoading(false);
      return;
    }
    setLoading(true);
    statsApi.detailed(from)
      .then(d => { fetchCache.current[cacheKey] = d; setData(d); })
      .catch(err => console.error('Stats error:', err))
      .finally(() => setLoading(false));
  }, [period]);

  const dailyBuckets = useMemo(() => data?.dailyBuckets || [], [data]);
  const hasData       = (data?.range?.flights || 0) > 0;

  const overview = useMemo(() => {
    const r   = data?.range;
    const vas = data?.va_stats;
    if (!r) return null;
    const totalFlights = (period === 'all' && vas) ? vas.total_flights : r.flights;
    const totalHours   = (period === 'all' && vas) ? vas.total_hours   : r.hours;
    if (!totalFlights && !r.flights) return null;
    const totalDistanceNm = (period === 'all' && vas) ? vas.total_distance_nm : null;
    const autoApprovedCount = (period === 'all' && vas) ? vas.total_auto_approved : r.autoApproved;
    const autoApprovedTotal = (period === 'all' && vas) ? vas.total_approved_pireps : totalFlights;
    const autoApprovedPct   = (autoApprovedCount != null && autoApprovedTotal > 0)
      ? Math.round((autoApprovedCount / autoApprovedTotal) * 100)
      : null;
    const multipliedFlights = (period === 'all' && vas) ? vas.total_multiplied_flights : r.multipliedFlights;
    const multipliedHours   = (period === 'all' && vas) ? vas.total_multiplied_hours   : r.multipliedHours;
    return {
      totalFlights, totalHours, avgTime: totalFlights > 0 ? totalHours / totalFlights : 0,
      uniqueRoutes: r.uniqueRoutes, busiestDay: r.busiestDay, totalDistanceNm,
      autoApprovedCount, autoApprovedPct, multipliedFlights, multipliedHours,
    };
  }, [data, period]);

  const activityData = useMemo(() => {
    if (!dailyBuckets.length) return [];
    if (period === '30d') {
      const map = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        map[key] = { label: `${d.getDate()}/${d.getMonth()+1}`, shortLabel: `${d.getDate()}`, flights: 0, hours: 0 };
      }
      dailyBuckets.forEach(b => { if (map[b.date]) { map[b.date].flights += b.flights; map[b.date].hours += b.hours; } });
      return Object.values(map);
    }
    if (period === '90d') {
      const weeks = [];
      for (let i = 12; i >= 0; i--) {
        const ref = new Date(); ref.setDate(ref.getDate() - i * 7);
        const ws  = new Date(ref); ws.setDate(ws.getDate() - ws.getDay() + 1);
        const we  = new Date(ws);  we.setDate(we.getDate() + 6);
        weeks.push({ ws, we, label: `${ws.getDate()}/${ws.getMonth()+1}`, shortLabel: `${ws.getDate()}/${ws.getMonth()+1}`, flights: 0, hours: 0 });
      }
      dailyBuckets.forEach(b => { const bd = new Date(`${b.date}T00:00:00`); const w = weeks.find(x => bd >= x.ws && bd <= x.we); if (w) { w.flights += b.flights; w.hours += b.hours; } });
      return weeks;
    }
    const map = {};
    dailyBuckets.forEach(b => {
      const d   = new Date(`${b.date}T00:00:00`);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[key]) { const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]; map[key] = { label: `${mo} '${String(d.getFullYear()).slice(2)}`, shortLabel: mo, flights: 0, hours: 0 }; }
      map[key].flights += b.flights; map[key].hours += b.hours;
    });
    return Object.keys(map).sort().map(k => ({ ...map[k], hours: parseFloat(map[k].hours.toFixed(1)) }));
  }, [dailyBuckets, period]);

  const topPilots = useMemo(() => {
    if (!data) return [];
    if (period === 'all') return [...data.pilots].sort((a, b) => lbSort === 'hours' ? b.total_hours - a.total_hours : b.total_flights - a.total_flights).slice(0, 10);
    return [...(data.topPilotsInRange || [])]
      .sort((a, b) => lbSort === 'hours' ? b.hours - a.hours : b.flights - a.flights)
      .slice(0, 10)
      .map(p => {
        const full = data.pilots.find(x => x.id === p.user_id) || {};
        return { ...full, ...p, id: p.user_id, total_hours: parseFloat(p.hours.toFixed(1)), total_flights: p.flights };
      });
  }, [data, period, lbSort]);

  const popularRoutes = useMemo(() => data?.popularRoutes || [], [data]);
  const aircraftStats = useMemo(() => data?.aircraftStats || [], [data]);
  const dowData        = useMemo(() => data?.dowData || [], [data]);

  const sortedRoster     = useMemo(() => data?.pilots ? [...data.pilots].sort((a, b) => b.total_hours - a.total_hours) : [], [data]);
  const rosterTotalPages = Math.ceil(sortedRoster.length / ROSTER_PAGE_SIZE);
  const rosterSlice      = sortedRoster.slice((rosterPage - 1) * ROSTER_PAGE_SIZE, rosterPage * ROSTER_PAGE_SIZE);
  const rosterOffset     = (rosterPage - 1) * ROSTER_PAGE_SIZE;

  const fmtH  = h => { const n = parseFloat(h || 0); return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : `${n.toFixed(1)}h`; };
  const fmtT  = h => `${Math.floor(h || 0)}h ${Math.round(((h || 0) % 1) * 60)}m`;
  const fmtN  = n => Math.round(n || 0).toLocaleString();

  const fmtNm = nm => nm >= 1e6 ? `${parseFloat((nm / 1e6).toFixed(1))}M` : fmtN(nm);
  const periodLead = { all: `${brand.abbreviation} has logged`, year: `This year ${brand.abbreviation} has logged`, month: `This month ${brand.abbreviation} has logged`, '90d': `In the last 90 days ${brand.abbreviation} has logged`, '30d': 'In the last 30 days AVG has logged' }[period]
    || `${brand.abbreviation} has logged`;
  const summaryParts = [
    `${periodLead} `,
    { text: `${fmtN(overview?.totalHours)} hours` },
    ' over ',
    { text: `${fmtN(overview?.totalFlights)} flights` },
    '.',
  ];
  const summaryDetails = !overview ? [] : [
    overview.uniqueRoutes > 0 && { value: fmtN(overview.uniqueRoutes), label: 'routes' },
    overview.busiestDay && overview.busiestDay !== '—' && { value: overview.busiestDay, label: 'busiest day' },
    overview.avgTime > 0 && { value: fmtT(overview.avgTime), label: 'avg flight' },
    overview.autoApprovedPct != null && { value: `${overview.autoApprovedPct}%`, label: 'auto-approved' },
    period === 'all' && overview.totalDistanceNm > 0 && { value: fmtNm(overview.totalDistanceNm), label: 'nm flown' },
    overview.multipliedFlights > 0 && { value: fmtN(overview.multipliedFlights), label: 'multiplier flights' },
  ].filter(Boolean);
  const lbValue = p => lbSort === 'hours' ? fmtH(p.total_hours || 0) : `${p.total_flights || 0} flights`;

  const maxLb = topPilots[0] ? (lbSort === 'hours' ? (topPilots[0].total_hours || 0) : (topPilots[0].total_flights || 0)) : 1;

  return (
    <div>
      {/* Header + tabs */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2>Statistics</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.6rem' }}>
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.3rem', boxShadow: '0 1px 3px var(--shadow)' }}>
            {[{ key: 'va', label: 'VA Stats' }, { key: 'mine', label: 'My Stats' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '0.4rem 1.1rem', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === t.key ? 'var(--avg-green)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s ease' }}>{t.label}</button>
            ))}
          </div>
          {tab === 'va' && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.3rem', boxShadow: '0 1px 3px var(--shadow)' }}>
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding: '0.4rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: period === p.key ? 'var(--avg-green)' : 'transparent', color: period === p.key ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s ease' }}>{p.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My Stats tab */}
      {tab === 'mine' && <MyStats user={user} />}

      {/* VA Stats tab */}
      {tab === 'va' && (<>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}><Loader size={88} /></div>
        ) : (
          <>
            {hasData && <SummarySentence parts={summaryParts} details={summaryDetails} />}

            {!hasData ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', boxShadow: '0 1px 4px var(--shadow)' }}>
                No flights in this period.
              </div>
            ) : (
              <>
                {/* Activity chart */}
                <div style={{ marginBottom: '2.25rem' }}>
                  <PlainSection title="Activity" extra={<ToggleGroup value={chartType} onChange={setChartType} options={[{ key: 'bar', label: 'Bar' }, { key: 'line', label: 'Line' }]} />}>
                    {chartType === 'line'
                      ? <LineGraph    data={activityData.map(d => ({ ...d, hours: Math.round(d.hours || 0) }))} />
                      : <DualBarChart data={activityData.map(d => ({ ...d, hours: Math.round(d.hours || 0) }))} />
                    }
                  </PlainSection>
                </div>

                {/* Leaderboard + Routes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem', marginBottom: '2.25rem' }}>
                  <PlainSection title="Leaderboard" extra={<ToggleGroup value={lbSort} onChange={setLbSort} options={[{ key: 'hours', label: 'Hours' }, { key: 'flights', label: 'Flights' }]} />}>
                    <Podium pilots={topPilots.slice(0, 3)} formatValue={lbValue} onSelect={p => navigate(`/pilot/${p.id || p.user_id}`)} />
                    {topPilots.slice(3).map((p, idx) => { const i = idx + 3; return (
                      <div
                        key={p.id || p.user_id || i}
                        onClick={() => navigate(`/pilot/${p.id || p.user_id}`)}
                        style={{ cursor: 'pointer', borderRadius: '6px', padding: '0 4px', margin: '0 -4px', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <ProgressRow rank={i + 1} label={pilotDisplay(p)} sub={p.callsign ? ` · ${p.callsign}` : ''}
                          value={lbSort === 'hours' ? (p.total_hours || 0) : (p.total_flights || 0)} max={maxLb}
                          formatted={lbSort === 'hours' ? fmtH(p.total_hours || 0) : `${p.total_flights || 0} flt`}
                          color="var(--avg-green)"
                          legacy={p.has_imported_history} developer={p.is_developer} />
                      </div>
                    ); })}
                  </PlainSection>
                  <PlainSection title="Busiest routes">
                    {popularRoutes.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No routes flown yet.</p>
                      : popularRoutes.map((r, i) => (
                        <ProgressRow key={r.route} rank={i + 1} label={`${r.dep} → ${r.arr}`}
                          value={r.count} max={popularRoutes[0]?.count || 1}
                          formatted={`${r.count} flt · ${fmtH(r.hours)}`} color="var(--avg-gold)" />
                      ))}
                  </PlainSection>
                </div>

                {/* Fleet + Day of week */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem', marginBottom: '2.25rem' }}>
                  <PlainSection title="Fleet">
                    {aircraftStats.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No aircraft data.</p>
                      : aircraftStats.map((a, i) => (
                        <ProgressRow key={a.type} rank={i + 1} label={a.type} value={a.hours} max={aircraftStats[0]?.hours || 1}
                          formatted={`${fmtH(a.hours)} · ${a.count} flt`} color="var(--avg-green)" />
                      ))}
                  </PlainSection>
                  <PlainSection title="By weekday">
                    <BarChart data={dowData} height={120} />
                  </PlainSection>
                </div>

                {/* Full pilot roster */}
                {period === 'all' && sortedRoster.length > 0 && (
                  <PlainSection title="Roster">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr>
                            {['#', 'Name', 'Callsign', 'Rank', 'Hours', 'Flights', 'Joined'].map(h => (
                              <th key={h} style={{ padding: '0.5rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.78rem', textAlign: ['#', 'Hours', 'Flights'].includes(h) ? 'center' : 'left', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rosterSlice.map((p, i) => {
                            const absRank  = rosterOffset + i + 1;
                            const medalBg  = absRank === 1 ? 'var(--brand-accent)' : absRank === 2 ? '#909090' : absRank === 3 ? '#cd7f32' : null;
                            const rankName = rankMap[p.rank] || '—';
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.1s', cursor: 'pointer' }}
                                onClick={() => navigate(`/pilot/${p.id}`)}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--avg-gold-pale)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: '0.68rem', fontWeight: 800, background: medalBg || 'var(--bg-hover)', color: medalBg ? 'white' : 'var(--text-secondary)' }}>{absRank}</span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{pilotDisplay(p)}{p.has_imported_history && <LegacyBadge />}{p.is_developer && <DeveloperBadge />}</span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--avg-gold-dark)', fontSize: '0.82rem', fontWeight: 600 }}>{p.callsign}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{rankName}</td>
                                <td style={{ textAlign: 'center', padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--avg-green)' }}>{fmtH(p.total_hours || 0)}</td>
                                <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>{p.total_flights || 0}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{new Date(p.created).toLocaleDateString('en-AU', { year: 'numeric', month: 'short' })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {rosterTotalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 0' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{rosterOffset + 1}–{Math.min(rosterOffset + ROSTER_PAGE_SIZE, sortedRoster.length)} of {sortedRoster.length}</span>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <button onClick={() => setRosterPage(p => Math.max(1, p - 1))} disabled={rosterPage === 1} style={{ width: 32, height: 32, borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: rosterPage === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rosterPage === 1 ? 0.4 : 1 }}>
                            <Ico size={14} color="var(--text-secondary)">{Icons.chevL}</Ico>
                          </button>
                          {Array.from({ length: rosterTotalPages }, (_, i) => i + 1).filter(n => n === 1 || n === rosterTotalPages || Math.abs(n - rosterPage) <= 1).reduce((acc, n, i, arr) => { if (i > 0 && n - arr[i - 1] > 1) acc.push('…'); acc.push(n); return acc; }, []).map((n, i) => n === '…' ? (
                            <span key={`e${i}`} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0 0.2rem' }}>…</span>
                          ) : (
                            <button key={n} onClick={() => setRosterPage(n)} style={{ width: 32, height: 32, borderRadius: '6px', border: `1px solid ${rosterPage === n ? 'var(--avg-green)' : 'var(--border-color)'}`, background: rosterPage === n ? 'var(--avg-green)' : 'var(--bg-card)', color: rosterPage === n ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: rosterPage === n ? 700 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>{n}</button>
                          ))}
                          <button onClick={() => setRosterPage(p => Math.min(rosterTotalPages, p + 1))} disabled={rosterPage === rosterTotalPages} style={{ width: 32, height: 32, borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: rosterPage === rosterTotalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rosterPage === rosterTotalPages ? 0.4 : 1 }}>
                            <Ico size={14} color="var(--text-secondary)">{Icons.chevR}</Ico>
                          </button>
                        </div>
                      </div>
                    )}
                  </PlainSection>
                )}
              </>
            )}
          </>
        )}
      </>)}
    </div>
  );
}

export default Statistics;
