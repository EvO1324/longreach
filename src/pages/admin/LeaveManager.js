/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { leave as leaveApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import { CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';

const STATUS_STYLES = {
  pending:  { color: '#b45309', bg: 'rgba(180,83,9,0.08)',  border: 'rgba(180,83,9,0.2)',  label: 'Pending',  Icon: Clock },
  approved: { color: '#2e7d32', bg: 'rgba(46,125,50,0.08)', border: 'rgba(46,125,50,0.2)', label: 'Approved', Icon: CheckCircle },
  denied:   { color: '#c62828', bg: 'rgba(198,40,40,0.08)', border: 'rgba(198,40,40,0.2)', label: 'Denied',   Icon: XCircle },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.Icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      <Icon size={11} />{s.label}
    </span>
  );
}

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LeaveManager() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [reviewing, setReviewing] = useState(null); // { id, status }
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await leaveApi.all(filter || undefined);
      setRequests(data.leave || []);
    } catch { showToast('Failed to load leave requests', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]); // eslint-disable-line

  const openReview = (id, status) => { setReviewing({ id, status }); setAdminNote(''); };

  const submitReview = async () => {
    if (!reviewing) return;
    try {
      setSaving(true);
      await leaveApi.review(reviewing.id, { status: reviewing.status, admin_note: adminNote });
      showToast(`Leave ${reviewing.status}`, 'success');
      setReviewing(null);
      load();
    } catch { showToast('Failed to update leave request', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Review modal */}
      {reviewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, width: '100%', maxWidth: 440, padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 16 }}>
              {reviewing.status === 'approved' ? '✅ Approve' : '❌ Deny'} Leave Request
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>
                Admin Note <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Leave a note for the pilot..."
                rows={3}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1.5px solid var(--border-color)', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewing(null)} className="btn btn-secondary" style={{ padding: '0.6rem 1.25rem' }}>Cancel</button>
              <button onClick={submitReview} disabled={saving}
                className="btn"
                style={{ padding: '0.6rem 1.25rem', background: reviewing.status === 'approved' ? 'var(--avg-green)' : '#c62828', color: 'white', border: 'none', borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
                {saving ? 'Saving…' : reviewing.status === 'approved' ? 'Approve' : 'Deny'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        {[
          { val: 'pending',  label: 'Pending'  },
          { val: 'approved', label: 'Approved' },
          { val: 'denied',   label: 'Denied'   },
          { val: '',         label: 'All'       },
        ].map(t => (
          <button key={t.val} onClick={() => setFilter(t.val)} style={{
            background: 'none', border: 'none', padding: '10px 18px',
            fontSize: '0.875rem', fontWeight: filter === t.val ? 700 : 500,
            color: filter === t.val ? 'var(--avg-green)' : 'var(--text-secondary)',
            borderBottom: filter === t.val ? '2px solid var(--avg-gold)' : '2px solid transparent',
            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Calendar size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: '0.9rem' }}>No {filter || ''} leave requests.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th>Pilot</th>
                  <th>Dates</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Admin Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const pilot = r.expand?.user;
                  const name  = pilot ? `${pilot.first_name} ${pilot.last_name}` : r.user;
                  const days  = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
                  const isActive = r.status === 'approved' && new Date(r.end_date) >= new Date() && new Date(r.start_date) <= new Date();
                  return (
                    <tr key={r.id} style={{ opacity: r.status === 'denied' ? 0.6 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{name}</div>
                        {pilot?.callsign && <div style={{ fontSize: '0.75rem', color: 'var(--avg-gold-dark)', fontWeight: 600 }}>{pilot.callsign}</div>}
                        {isActive && <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2e7d32', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>● On Leave Now</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{fmt(r.start_date)}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>→ {fmt(r.end_date)}</div>
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{days} day{days !== 1 ? 's' : ''}</td>
                      <td style={{ fontSize: '0.875rem', maxWidth: 200 }}>{r.reason}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 160 }}>{r.admin_note || '—'}</td>
                      <td>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openReview(r.id, 'approved')}
                              style={{ padding: '5px 12px', background: 'rgba(46,125,50,0.1)', color: '#2e7d32', border: '1px solid rgba(46,125,50,0.25)', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
                              Approve
                            </button>
                            <button onClick={() => openReview(r.id, 'denied')}
                              style={{ padding: '5px 12px', background: 'rgba(198,40,40,0.08)', color: '#c62828', border: '1px solid rgba(198,40,40,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
                              Deny
                            </button>
                          </div>
                        )}
                        {r.status !== 'pending' && (
                          <button onClick={() => openReview(r.id, r.status === 'approved' ? 'denied' : 'approved')}
                            style={{ padding: '5px 10px', background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                            Change
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
