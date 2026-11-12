/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pilots as pilotsApi, ranks as ranksApi } from '../api/client';
import Loader from '../components/Loader';
import UserAvatar from '../components/UserAvatar';
import { DashboardRankWidget } from '../components/RankBadge';
import { PilotBadges } from '../components/PilotBadge';
import { ArrowLeft } from 'lucide-react';
import AircraftLabel from '../components/AircraftLabel';

function fmtH(h) {
  const hrs  = Math.floor(h || 0);
  const mins = Math.round(((h || 0) % 1) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '10px', padding: '1rem 1.25rem',
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ label, value, max, formatted }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatted}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--avg-green)', borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function ActivityBar({ data }) {
  if (!data?.length) return <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No data yet.</p>;
  const maxFlights = Math.max(...data.map(d => d.flights), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: 80 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.flights} flights`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: '100%', borderRadius: '3px 3px 0 0',
            height: `${Math.max((d.flights / maxFlights) * 64, d.flights > 0 ? 4 : 0)}px`,
            background: 'var(--avg-green)', opacity: 0.85, transition: 'height 0.4s ease',
          }} />
          {data.length <= 12 && (
            <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', textAlign: 'center' }}>
              {d.label?.split(' ')[0]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PublicProfile({ currentUser }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pilot, setPilot]   = useState(null);
  const [stats, setStats]   = useState(null);
  const [ranks, setRanks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pilotData, statsData, ranksData] = await Promise.all([
        pilotsApi.get(id),
        pilotsApi.stats(id),
        ranksApi.list(),
      ]);
      setPilot(pilotData.pilot);
      setStats(statsData);
      setRanks(ranksData.ranks || []);
    } catch (err) {
      setError(err.message || 'Pilot not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <Loader size={80} />
    </div>
  );

  if (error || !pilot) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✈️</div>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Pilot not found</div>
      <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ marginTop: '1rem' }}>Go back</button>
    </div>
  );

  const isOwnProfile = currentUser?.id === pilot.id;
  const memberSince  = pilot.created ? new Date(pilot.created).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : '—';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', padding: 0, marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
        padding: '1.75rem 2rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
      }}>
        <UserAvatar user={pilot} size={72} fontSize="1.75rem" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
              {pilot.first_name}
            </h2>
            {isOwnProfile && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--avg-green)', border: '1px solid rgba(var(--brand-primary-rgb),0.2)' }}>You</span>
            )}
            {pilot.has_imported_history && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: 'rgba(198,40,40,0.08)', color: '#c62828', border: '1px solid rgba(198,40,40,0.2)' }}>Legacy</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: 'var(--avg-gold-dark, #a07820)' }}>{pilot.callsign}</span>
            {pilot.ifc_username && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>IFC: {pilot.ifc_username}</span>
            )}
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Member since {memberSince}</span>
          </div>
        </div>

        {/* Career badge */}
        {pilot.career_active && (
          <div style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: 'rgba(var(--brand-primary-rgb),0.08)', border: '1px solid rgba(var(--brand-primary-rgb),0.2)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--avg-green)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>✈</span> Career Mode
          </div>
        )}
      </div>

      {/* Rank widget */}
      {ranks.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <DashboardRankWidget user={pilot} ranks={ranks} />
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard label="Total Flights" value={stats?.total_flights ?? pilot.total_flights ?? 0} />
        <StatCard label="Total Hours"   value={fmtH(stats?.total_hours ?? pilot.total_hours)} />
        <StatCard label="Avg Flight"    value={fmtH(stats?.avg_flight_time)} />
        <StatCard label="Distance"      value={stats?.total_distance_nm ? `${(stats.total_distance_nm).toLocaleString()} nm` : '—'} />
      </div>

      <PilotBadges userId={pilot.id} style={{ marginBottom: '1.5rem' }} />

      {/* Charts + details row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* Activity chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Activity</div>
          <ActivityBar data={stats?.by_month} />
        </div>

        {/* Top aircraft */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Top Aircraft</div>
          {stats?.top_aircraft?.length ? stats.top_aircraft.map((a, i) => (
            <MiniBar key={a.type} label={a.type} value={a.hours} max={stats.top_aircraft[0].hours} formatted={`${fmtH(a.hours)} · ${a.count} flt`} />
          )) : <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No data yet.</p>}
        </div>

        {/* Top routes */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Top Routes</div>
          {stats?.top_routes?.length ? stats.top_routes.map((r) => (
            <MiniBar key={`${r.dep}-${r.arr}`} label={`${r.dep} → ${r.arr}`} value={r.count} max={stats.top_routes[0].count} formatted={`${r.count} flt`} />
          )) : <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No data yet.</p>}
        </div>
      </div>

      {/* Recent flights */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Recent Flights</div>
        {!stats?.recent_flights?.length ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No approved flights yet.</p>
        ) : (
          <>
            <div className="desktop-only">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    {['Flight', 'Route', 'Aircraft', 'Duration', 'Date'].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_flights.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--avg-green)' }}>{f.flight_number || '—'}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', fontSize: '0.82rem' }}>{f.departure_icao} → {f.arrival_icao}</td>
                      <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}><AircraftLabel flight={f} /></td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>{fmtH(f.flight_time)}</td>
                      <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>{fmtDate(f.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only">
              {stats.recent_flights.map(f => (
                <div key={f.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--avg-green)' }}>{f.flight_number || '—'}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmtDate(f.date)}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>{f.departure_icao} → {f.arrival_icao}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    <AircraftLabel flight={f} inline />
                    <span>{fmtH(f.flight_time)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
