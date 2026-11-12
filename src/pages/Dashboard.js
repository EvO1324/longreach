/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import Loader from '../components/Loader';
import { flights, settings, routes, notams as notamsApi, news as newsApi } from '../api/client';
import { cacheGet, cacheSet } from '../cache';
import { getAirport } from '../services/airportService';
import { useNavigate } from 'react-router-dom';
import { DashboardRankWidget, useRanks, resolveRank } from '../components/RankBadge';
import ActiveATCCard from '../components/ActiveATCCard';
import BadgeUnlockedModal from '../components/BadgeUnlockedModal';
import { DeveloperBadge, isDeveloper } from '../components/DeveloperBadge';
import { AlertTriangle, X } from 'lucide-react';
import AircraftLabel from '../components/AircraftLabel';

import brand, { features } from '../brand';
import brandCore from '../brand/brandCore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatDuration = hours => `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
const ago = date => {
  const days = Math.floor((new Date() - new Date(date)) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
};

const STAT_CARDS = {
  flights:      ({ user }) => ({ value: user.total_flights ?? 0 }),
  hours:        ({ user }) => ({ value: user.total_hours ? formatDuration(user.total_hours) : '—' }),
  lastFlight:   ({ lastFlight }) => ({ value: lastFlight ? ago(lastFlight.date) : '—', sub: lastFlight ? `${lastFlight.departure_icao} → ${lastFlight.arrival_icao}` : null }),
  streak:       ({ streak }) => ({ value: streak || 0, sub: streak === 1 ? 'day' : streak > 1 ? 'days' : 'No active streak' }),
  monthHours:   ({ stats }) => ({ value: stats ? formatDuration(stats.this_month?.hours || 0) : '—', sub: stats ? `${formatDuration(stats.last_month?.hours || 0)} last month` : null }),
  monthFlights: ({ stats }) => ({ value: stats ? stats.this_month?.flights || 0 : '—', sub: stats ? `${stats.last_month?.flights || 0} last month` : null }),
  distance:     ({ stats }) => ({ value: stats ? `${Math.round(stats.total_distance_nm || 0).toLocaleString()} nm` : '—' }),
  avgFlight:    ({ stats }) => ({ value: stats?.avg_flight_time ? formatDuration(stats.avg_flight_time) : '—' }),
  longest:      ({ stats }) => ({ value: stats?.longest_flight ? formatDuration(stats.longest_flight.hours || 0) : '—', sub: stats?.longest_flight ? `${stats.longest_flight.dep} → ${stats.longest_flight.arr}` : null }),
  rank:         ({ rank }) => ({ value: rank?.currentRank?.name || '—', small: true }),
  nextRank:     ({ rank, user }) => rank?.nextRank
    ? { value: `${Math.max(0, rank.nextRank.hours_required - (user.total_hours || 0)).toFixed(1)}h`, sub: `to ${rank.nextRank.name}` }
    : { value: '—', sub: rank?.currentRank ? 'Top rank' : null },
  topAircraft:  ({ stats }) => ({ value: stats?.top_aircraft?.[0]?.type || '—', small: true, sub: stats?.top_aircraft?.[0] ? `${stats.top_aircraft[0].count} flights` : null }),
  topAirport:   ({ stats }) => ({ value: stats?.top_airports?.[0]?.icao || '—', sub: stats?.top_airports?.[0] ? `${stats.top_airports[0].total} visits` : null }),
  atcHours:     ({ user }) => ({ value: user.atc_hours ? formatDuration(user.atc_hours) : '—' }),
};
const STAT_LABELS = Object.fromEntries((brandCore.DASHBOARD_STATS || []).map(x => [x.key, x.label]));
const DASH = brand.dashboard || {};
const DASH_STATS = (DASH.stats || ['flights', 'hours', 'lastFlight', 'streak']).filter(k => STAT_CARDS[k]);
const SECTION_FEATURE = Object.fromEntries((brandCore.DASHBOARD_SECTIONS || []).map(x => [x.key, x.feature]));
// plugins can be switched on and off while the site is open, so this is worked out each render
const dashSections = () => (DASH.sections || ['rank', 'activeAtc', 'routesOfTheWeek', 'recentFlights'])
  .filter(k => !SECTION_FEATURE[k] || features[SECTION_FEATURE[k]] !== false);
const greetingFor = user => String(DASH.greeting || 'Welcome back, {name}').replace('{name}', user.first_name || 'Captain');

function Dashboard({ user }) {
  const DASH_SECTIONS = dashSections();
  const [recentFlights, setRecentFlights] = useState([]);
  const [lastFlight, setLastFlight] = useState(null);
  const [streak, setStreak] = useState(0);
  const [myStats, setMyStats] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heroImage, setHeroImage] = useState('');
  const [heroCredit, setHeroCredit] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState([]);
  const [notams, setNotams] = useState([]);
  const [notamOpen, setNotamOpen] = useState(false);
  const [currentNoteIdx, setCurrentNoteIdx] = useState(0);
  const [newsPosts,  setNewsPosts]  = useState([]);
  const [newsIdx,    setNewsIdx]    = useState(0);
  const [newsOpen,   setNewsOpen]   = useState(false);
  const navigate = useNavigate();
  const { ranks } = useRanks();

  const markNewsSeen = () => {
    const seenKey = `news_seen:${user.id}`;
    const seen    = JSON.parse(localStorage.getItem(seenKey) || '[]');
    const updated = [...new Set([...seen, ...newsPosts.map(p => p.id)])];
    localStorage.setItem(seenKey, JSON.stringify(updated));
    setNewsOpen(false);
  };

  const loadDashboard = useCallback(async () => {
    // Restore from cache instantly, then refresh in background
    const cached = cacheGet(`dashboard:${user.id}`);
    if (cached) {
      setRecentFlights(cached.recentFlights);
      setHeroImage(cached.heroImage);
      if (cached.schedule) setSchedule(cached.schedule);
      if (cached.notams) setNotams(cached.notams);
      setLoading(false);
    }

    try {
      // Fire everything in parallel
      const [flightsData, settingsData, myStatsData, notamData, rejectedData, newsData] = await Promise.all([
        flights.list({ user: user.id, status: 'approved', limit: 5, sort: '-date' }),
        settings.list(),
        flights.myStats().catch(() => null),
        notamsApi.list().catch(() => ({ notams: [] })),
        flights.unreadRejections(user.id).catch(() => ({ flights: [] })),
        newsApi.list().catch(() => ({ news: [] })),
      ]);

      setRecentFlights(flightsData.flights || []);
      setLastFlight((flightsData.flights || [])[0] || null);
      if (myStatsData) { setStreak(myStatsData.streak || 0); setMyStats(myStatsData); }
      setNotams(notamData.notams || []);

      const posts = newsData.news || [];
      if (posts.length > 0) {
        const seenKey = `news_seen:${user.id}`;
        const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
        const unseen = posts.filter(p => !seen.includes(p.id));
        if (unseen.length > 0) { setNewsPosts(unseen); setNewsIdx(0); setNewsOpen(true); }
      }

      const unread = (rejectedData.flights || []).filter(f => f.rejection_note && !f.rejection_note_read);
      if (unread.length > 0) setRejectionNotes(unread);

      const _newHero = settingsData.settings?.hero_image || '';
      setHeroImage(_newHero);
      setHeroCredit(settingsData.settings?.hero_image_credit || '');

      let computedSchedule = null;
      const scheduleValue = settingsData.settings?.weekly_schedule;
      if (scheduleValue) {
        const parsed = JSON.parse(scheduleValue);
        const allIds = [...new Set(Object.values(parsed).flat().map(e => e?.routeId || e).filter(Boolean))];
        if (allIds.length) {
          const routesData = await routes.list({ ids: allIds.join(',') });
          const routeMap = Object.fromEntries((routesData.routes || []).map(r => [r.id, r]));
          const enriched = {};
          await Promise.all(
            DAYS.map(async day => {
              const ids = parsed[day] || [];
              const dayRoutes = ids.map(e => routeMap[e?.routeId || e]).filter(Boolean);
              enriched[day] = await Promise.all(
                dayRoutes.map(async r => {
                  const [dep, arr] = await Promise.all([getAirport(r.departure_icao), getAirport(r.arrival_icao)]);
                  return { ...r, depCity: dep?.city || null, arrCity: arr?.city || null };
                })
              );
            })
          );
          computedSchedule = enriched;
          setSchedule(enriched);
        }
      }

      const computedNotams = notamData.notams || [];

      cacheSet(`dashboard:${user.id}`, {
        recentFlights: flightsData.flights || [],
        heroImage: settingsData.settings?.hero_image || '',
        schedule: computedSchedule,
        notams: computedNotams,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const dismissNote = async () => {
    const note = rejectionNotes[currentNoteIdx];
    if (note) {
      try { await flights.readRejection(note.id); } catch (e) {}
    }
    if (currentNoteIdx + 1 < rejectionNotes.length) {
      setCurrentNoteIdx(i => i + 1);
    } else {
      setRejectionNotes([]);
      setCurrentNoteIdx(0);
    }
  };

  const NOTAM_STYLES = {
    info:     { color: '#1976d2', bg: 'rgba(25,118,210,0.08)',  border: '#1976d2' },
    warning:  { color: '#e65100', bg: 'rgba(230,81,0,0.08)',   border: '#e65100' },
    success:  { color: '#2e7d32', bg: 'rgba(46,125,50,0.08)',  border: '#2e7d32' },
    critical: { color: '#c62828', bg: 'rgba(198,40,40,0.08)',  border: '#c62828' },
  };

  const hasSchedule = schedule && DAYS.some(d => schedule[d]?.length > 0);

  // Routes of the Week preview (a dashboard section)
  const rotwSection = (hasSchedule || loading) ? (
    <div
      onClick={() => navigate('/rotw')}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderLeft: '4px solid var(--brand-accent)', borderRadius: '10px',
        padding: '1.1rem 1.5rem', marginBottom: '2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', transition: 'box-shadow 0.2s ease',
        boxShadow: '0 1px 3px var(--shadow)',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow-hover)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px var(--shadow)'}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.2rem' }}>Routes of the Week</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {loading ? '...' : (() => {
            const today = new Date().toLocaleDateString('en-AU', { weekday: 'long' });
            const todayRoutes = schedule?.[today] || [];
            const total = DAYS.reduce((sum, d) => sum + (schedule?.[d]?.length || 0), 0);
            return todayRoutes.length > 0
              ? `${todayRoutes.length} route${todayRoutes.length !== 1 ? 's' : ''} today · ${total} this week`
              : `${total} route${total !== 1 ? 's' : ''} scheduled this week`;
          })()}
        </div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </div>
  ) : null;

  // Recent flights (a dashboard section)
  const recentSection = (
    <div className="card">
      <h3>My Recent Flights</h3>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}><Loader size={72} /></div>
      ) : recentFlights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <p>No flights logged yet</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Head to <strong>File PIREP</strong> to log your first flight!</p>
        </div>
      ) : (
        <>
          <div className="desktop-only">
            <table>
              <thead>
                <tr><th>Flight</th><th>Route</th><th>Aircraft</th><th>Duration</th><th>Date</th></tr>
              </thead>
              <tbody>
                {recentFlights.map(flight => (
                  <tr key={flight.id}>
                    <td><strong>{flight.flight_number}</strong></td>
                    <td>{flight.departure_icao} → {flight.arrival_icao}</td>
                    <td><AircraftLabel flight={flight} /></td>
                    <td>{formatDuration(flight.flight_time)}</td>
                    <td>{new Date(flight.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-only">
            {recentFlights.map(flight => (
              <div key={flight.id} style={{
                padding: '0.875rem 0', borderBottom: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <strong>{flight.flight_number}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{new Date(flight.date).toLocaleDateString()}</span>
                </div>
                <div style={{ marginBottom: '0.3rem' }}>{flight.departure_icao} → {flight.arrival_icao}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <AircraftLabel flight={flight} inline />
                  <span>{formatDuration(flight.flight_time)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
    {!(rejectionNotes.length > 0 && rejectionNotes[currentNoteIdx]) && <BadgeUnlockedModal />}
    {rejectionNotes.length > 0 && rejectionNotes[currentNoteIdx] && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}>
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px', padding: '2rem',
          width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(198,40,40,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>PIREP Rejected</div>
              {rejectionNotes.length > 1 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentNoteIdx + 1} of {rejectionNotes.length}</div>
              )}
            </div>
          </div>
          <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              {rejectionNotes[currentNoteIdx].departure_icao} → {rejectionNotes[currentNoteIdx].arrival_icao} · {rejectionNotes[currentNoteIdx].aircraft}
            </div>
            {rejectionNotes[currentNoteIdx].rejection_note || 'No reason provided.'}
          </div>
          <button onClick={dismissNote} style={{
            width: '100%', padding: '0.75rem', background: '#c62828',
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
          }}>
            {currentNoteIdx + 1 < rejectionNotes.length ? 'Next' : 'Dismiss'}
          </button>
        </div>
      </div>
    )}
    <div className="dashboard">
      {/* Hero */}
      <div className="hero-section" style={{
        position: 'relative',
        background: heroImage ? '#0f172a' : 'var(--brand-hero)',
        transition: 'background 0.3s',
      }}>
        {heroImage && (
          <>
            <img
              src={heroImage}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.5s ease', zIndex: 0 }}
              onLoad={e => { e.target.style.opacity = 1; }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.55) 100%)', zIndex: 1 }} />
          </>
        )}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {greetingFor(user)}
            {isDeveloper(user) && <DeveloperBadge />}
          </h1>
          <p>{user.callsign}</p>
        </div>
        {/* Photo credit */}
        {heroImage && heroCredit && (
          <div style={{
            position: 'absolute', bottom: '0.6rem', left: '1rem', zIndex: 3,
            fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.02em',
          }}>
            {heroCredit}
          </div>
        )}

        {/* NOTAM button */}
        {notams.length > 0 && (
          <button
            className="hero-notam"
            onClick={() => setNotamOpen(true)}
            style={{
              position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 3,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.9rem',
              background: 'rgba(198,40,40,0.92)',
              border: '1.5px solid rgba(198,40,40,1)',
              borderRadius: '8px',
              color: 'white',
              fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(198,40,40,1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(198,40,40,0.92)'}
          >
            <AlertTriangle size={15} strokeWidth={2.5} />
            {notams.length} NOTAM{notams.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* News modal */}
      {newsOpen && newsPosts.length > 0 && (() => {
        const post  = newsPosts[newsIdx];
        const total = newsPosts.length;
        const date  = new Date(post.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        return (
          <div onClick={markNewsSeen} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

              {/* Image */}
              {post.image_url && (
                <div style={{ position: 'relative', height: 200, flexShrink: 0, background: '#111' }}>
                  <img src={post.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} onError={e => e.target.parentNode.style.display = 'none'} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.5))' }} />
                  <button onClick={markNewsSeen} style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
                </div>
              )}

              {/* Content */}
              <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
                {!post.image_url && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                    <button onClick={markNewsSeen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--avg-green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  {brand.abbreviation} News{total > 1 ? ` · ${newsIdx + 1} of ${total}` : ''}
                </div>
                <h2 style={{ margin: '0 0 0.9rem', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>{post.title}</h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{post.body}</p>
              </div>

              {/* Footer */}
              <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{post.posted_by}</strong> · {date}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {total > 1 && newsIdx > 0 && (
                    <button onClick={() => setNewsIdx(i => i - 1)} style={{ padding: '0.45rem 0.9rem', border: '1px solid var(--border-color)', borderRadius: 7, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>← Back</button>
                  )}
                  {total > 1 && newsIdx < total - 1 ? (
                    <button onClick={() => setNewsIdx(i => i + 1)} style={{ padding: '0.45rem 0.9rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700 }}>Next →</button>
                  ) : (
                    <button onClick={markNewsSeen} style={{ padding: '0.45rem 0.9rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700 }}>Got it</button>
                  )}
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* NOTAM modal */}
      {notamOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => setNotamOpen(false)}
        >
          <div
            style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={18} color="var(--avg-gold)" strokeWidth={2.5} />
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>NOTAMs</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '5px', background: 'rgba(var(--brand-accent-rgb),0.12)', color: 'var(--avg-gold)' }}>
                  {notams.length} active
                </span>
              </div>
              <button onClick={() => setNotamOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>
            {/* NOTAM list */}
            <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {notams.map(n => {
                const ns = NOTAM_STYLES[n.type] || NOTAM_STYLES.info;
                return (
                  <div key={n.id} style={{ padding: '0.9rem 1rem', borderRadius: '8px', background: ns.bg, border: `1px solid ${ns.border}`, borderLeft: `4px solid ${ns.border}` }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: ns.color, marginBottom: '0.3rem' }}>{n.title}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{n.body}</div>
                    {n.expires_at && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Expires {new Date(n.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button onClick={() => setNotamOpen(false)} style={{ width: '100%', padding: '0.65rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Warning Banner */}
      {user.activity_warned_at && (() => {
        const warnedAt   = new Date(user.activity_warned_at);
        const suspendAt  = new Date(warnedAt);
        suspendAt.setDate(suspendAt.getDate() + 7);
        const daysLeft   = Math.max(0, Math.ceil((suspendAt - new Date()) / (1000 * 60 * 60 * 24)));
        return (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            background: daysLeft <= 2 ? 'rgba(198,40,40,0.08)' : 'var(--avg-gold-pale)',
            border: `1.5px solid ${daysLeft <= 2 ? '#c62828' : 'var(--avg-gold)'}`,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: daysLeft <= 2 ? '#c62828' : 'var(--avg-gold-dark)', marginBottom: '0.25rem', fontSize: '0.95rem' }}>
                Activity Warning — Account suspension in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                Your account hasn't had a filed PIREP recently. File an approved PIREP before{' '}
                <strong>{suspendAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>{' '}
                to keep your account active.
              </div>
            </div>
          </div>
        );
      })()}

      <div className="stats-grid" data-tour="dashboard-stats" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${DASH_STATS.length > 4 ? 150 : 180}px, 1fr))` }}>
        {DASH_STATS.map(key => {
          const card = loading && !['flights', 'hours', 'atcHours', 'rank', 'nextRank'].includes(key)
            ? { value: '—' }
            : STAT_CARDS[key]({ user, lastFlight, streak, stats: myStats, rank: ranks.length ? resolveRank(ranks, user.total_hours || 0) : null });
          return (
            <div className="stat-card" key={key}>
              <h4>{STAT_LABELS[key] || key}</h4>
              <div className="stat-value" style={card.small ? { fontSize: '1.15rem', lineHeight: 1.3 } : undefined}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{card.sub}</div>}
            </div>
          );
        })}
      </div>

      {DASH_SECTIONS.map((key, i) => {
        // rank progress and active ATC share a row when they're next to each other
        if (key === 'activeAtc' && DASH_SECTIONS[i - 1] === 'rank' && ranks.length > 0) return null;
        if (key === 'rank') {
          if (!ranks.length) return null;
          const withAtc = DASH_SECTIONS[i + 1] === 'activeAtc';
          return (
            <div key={key} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <DashboardRankWidget user={user} ranks={ranks} onClick={() => navigate('/profile')} />
              </div>
              {withAtc && <div style={{ flex: '1 1 220px' }}><ActiveATCCard /></div>}
            </div>
          );
        }
        if (key === 'activeAtc') return <div key={key} style={{ marginBottom: '2rem' }}><ActiveATCCard /></div>;
        if (key === 'routesOfTheWeek') return <React.Fragment key={key}>{rotwSection}</React.Fragment>;
        if (key === 'recentFlights') return <React.Fragment key={key}>{recentSection}</React.Fragment>;
        return null;
      })}
    </div>
    </>
  );
}

export default Dashboard;
