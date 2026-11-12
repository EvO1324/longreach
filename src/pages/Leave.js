/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { leave as leaveApi } from '../api/client';
import { showToast } from '../components/Toast';
import { PlaneTakeoff, Plus, X, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const STATUS_STYLES = {
  pending:  { color: '#b45309', bg: 'rgba(180,83,9,0.08)',  border: 'rgba(180,83,9,0.2)',  label: 'Pending',  Icon: Clock },
  approved: { color: '#2e7d32', bg: 'rgba(46,125,50,0.08)', border: 'rgba(46,125,50,0.2)', label: 'Approved', Icon: CheckCircle },
  denied:   { color: '#c62828', bg: 'rgba(198,40,40,0.08)', border: 'rgba(198,40,40,0.2)', label: 'Denied',   Icon: XCircle },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.Icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      <Icon size={11} />
      {s.label}
    </span>
  );
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function today() { return new Date().toISOString().split('T')[0]; }
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; }

export default function Leave() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ start_date: today(), end_date: addDays(today(), 7), reason: '' });
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await leaveApi.mine();
      setRequests(data.leave || []);
    } catch { showToast('Failed to load leave requests', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.reason.trim()) { showToast('Please provide a reason', 'error'); return; }
    if (new Date(form.end_date) < new Date(form.start_date)) { showToast('End date must be after start date', 'error'); return; }
    try {
      setSubmitting(true);
      await leaveApi.request(form);
      showToast('Leave request submitted!', 'success');
      setShowForm(false);
      setForm({ start_date: today(), end_date: addDays(today(), 7), reason: '' });
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to submit request', 'error');
    } finally { setSubmitting(false); }
  };

  const handleCancel = async id => {
    setConfirm({
      title: 'Cancel leave request?',
      message: 'This will remove your leave request. You can submit a new one at any time.',
      confirmLabel: 'Cancel request',
      danger: true,
      onConfirm: async () => {
        try {
          await leaveApi.cancel(id);
          showToast('Leave request cancelled', 'success');
          load();
        } catch { showToast('Failed to cancel request', 'error'); }
      },
    });
  };

  const active = requests.find(r => r.status === 'approved' && new Date(r.end_date) >= new Date());

  return (
    <div className="main-content-inner">
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 4 }}>Leave of Absence</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Request time away from flying. Approved leave exempts you from activity checks.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Request Leave
          </button>
        )}
      </div>

      {/* Active leave banner */}
      {active && (
        <div style={{ background: 'rgba(46,125,50,0.07)', border: '1px solid rgba(46,125,50,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <PlaneTakeoff size={20} color="#2e7d32" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.9rem' }}>You are currently on approved leave</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {fmt(active.start_date)} — {fmt(active.end_date)} · Activity checks are paused.
            </div>
          </div>
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>New Leave Request</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>Start Date</label>
                <input type="date" value={form.start_date} min={today()}
                  onChange={e => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? addDays(e.target.value, 7) : form.end_date })}
                  required />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>End Date</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  required />
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>
                Reason <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(briefly explain why you need leave)</span>
              </label>
              <textarea
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Holiday travel, university exams, work commitments..."
                rows={3}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1.5px solid var(--border-color)', fontFamily: 'inherit', fontSize: '0.95rem', resize: 'vertical', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      <div className="card">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Leave History</h3>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Calendar size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '0.9rem' }}>No leave requests yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Dates</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Admin Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const days = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmt(r.start_date)}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>→ {fmt(r.end_date)}</div>
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{days} day{days !== 1 ? 's' : ''}</td>
                      <td style={{ fontSize: '0.875rem', maxWidth: 240 }}>{r.reason}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 200 }}>{r.admin_note || '—'}</td>
                      <td>
                        {r.status === 'pending' && (
                          <button onClick={() => handleCancel(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', padding: '4px 8px', borderRadius: 6 }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#c62828'; e.currentTarget.style.background = 'rgba(198,40,40,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'none'; }}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
