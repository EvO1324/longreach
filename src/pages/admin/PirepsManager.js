/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { flights as flightsApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import AircraftLabel from '../../components/AircraftLabel';

const STATUS_BADGE = {
  pending:  { bg: 'rgba(230,81,0,0.1)',  color: '#e65100', label: 'Pending'  },
  approved: { bg: 'rgba(46,125,50,0.1)', color: '#2e7d32', label: 'Approved' },
  rejected: { bg: 'rgba(198,40,40,0.1)', color: '#c62828', label: 'Rejected' },
};

const PAGE_SIZE = 50;

function PirepsManager() {
  const navigate = useNavigate();
  const [tab, setTab]                     = useState('pending');
  const [pending, setPending]             = useState([]);
  const [allPireps, setAllPireps]         = useState([]);
  const [totalAll, setTotalAll]           = useState(0);
  const [page, setPage]                   = useState(1);
  const [loading, setLoading]             = useState(true);
  const [processing, setProcessing]       = useState(null);
  const [rejectModal, setRejectModal]     = useState(null);
  const [rejectNote, setRejectNote]       = useState('');
  const [expandedNotes, setExpandedNotes] = useState({});
  const [replies, setReplies]             = useState([]);

  // pilots who've replied on a PIREP's comments
  useEffect(() => {
    flightsApi.unreadComments().then(d => setReplies(d.flights || [])).catch(() => {});
  }, []);

  const loadPending = useCallback(async () => {
    const data = await flightsApi.pending();
    setPending(data.flights || []);
  }, []);

  // All PIREPs fetches one page at a time from the server
  const loadPage = useCallback(async (p) => {
    const data = await flightsApi.list({ sort: '-date', limit: PAGE_SIZE, page: p });
    setAllPireps(data.flights || []);
    setTotalAll(data.total || 0);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([loadPending(), loadPage(page)]);
    } catch (err) {
      showToast('Failed to load PIREPs', 'error');
    } finally {
      setLoading(false);
    }
  }, [loadPending, loadPage, page]);

  useEffect(() => { load(); }, [load]);

  // When page changes on the "all" tab, fetch that page
  const goToPage = async (p) => {
    setPage(p);
    try {
      setLoading(true);
      await loadPage(p);
    } catch {
      showToast('Failed to load PIREPs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (pirepId) => {
    try {
      setProcessing(pirepId);
      await flightsApi.approve(pirepId);
      showToast('PIREP approved!', 'success');
      // Optimistically remove from pending list immediately
      setPending(prev => prev.filter(p => p.id !== pirepId));
      // Refresh in background without showing loading state
      loadPending().catch(() => {});
      loadPage(page).catch(() => {});
    } catch (err) {
      showToast(err.message || 'Failed to approve PIREP', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    const { pirepId } = rejectModal;
    try {
      setProcessing(pirepId);
      setRejectModal(null);
      await flightsApi.reject(pirepId, rejectNote.trim());
      showToast('PIREP rejected', 'success');
      // Optimistically remove from pending list immediately
      setPending(prev => prev.filter(p => p.id !== pirepId));
      // Refresh in background without showing loading state
      loadPending().catch(() => {});
      loadPage(page).catch(() => {});
    } catch (err) {
      showToast(err.message || 'Failed to reject PIREP', 'error');
    } finally {
      setProcessing(null);
      setRejectNote('');
    }
  };

  const switchTab   = (t) => { setTab(t); setPage(1); };
  const toggleNote  = (id) => setExpandedNotes(s => ({ ...s, [id]: !s[id] }));
  const fmtDuration = (h) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;

  const totalPages    = Math.max(1, Math.ceil(totalAll / PAGE_SIZE));
  const visiblePireps = tab === 'all' ? allPireps : pending;

  return (
    <>
      {replies.length > 0 && (
        <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-card)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {replies.length === 1 ? '1 pilot has replied' : `${replies.length} pilots have replied`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {replies.map(f => {
              const u = f.expand?.user;
              return (
                <button key={f.id} onClick={() => navigate(`/admin/pirep/${f.id}`)} style={{ padding: '0.35rem 0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                  <strong>{u?.callsign || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Pilot'}</strong> · {f.departure_icao} → {f.arrival_icao}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)' }}>
        {[
          { key: 'pending', label: pending.length > 0 ? `Pending (${pending.length})` : 'Pending' },
          { key: 'all',     label: `All PIREPs${totalAll ? ` (${totalAll})` : ''}` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => switchTab(key)} style={{
            padding: '0.6rem 1.25rem', background: 'none',
            border: 'none', borderBottom: tab === key ? '2px solid var(--avg-green)' : '2px solid transparent',
            marginBottom: '-2px', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 500,
            color: tab === key ? 'var(--avg-green)' : 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {tab === 'pending' ? `Pending PIREPs (${pending.length})` : `All PIREPs (${totalAll})`}
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : visiblePireps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            {tab === 'pending' ? 'No pending PIREPs to review 🎉' : 'No PIREPs found'}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="desktop-only">
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ minWidth: "700px" }}>
                <thead>
                  <tr>
                    <th>Pilot</th>
                    <th>Flight</th>
                    <th>Aircraft</th>
                    <th>Duration</th>
                    <th>Date</th>
                    {tab === 'all' && <th>Status</th>}
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePireps.map(pirep => {
                    const pilot    = pirep.expand?.user;
                    const status   = STATUS_BADGE[pirep.status] || STATUS_BADGE.pending;
                    const hasNote  = pirep.notes || pirep.rejection_note;
                    const noteOpen = expandedNotes[pirep.id];
                    return (
                      <React.Fragment key={pirep.id}>
                        <tr>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {pilot ? `${pilot.first_name} ${pilot.last_name}` : 'Unknown'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{pilot?.callsign}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <strong>{pirep.flight_number}</strong>
                              {pirep.auto_approved && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1976d2', background: 'rgba(25,118,210,0.1)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>IF</span>
                              )}
                              {pirep.is_live && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--brand-accent)', background: 'rgba(var(--brand-accent-rgb),0.14)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>LIVE</span>
                              )}
                              {pirep.is_career && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--avg-green)', background: 'rgba(var(--brand-primary-rgb),0.1)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>CAREER</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {pirep.departure_icao} → {pirep.arrival_icao}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.82rem' }}><AircraftLabel flight={pirep} /></td>
                          <td style={{ fontSize: '0.82rem' }}>{fmtDuration(pirep.flight_time)}</td>
                          <td style={{ fontSize: '0.82rem' }}>
                            {new Date(pirep.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          {tab === 'all' && (
                            <td>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '10px', background: status.bg, color: status.color, whiteSpace: 'nowrap' }}>
                                {status.label}
                              </span>
                            </td>
                          )}
                          <td>
                            {hasNote ? (
                              <button onClick={() => toggleNote(pirep.id)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {noteOpen ? 'Hide' : 'Note ▾'}
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={() => navigate(`/admin/pirep/${pirep.id}`)} style={{ padding: '0.35rem 0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                                Edit
                              </button>
                              {pirep.status === 'pending' && (
                                <>
                                  <button onClick={() => handleApprove(pirep.id)} disabled={processing === pirep.id} style={{ padding: '0.35rem 0.7rem', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: processing === pirep.id ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: processing === pirep.id ? 0.6 : 1 }}>
                                    {processing === pirep.id ? '...' : '✓'}
                                  </button>
                                  <button onClick={() => { setRejectNote(''); setRejectModal({ pirepId: pirep.id }); }} disabled={processing === pirep.id} style={{ padding: '0.35rem 0.7rem', background: '#c62828', color: 'white', border: 'none', borderRadius: '4px', cursor: processing === pirep.id ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: processing === pirep.id ? 0.6 : 1 }}>
                                    ✕
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {noteOpen && hasNote && (
                          <tr>
                            <td colSpan={tab === 'all' ? 8 : 7} style={{ padding: '0 1rem 0.75rem', background: 'var(--bg-secondary)' }}>
                              {pirep.notes && (
                                <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Pilot Notes: </strong>{pirep.notes}
                                </div>
                              )}
                              {pirep.rejection_note && (
                                <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(198,40,40,0.05)', border: '1px solid rgba(198,40,40,0.2)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                                  <strong style={{ color: '#c62828', fontSize: '0.7rem', textTransform: 'uppercase' }}>Rejection Note: </strong>{pirep.rejection_note}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile */}
            <div className="mobile-only">
              {visiblePireps.map(pirep => {
                const pilot    = pirep.expand?.user;
                const status   = STATUS_BADGE[pirep.status] || STATUS_BADGE.pending;
                const hasNote  = pirep.notes || pirep.rejection_note;
                const noteOpen = expandedNotes[pirep.id];
                return (
                  <div key={pirep.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{pilot ? `${pilot.first_name} ${pilot.last_name}` : 'Unknown'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{pilot?.callsign}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                          <span style={{ fontWeight: 600 }}>{pirep.flight_number}</span>
                          {pirep.is_career && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--avg-green)', background: 'rgba(var(--brand-primary-rgb),0.1)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>CAREER</span>
                          )}
                        </div>
                        {tab === 'all' && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '8px', background: status.bg, color: status.color }}>
                            {status.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      {pirep.departure_icao} → {pirep.arrival_icao} · {fmtDuration(pirep.flight_time)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      <AircraftLabel flight={pirep} inline empty="" /> · {new Date(pirep.date).toLocaleDateString()}
                    </div>
                    {hasNote && (
                      <button onClick={() => toggleNote(pirep.id)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>
                        {noteOpen ? 'Hide note' : 'Show note ▾'}
                      </button>
                    )}
                    {noteOpen && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        {pirep.notes && (
                          <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                            <strong>Notes:</strong> {pirep.notes}
                          </div>
                        )}
                        {pirep.rejection_note && (
                          <div style={{ padding: '0.5rem', background: 'rgba(198,40,40,0.05)', border: '1px solid rgba(198,40,40,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}>
                            <strong style={{ color: '#c62828' }}>Rejected:</strong> {pirep.rejection_note}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button onClick={() => navigate(`/admin/pirep/${pirep.id}`)} style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Edit</button>
                      {pirep.status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(pirep.id)} style={{ padding: '0.4rem 0.75rem', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>✓ Approve</button>
                          <button onClick={() => { setRejectNote(''); setRejectModal({ pirepId: pirep.id }); }} style={{ padding: '0.4rem 0.75rem', background: '#c62828', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>✕ Reject</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {tab === 'all' && totalPages > 1 && (() => {
              const btnStyle = (active, disabled) => ({
                padding: '0.4rem 0.7rem', minWidth: '36px', borderRadius: '6px',
                border: '1px solid var(--border-color)', cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: active ? 700 : 400, fontSize: '0.875rem',
                background: active ? 'var(--avg-green)' : 'var(--bg-secondary)',
                color: active ? 'white' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                opacity: disabled ? 0.4 : 1,
              });
              const window = 2;
              const show = new Set([1, totalPages]);
              for (let i = Math.max(1, page - window); i <= Math.min(totalPages, page + window); i++) show.add(i);
              const sorted = [...show].sort((a, b) => a - b);
              const pages = [];
              sorted.forEach((p, i) => {
                if (i > 0 && p - sorted[i - 1] > 1) pages.push('...' + p);
                pages.push(p);
              });
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <button onClick={() => goToPage(Math.max(1, page - 1))} disabled={page === 1} style={btnStyle(false, page === 1)}>←</button>
                  {pages.map((p, i) =>
                    typeof p === 'string'
                      ? <span key={p + i} style={{ padding: '0 0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>…</span>
                      : <button key={p} onClick={() => goToPage(p)} style={btnStyle(page === p, false)}>{p}</button>
                  )}
                  <button onClick={() => goToPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={btnStyle(false, page === totalPages)}>→</button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                    Page {page} of {totalPages} · {totalAll} total
                  </span>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Reject PIREP</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
              The pilot will see this note when they next log in.
            </p>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Flight not found in Infinite Flight logbook, incorrect aircraft type..."
              rows={4}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReject} style={{ padding: '0.6rem 1.25rem', background: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 700 }}>Reject PIREP</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PirepsManager;
