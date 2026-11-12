/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RecruitmentPipeline from './RecruitmentPipeline';
import Watchlist from './Watchlist';
import ExamManager from './ExamManager';
import { pilots as pilotsApi, roles as rolesApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { GraduationCap } from 'lucide-react';

// Mini bar chart (SVG, no deps)
function MiniBarChart({ data, color = 'var(--avg-green)', height = 80 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 100 / data.length;
  return (
    <svg width="100%" height={height + 24} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * height, d.value > 0 ? 2 : 0);
        return (
          <g key={i}>
            <rect x={`${i * w + w * 0.1}%`} y={height - barH} width={`${w * 0.8}%`} height={barH}
              fill={color} rx="2" opacity="0.8" />
            <text x={`${i * w + w * 0.5}%`} y={height + 16} textAnchor="middle"
              fontSize="9" fill="var(--text-secondary)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Stat card
function StatCard({ label, value, sub, accent = 'var(--avg-green)' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderLeft: `4px solid ${accent}`, borderRadius: '10px',
      padding: '1.1rem 1.3rem', boxShadow: '0 1px 3px var(--shadow)',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

// Overview Tab
function OverviewTab({ allPilots, approvedPilots = [] }) {
  const stats = useMemo(() => {
    const approved = approvedPilots;
    const pending  = allPilots.filter(p => p.status === 'pending');
    const rejected = allPilots.filter(p => p.status === 'rejected');
    const total         = allPilots.length;
    const approvalRate  = (approved.length + rejected.length) > 0
      ? Math.round((approved.length / (approved.length + rejected.length)) * 100)
      : 0;

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
      months.push({ key, label: mo, value: 0, approved: 0, rejected: 0 });
    }
    allPilots.forEach(p => {
      const d = new Date(p.created);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = months.find(x => x.key === key);
      if (m) {
        m.value++;
        if (p.status === 'approved') m.approved++;
        if (p.status === 'rejected') m.rejected++;
      }
    });

    // Growth: this month vs last month
    const thisMonth = months[months.length - 1]?.value || 0;
    const lastMonth = months[months.length - 2]?.value || 0;
    const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

    const recentApps = [...allPilots].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 5);

    return { approved, pending, rejected, total, approvalRate, months, growth, thisMonth, recentApps };
  }, [allPilots, approvedPilots]);

  return (
    <div>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard label="Total Applications" value={stats.total} accent="var(--avg-green)" />
        <StatCard label="Active Pilots" value={stats.approved.length} accent="#2e7d32" sub="approved" />
        <StatCard label="Pending Review" value={stats.pending.length} accent="#e65100"
          sub={stats.pending.length > 0 ? 'needs attention' : 'all clear'} />
        <StatCard label="Approval Rate" value={`${stats.approvalRate}%`} accent="#1976d2"
          sub={`${stats.rejected.length} rejected`} />
        <StatCard label="This Month" value={stats.thisMonth}
          accent={stats.growth > 0 ? '#2e7d32' : stats.growth < 0 ? '#c62828' : 'var(--border-color)'}
          sub={stats.growth !== null ? `${stats.growth > 0 ? '+' : ''}${stats.growth}% vs last month` : 'first month'} />
      </div>

      {/* Application trend chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px var(--shadow)' }}>
        <h4 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Applications — Last 6 Months</h4>
        <MiniBarChart data={stats.months} height={100} color="var(--avg-green)" />
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
          {stats.months.map(m => (
            <div key={m.key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>{m.label}</div>
              {m.value > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.2rem', fontSize: '0.65rem' }}>
                  {m.approved > 0 && <span style={{ color: '#2e7d32', fontWeight: 600 }}>+{m.approved}</span>}
                  {m.rejected > 0 && <span style={{ color: '#c62828', fontWeight: 600 }}>-{m.rejected}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status breakdown + recent activity side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {/* Status breakdown */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px var(--shadow)' }}>
          <h4 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Status Breakdown</h4>
          {[
            { label: 'Approved', count: stats.approved.length, color: '#2e7d32', bg: 'rgba(46,125,50,0.08)' },
            { label: 'Pending',  count: stats.pending.length,  color: '#e65100', bg: 'rgba(230,81,0,0.08)' },
            { label: 'Rejected', count: stats.rejected.length, color: '#c62828', bg: 'rgba(198,40,40,0.08)' },
          ].map(({ label, count, color, bg }) => {
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={label} style={{ marginBottom: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color }}>{label}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 7, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, opacity: 0.75, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent applications */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px var(--shadow)' }}>
          <h4 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Recent Applications</h4>
          {stats.recentApps.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No applications yet.</p>
          ) : stats.recentApps.map(p => {
            const statusColor = p.status === 'approved' ? '#2e7d32' : p.status === 'rejected' ? '#c62828' : '#e65100';
            const daysAgo = Math.floor((Date.now() - new Date(p.created)) / (1000 * 60 * 60 * 24));
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.first_name} {p.last_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.callsign}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor, textTransform: 'capitalize' }}>{p.status}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Active Pilots Tab
function ActivePilotsTab({ pilots, onReload }) {
  const navigate = useNavigate();
  const [rolesList, setRolesList] = useState([]);
  const [search, setSearch] = useState('');

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.875rem',
    border: '1.5px solid var(--border-color)', borderRadius: '6px',
    fontSize: '0.9rem', backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
  };

  useEffect(() => {
    rolesApi.list().then(d => setRolesList(d.roles || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return pilots;
    const q = search.toLowerCase();
    return pilots.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.callsign?.toLowerCase().includes(q) ||
      p.ifc_username?.toLowerCase().includes(q)
    );
  }, [pilots, search]);

  return (
    <div>
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${pilots.length} pilots...`}
          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
          style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          {search ? `No pilots matching "${search}"` : 'No active pilots yet.'}
        </div>
      ) : (
        <div>
          {filtered.map(pilot => (
            <div key={pilot.id}
              onClick={() => navigate(`/admin/pilot/${pilot.id}`)}
              className="pilot-row" style={{ padding: '0.9rem 1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '0.5rem', background: 'var(--bg-card)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.background = 'var(--avg-green-pale)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
              {/* Top: name/username + callsign + chevron */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{pilot.first_name} {pilot.last_name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{pilot.ifc_username || '—'}</div>
                </div>
                <div style={{ color: 'var(--avg-gold-dark)', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{pilot.callsign}</div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{pilot.total_flights} flt</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>·</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{(pilot.total_hours || 0).toFixed(1)}h</span>
                <span style={{
                  display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700,
                  background: pilot.role === 'admin' ? 'rgba(198,40,40,0.1)' : pilot.role === 'staff' ? 'rgba(25,118,210,0.1)' : 'var(--bg-hover)',
                  color: pilot.role === 'admin' ? '#c62828' : pilot.role === 'staff' ? '#1976d2' : 'var(--text-secondary)',
                  textTransform: 'capitalize',
                }}>{pilot.role}</span>
                {pilot.staff_role && rolesList.length > 0 && (() => {
                  const r = rolesList.find(x => x.id === pilot.staff_role);
                  return r ? <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700, background: r.color + '20', color: r.color }}>{r.name}</span> : null;
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Main PilotsManager
function ArchivedPilotsTab({ pilots, onReload }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.875rem',
    border: '1.5px solid var(--border-color)', borderRadius: '6px',
    fontSize: '0.9rem', backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return pilots;
    const q = search.toLowerCase();
    return pilots.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.callsign?.toLowerCase().includes(q) ||
      p.ifc_username?.toLowerCase().includes(q)
    );
  }, [pilots, search]);

  return (
    <div>
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${pilots.length} archived pilots...`}
          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
          style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          {search ? `No pilots matching "${search}"` : 'No archived pilots.'}
        </div>
      ) : (
        <div>
          {filtered.map(pilot => {
            let lastNote = null;
            try { const ns = pilot.admin_notes ? JSON.parse(pilot.admin_notes) : []; lastNote = ns[ns.length - 1] || null; } catch {}
            return (
              <div key={pilot.id}
                onClick={() => navigate(`/admin/pilot/${pilot.id}`)}
                className="pilot-row" style={{ padding: '0.9rem 1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '0.5rem', background: 'var(--bg-card)', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.background = 'var(--avg-green-pale)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{pilot.first_name} {pilot.last_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                      {lastNote ? lastNote.text : (pilot.ifc_username || '—')}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{pilot.callsign}</div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{pilot.total_flights} flt</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>·</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{(pilot.total_hours || 0).toFixed(1)}h</span>
                  <span style={{ display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(100,100,100,0.1)', color: '#888' }}>
                    Archived
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main PilotsManager
function PilotsManager({ initialTab, user }) {
  const [allPilots, setAllPilots]       = useState([]);
  const [approvedPilots, setApproved]   = useState([]);
  const [pendingPilots, setPending]     = useState([]);
  const [archivedPilots, setArchived]   = useState([]);

  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab === 'recruitment' ? 'pipeline' : 'pilots');
  const [examManagerOpen, setExamManagerOpen] = useState(false);
  const { can } = usePermissions(user);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    try {
      setLoading(true);
      const [recruitData, approvedData, archivedData] = await Promise.all([
        pilotsApi.recruitment(),
        pilotsApi.list({ sort: '-total_hours' }),
        pilotsApi.archived().catch(() => ({ pilots: [] })),
      ]);
      const all = recruitData.pilots || [];
      setAllPilots(all);
      setPending(all.filter(p => p.status === 'pending'));
      setApproved(approvedData.pilots || []);
      setArchived(archivedData.pilots || []);
    } catch (err) {
      console.error('Error loading pilots:', err);
      showToast('Failed to load pilots', 'error');
    } finally {
      setLoading(false);
    }
  };

  const reload = () => { hasFetched.current = false; loadAll(); };

  const tabs = initialTab === 'recruitment'
    ? [
        { key: 'pipeline',   label: 'Pipeline', badge: pendingPilots.length || 0, primary: true },
        { key: 'overview',   label: 'Overview' },
        { key: 'watchlist',  label: 'Watchlist' },
      ]
    : [
        { key: 'pilots',   label: `Active Pilots (${approvedPilots.length})` },
        { key: 'archived', label: `Archived (${archivedPilots.length})` },
      ];

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
        {tabs.map(({ key, label, badge, primary }) => (
          <React.Fragment key={key}>
            {key === 'overview' && can('recruitment.manage') && (
              <button
                onClick={() => setExamManagerOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700,
                  color: 'var(--avg-green)', background: 'var(--avg-green-pale)', border: 'none',
                  borderRadius: '7px', padding: '0.45rem 0.8rem', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <GraduationCap size={14} /> Manage Exam
              </button>
            )}
            <button onClick={() => setActiveTab(key)} style={{
              padding: '0.7rem 0', background: 'none', border: 'none',
              borderBottom: activeTab === key ? '3px solid var(--avg-green)' : '3px solid transparent',
              color: activeTab === key ? 'var(--avg-green)' : 'var(--text-secondary)',
              fontWeight: primary ? 700 : (activeTab === key ? 700 : 500), cursor: 'pointer',
              fontSize: primary ? '1rem' : '0.85rem',
              whiteSpace: 'nowrap', marginBottom: '-1px', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              {label}
              {badge > 0 && (
                <span style={{ background: 'var(--avg-green)', color: '#fff', padding: '0.1rem 0.45rem', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700 }}>{badge}</span>
              )}
            </button>
          </React.Fragment>
        ))}
      </div>

      {examManagerOpen && <ExamManager onClose={() => setExamManagerOpen(false)} />}

      {activeTab === 'overview'   && <OverviewTab allPilots={allPilots} approvedPilots={approvedPilots} />}
      {activeTab === 'pipeline'   && <RecruitmentPipeline allPilots={allPilots} onReload={reload} user={user} />}
      {activeTab === 'watchlist'  && <Watchlist />}
      {activeTab === 'pilots'     && <ActivePilotsTab pilots={approvedPilots} onReload={reload} />}
      {activeTab === 'archived'   && <ArchivedPilotsTab pilots={archivedPilots} onReload={reload} />}
    </div>
  );
}

export default PilotsManager;
