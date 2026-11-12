/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import Loader from '../components/Loader';
import { flights as flightsApi } from '../api/client';
import { StatCard, Section, ProgressRow, DualBarChart, BarChart, ToggleGroup } from './StatisticsComponents';
import RunwayDiagram, { GRADE_COLOR } from '../components/RunwayDiagram';

const GRADE_BG    = { A: 'rgba(46,125,50,0.12)', B: 'rgba(85,139,47,0.12)', C: 'rgba(245,127,23,0.12)', D: 'rgba(230,81,0,0.12)', F: 'rgba(198,40,40,0.12)' };

function GradeBadge({ grade, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: GRADE_BG[grade], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontWeight: 900, fontSize: size * 0.44 + 'px', color: GRADE_COLOR[grade] }}>{grade}</span>
    </div>
  );
}

export default function MyStats({ user }) {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [airportSort, setAirportSort] = useState('total');

  useEffect(() => {
    flightsApi.myStats()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmtH      = h => `${Math.floor(h || 0)}h ${Math.round(((h || 0) % 1) * 60)}m`;
  const fmtHShort = h => `${parseFloat(h || 0).toFixed(1)}h`;
  const dowLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
      <Loader size={88} />
    </div>
  );

  if (!data || data.total_flights === 0) return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      No approved flights yet — file a PIREP to see your stats.
    </div>
  );

  const sortedAirports = [...(data.top_airports || [])].sort((a, b) =>
    airportSort === 'dep' ? b.departures - a.departures :
    airportSort === 'arr' ? b.arrivals   - a.arrivals   :
    b.total - a.total
  );

  const maxAirport  = sortedAirports[0]?.[airportSort === 'dep' ? 'departures' : airportSort === 'arr' ? 'arrivals' : 'total'] || 1;
  const maxRoute    = data.top_routes[0]?.count || 1;
  const maxAircraft = data.top_aircraft[0]?.hours || 1;

  const ls            = data.landing_stats || {};
  const hasLandingData = ls.total_landings > 0;
  const hasFuelData    = ls.total_fuel_kg != null;
  const grades         = ['A','B','C','D','F'];
  const totalGraded    = grades.reduce((s, g) => s + (ls.grade_counts?.[g] || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Flights',  value: data.total_flights,                                     iconKey: 'plane' },
          { label: 'Total Hours',    value: fmtHShort(data.total_hours),                            iconKey: 'clock' },
          { label: 'Avg Flight',     value: fmtH(data.avg_flight_time),                             iconKey: 'bar',      sub: 'per PIREP' },
          { label: 'Total Distance', value: `${(data.total_distance_nm || 0).toLocaleString()} nm`, iconKey: 'route' },
          { label: 'This Month',     value: `${data.this_month.flights} flt`,                       iconKey: 'calendar', sub: fmtHShort(data.this_month.hours) },
          { label: 'Busiest Day',    value: data.busiest_dow || '—',                                iconKey: 'calendar', sub: 'most flights on' },
        ].map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Activity chart */}
      {data.by_month.length >= 2 && (
        <Section title="My Activity Over Time" iconKey="trend">
          <DualBarChart data={data.by_month} />
        </Section>
      )}

      {/* Landing & Fuel stats */}
      {(hasLandingData || hasFuelData) && (
        <Section title="Landing & Fuel Stats" iconKey="plane">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>

            {/* Key metrics + grade distribution */}
            {hasLandingData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { label: 'Avg VS',       value: `${(ls.avg_vs_fpm || 0).toLocaleString()} fpm` },
                    { label: 'Avg G-Force',  value: `${ls.avg_g_force || 0}g` },
                    { label: 'Landings',     value: ls.total_landings },
                    { label: 'Avg Fuel/hr',  value: ls.avg_fuel_kg_per_hr ? `${ls.avg_fuel_kg_per_hr} kg` : '—' },
                  ].map(m => (
                    <div key={m.label} style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>{m.label}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Grade bar chart */}
                <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Grade Distribution</div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end', height: 52 }}>
                    {grades.map(g => {
                      const count = ls.grade_counts?.[g] || 0;
                      const pct   = totalGraded > 0 ? count / totalGraded : 0;
                      return (
                        <div key={g} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{count || ''}</div>
                          <div style={{ width: '100%', height: Math.max(4, pct * 36), background: GRADE_COLOR[g], borderRadius: '3px 3px 0 0', opacity: count === 0 ? 0.18 : 1, transition: 'height 0.4s ease' }} />
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: GRADE_COLOR[g] }}>{g}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Best / Worst + fuel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {hasLandingData && ls.best_landing && (
                <div style={{ padding: '0.875rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid rgba(46,125,50,0.2)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Best Landing</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <GradeBadge grade={ls.best_landing.grade} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {ls.best_landing.vs_fpm} fpm · {ls.best_landing.g_force}g
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        {ls.best_landing.dep} → {ls.best_landing.arr}
                        {ls.best_landing.date ? ` · ${new Date(ls.best_landing.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {hasLandingData && ls.worst_landing && (
                <div style={{ padding: '0.875rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid rgba(198,40,40,0.15)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Worst Landing</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <GradeBadge grade={ls.worst_landing.grade} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {ls.worst_landing.vs_fpm} fpm · {ls.worst_landing.g_force}g
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        {ls.worst_landing.dep} → {ls.worst_landing.arr}
                        {ls.worst_landing.date ? ` · ${new Date(ls.worst_landing.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {hasFuelData && (
                <div style={{ padding: '0.875rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Total Fuel Burned</div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {Math.round(ls.total_fuel_kg).toLocaleString()} kg
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    ≈ {Math.round(ls.total_fuel_kg * 1.25).toLocaleString()} L
                    {ls.avg_fuel_kg_per_hr ? ` · avg ${ls.avg_fuel_kg_per_hr} kg/hr` : ''}
                  </div>
                </div>
              )}
            </div>

          </div>

          {hasLandingData && ls.all_landings?.length > 0 && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <RunwayDiagram landings={ls.all_landings} />
            </div>
          )}
        </Section>
      )}

      {/* Longest flight + day of week */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {data.longest_flight && (
          <Section title="Longest Flight" iconKey="plane">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.3rem' }}>{data.longest_flight.dep}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--avg-gold)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.3rem' }}>{data.longest_flight.arr}</span>
              <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 700, color: 'var(--avg-green)' }}>{fmtH(data.longest_flight.hours)}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
              {new Date(data.longest_flight.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </Section>
        )}
        <Section title="Flights by Day of Week" iconKey="calendar">
          <BarChart data={dowLabels.map((label, i) => ({ label, value: (data.dow_counts || [])[i] || 0 }))} height={100} />
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            You fly most on <strong style={{ color: 'var(--avg-gold-dark)' }}>{data.busiest_dow}s</strong>
          </p>
        </Section>
      </div>

      {/* Airport breakdown */}
      <Section
        title="Airport Usage" iconKey="map"
        extra={
          <ToggleGroup
            value={airportSort} onChange={setAirportSort}
            options={[{ key: 'total', label: 'Total' }, { key: 'dep', label: 'Departures' }, { key: 'arr', label: 'Arrivals' }]}
          />
        }
      >
        {sortedAirports.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No airport data.</p>
        ) : sortedAirports.map((a, i) => {
          const val = airportSort === 'dep' ? a.departures : airportSort === 'arr' ? a.arrivals : a.total;
          return (
            <div key={a.icao} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, background: i < 3 ? 'var(--avg-gold)' : 'var(--border-color)', color: i < 3 ? 'white' : 'var(--text-secondary)' }}>{i + 1}</span>
                  {a.icao}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {val} {airportSort === 'dep' ? 'dep' : airportSort === 'arr' ? 'arr' : 'total'}
                  {airportSort === 'total' && <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>({a.departures}↑ {a.arrivals}↓)</span>}
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(val / maxAirport) * 100}%`, background: i === 0 ? 'var(--avg-gold)' : 'var(--avg-green)', borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          );
        })}
      </Section>

      {/* Routes + Aircraft */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <Section title="Most Flown Routes" iconKey="route">
          {data.top_routes.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No route data.</p>
          ) : data.top_routes.map((r, i) => (
            <ProgressRow key={`${r.dep}-${r.arr}`} rank={i + 1}
              label={`${r.dep} → ${r.arr}`} value={r.count} max={maxRoute}
              formatted={`${r.count} flt · ${fmtHShort(r.hours)}`} color="var(--avg-gold)" />
          ))}
        </Section>
        <Section title="Aircraft Usage" iconKey="plane">
          {data.top_aircraft.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No aircraft data.</p>
          ) : data.top_aircraft.map((a, i) => (
            <ProgressRow key={a.type} rank={i + 1}
              label={a.type} value={a.hours} max={maxAircraft}
              formatted={`${fmtHShort(a.hours)} · ${a.count} flt`} color="var(--avg-green)" />
          ))}
        </Section>
      </div>

    </div>
  );
}
