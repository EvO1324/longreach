/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { useNavigate } from 'react-router-dom';
import { staffApplications as staffApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import {
  Clock, CheckCircle, XCircle, Eye, Trash2, ChevronRight,
  Users, Plus, X, ExternalLink, ToggleLeft, ToggleRight, Briefcase,
} from 'lucide-react';

// Status config
const STATUS = {
  pending:   { color: '#b45309', bg: 'rgba(180,83,9,0.09)',   border: 'rgba(180,83,9,0.2)',   label: 'Pending',   Icon: Clock        },
  reviewing: { color: '#1d4ed8', bg: 'rgba(29,78,216,0.09)', border: 'rgba(29,78,216,0.2)',  label: 'Reviewing', Icon: Eye          },
  accepted:  { color: '#15803d', bg: 'rgba(21,128,61,0.09)', border: 'rgba(21,128,61,0.2)',  label: 'Accepted',  Icon: CheckCircle  },
  rejected:  { color: '#c62828', bg: 'rgba(198,40,40,0.09)', border: 'rgba(198,40,40,0.2)',  label: 'Rejected',  Icon: XCircle      },
};

function StatusBadge({ status, large }) {
  const s = STATUS[status] || STATUS.pending;
  const Icon = s.Icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: large ? 6 : 4,
      padding: large ? '0.35rem 0.75rem' : '0.2rem 0.55rem',
      borderRadius: 20, fontWeight: 700,
      fontSize: large ? '0.8rem' : '0.7rem',
      letterSpacing: '0.03em',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <Icon size={large ? 13 : 10} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

// Q&A renderer — handles JSON structured answers + legacy plain text
function ApplicationAnswers({ reason }) {
  if (!reason) return <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>No answers provided.</p>;

  let parsed = null;
  try {
    const p = JSON.parse(reason);
    if (Array.isArray(p) && p.length > 0 && p[0].question) parsed = p;
  } catch {}

  if (!parsed) {
    return (
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '10px',
        padding: '1rem 1.125rem', fontSize: '0.9rem',
        color: 'var(--text-primary)', lineHeight: 1.7,
        border: '1px solid var(--border-color)',
      }}>
        {reason}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {parsed.map((item, i) => (
        <div key={i} style={{
          borderRadius: '10px', overflow: 'hidden',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{
            padding: '0.6rem 1rem',
            background: 'var(--bg-hover)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.75rem', fontWeight: 700,
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--avg-green)', color: 'white',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 800, flexShrink: 0,
            }}>{i + 1}</span>
            {item.question}
          </div>
          <div style={{
            padding: '0.875rem 1rem', background: 'var(--bg-card)',
            fontSize: '0.875rem', color: 'var(--text-primary)',
            lineHeight: 1.7, whiteSpace: 'pre-wrap',
          }}>
            {item.answer?.trim() || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No answer</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Application detail modal
function AppModal({ app, onUpdate, onClose }) {
  const navigate = useNavigate();
  const [updating, setUpdating]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function setStatus(status) {
    if (app.status === status) return;
    setUpdating(true);
    try {
      await staffApi.updateApplication(app.id, { status });
      showToast(`Marked as ${STATUS[status].label}`, 'success');
      onUpdate(app.id, status);
    } catch { showToast('Failed to update status', 'error'); }
    finally { setUpdating(false); }
  }

  async function doDelete() {
    try {
      await staffApi.deleteApplication(app.id);
      showToast('Application deleted', 'success');
      onUpdate(app.id, null);
      onClose();
    } catch { showToast('Failed to delete', 'error'); }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px',
        width: '100%', maxWidth: '680px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'var(--avg-green-pale)', border: '1.5px solid rgba(var(--brand-primary-rgb),0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.9rem', color: 'var(--avg-green)',
          }}>
            {app.name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{app.name}</h3>
              <StatusBadge status={app.status} large />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Applied for <strong style={{ color: 'var(--text-primary)' }}>{app.position_title}</strong>
              {' · '}{new Date(app.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', padding: '0.25rem',
              display: 'flex', borderRadius: '6px', flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>

          {/* Info strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem', marginBottom: '1.5rem',
          }}>
            {[
              { label: 'IFC',      value: app.ifc_username     ? `@${app.ifc_username}`     : '—' },
              { label: 'Discord',  value: app.discord_username ? `@${app.discord_username}` : '—' },
              { label: 'VA Hours', value: app.linked_hours > 0 ? `${Math.floor(app.linked_hours)}h` : '—', accent: app.linked_hours > 0 },
              { label: 'Applied',  value: new Date(app.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{
                background: 'var(--bg-secondary)', borderRadius: '10px',
                padding: '0.75rem 1rem', border: '1px solid var(--border-color)',
              }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  {label}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent ? 'var(--avg-green)' : 'var(--text-primary)' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Crew centre link */}
          <div
            onClick={app.linked_user_id ? () => { onClose(); navigate(`/admin/pilot/${app.linked_user_id}`); } : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.5rem',
              background: app.linked_user_id ? 'rgba(21,128,61,0.07)' : 'var(--bg-secondary)',
              border: `1px solid ${app.linked_user_id ? 'rgba(21,128,61,0.2)' : 'var(--border-color)'}`,
              cursor: app.linked_user_id ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
            onMouseEnter={app.linked_user_id ? e => e.currentTarget.style.background = 'rgba(21,128,61,0.13)' : undefined}
            onMouseLeave={app.linked_user_id ? e => e.currentTarget.style.background = 'rgba(21,128,61,0.07)' : undefined}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: app.linked_user_id ? '#15803d' : 'var(--border-color)',
            }} />
            <span style={{
              flex: 1, fontSize: '0.875rem', fontWeight: 600,
              color: app.linked_user_id ? '#15803d' : 'var(--text-secondary)',
            }}>
              {app.linked_user_id
                ? `${app.linked_callsign} — Crew Centre member`
                : 'No matching Crew Centre account'}
            </span>
            {app.linked_user_id && <ExternalLink size={14} color="var(--text-secondary)" />}
          </div>

          {/* Answers */}
          <div>
            <div style={{
              fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.875rem',
            }}>
              Application answers
            </div>
            <ApplicationAnswers reason={app.reason} />
          </div>
        </div>

        <div style={{
          padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([key, s]) => {
              const isActive = app.status === key;
              const Icon = s.Icon;
              return (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  disabled={updating || isActive}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.45rem 0.875rem', borderRadius: '8px',
                    border: `1.5px solid ${isActive ? s.color : 'var(--border-color)'}`,
                    background: isActive ? s.bg : 'var(--bg-card)',
                    color: isActive ? s.color : 'var(--text-secondary)',
                    fontWeight: 600, fontSize: '0.8rem',
                    cursor: isActive ? 'default' : 'pointer',
                    opacity: updating ? 0.6 : 1,
                    transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={!isActive ? e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.color = s.color; } : undefined}
                  onMouseLeave={!isActive ? e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; } : undefined}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {s.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.45rem 0.875rem', borderRadius: '8px',
              background: 'transparent', border: '1.5px solid rgba(198,40,40,0.3)',
              color: '#c62828', fontWeight: 600, fontSize: '0.8rem',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(198,40,40,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete application from ${app.name}?`}
          message="This will permanently remove their staff application."
          confirmLabel="Delete"
          danger
          onConfirm={doDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// Positions manager
function PositionsManager() {
  const [positions, setPositions]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [newTitle, setNewTitle]           = useState('');
  const [newDesc, setNewDesc]             = useState('');
  const [adding, setAdding]               = useState(false);
  const [showAdd, setShowAdd]             = useState(false);
  const [toggling, setToggling]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    try { const d = await staffApi.positionsAll(); setPositions(d.positions || []); }
    catch { showToast('Failed to load positions', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addPosition() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await staffApi.createPosition({ title: newTitle.trim(), description: newDesc.trim() });
      setNewTitle(''); setNewDesc(''); setShowAdd(false);
      showToast('Position created', 'success');
      load();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setAdding(false); }
  }

  async function toggleOpen(pos) {
    setToggling(pos.id);
    try {
      await staffApi.updatePosition(pos.id, { open: !pos.open });
      showToast(pos.open ? 'Position closed' : 'Position opened', 'success');
      load();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setToggling(null); }
  }

  const open   = positions.filter(p => p.open);
  const closed = positions.filter(p => !p.open);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Manage Positions</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Open positions appear on the pilot-facing application form.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
        >
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? 'Cancel' : 'Add Position'}
        </button>
      </div>

      {showAdd && (
        <div style={{
          background: 'var(--bg-card)', border: '1.5px solid var(--avg-green)',
          borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Position title *
              </label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Recruitment Officer"
                onKeyDown={e => { if (e.key === 'Enter') addPosition(); }}
                style={{ width: '100%', padding: '0.65rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(shown on form)</span>
              </label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="e.g. Help review and interview new pilot applicants"
                style={{ width: '100%', padding: '0.65rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={addPosition}
                disabled={adding || !newTitle.trim()}
                className="btn btn-primary"
                style={{ fontSize: '0.875rem', opacity: (adding || !newTitle.trim()) ? 0.55 : 1 }}
              >
                {adding ? 'Creating…' : 'Create Position'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading…</div>
      ) : positions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          <Briefcase size={28} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No positions yet. Add one above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[...open, ...closed].map(pos => (
            <div key={pos.id} style={{
              background: 'var(--bg-card)', borderRadius: '12px',
              border: `1px solid ${pos.open ? 'rgba(21,128,61,0.25)' : 'var(--border-color)'}`,
              padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '1rem',
              opacity: pos.open ? 1 : 0.55, transition: 'opacity 0.2s',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: pos.description ? '0.2rem' : 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{pos.title}</span>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '0.15rem 0.5rem', borderRadius: '10px',
                    background: pos.open ? 'rgba(21,128,61,0.1)' : 'var(--bg-hover)',
                    color: pos.open ? '#15803d' : 'var(--text-secondary)',
                  }}>
                    {pos.open ? 'Open' : 'Closed'}
                  </span>
                </div>
                {pos.description && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{pos.description}</div>
                )}
              </div>
              <button
                onClick={() => toggleOpen(pos)}
                disabled={toggling === pos.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'none', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '0.4rem 0.875rem',
                  cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                  color: 'var(--text-secondary)', fontFamily: 'inherit',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.color = 'var(--avg-green)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                {toggling === pos.id ? '…'
                  : pos.open ? <><ToggleRight size={14} /> Close</>
                  : <><ToggleLeft  size={14} /> Open</>}
              </button>
              <button
                onClick={() => setConfirmDelete(pos)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', padding: '0.35rem',
                  borderRadius: '6px', display: 'flex', transition: 'color 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#c62828'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.title}"?`}
          message="This position will be permanently removed. Existing applications won't be affected."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try { await staffApi.deletePosition(confirmDelete.id); showToast('Position deleted', 'success'); load(); }
            catch (err) { showToast(err.message || 'Failed', 'error'); }
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Application list card
function AppCard({ app, onClick }) {
  const timeAgo = (() => {
    const ms = Date.now() - new Date(app.created).getTime();
    const d  = Math.floor(ms / 86400000);
    const h  = Math.floor(ms / 3600000);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return 'Just now';
  })();

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '1rem 1.25rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(var(--brand-primary-rgb),0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: 'var(--avg-green-pale)', border: '1.5px solid rgba(var(--brand-primary-rgb),0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.85rem', color: 'var(--avg-green)',
      }}>
        {app.name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{app.name}</span>
          <StatusBadge status={app.status} />
          {app.linked_callsign && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem',
              borderRadius: '10px', background: 'rgba(21,128,61,0.1)', color: '#15803d',
            }}>
              {app.linked_callsign}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{app.position_title}</span>
          {app.ifc_username && <><span>·</span><span>@{app.ifc_username}</span></>}
          {app.linked_hours > 0 && <><span>·</span><span style={{ color: 'var(--avg-green)', fontWeight: 600 }}>{Math.floor(app.linked_hours)}h</span></>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{timeAgo}</span>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
    </button>
  );
}

// Main
export default function StaffApplicationsManager() {
  const [tab, setTab]                   = useState('applications');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('all');
  const [selected, setSelected]         = useState(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const d = await staffApi.listApplications(params);
      setApplications(d.applications || []);
    } catch { showToast('Failed to load applications', 'error'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { if (tab === 'applications') loadApps(); }, [tab, loadApps]);

  const handleUpdate = useCallback((id, newStatus) => {
    if (newStatus === null) {
      setApplications(prev => prev.filter(a => a.id !== id));
      setSelected(prev => prev?.id === id ? null : prev);
    } else {
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      setSelected(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
    }
  }, []);

  const counts = {
    all:       applications.length,
    pending:   applications.filter(a => a.status === 'pending').length,
    reviewing: applications.filter(a => a.status === 'reviewing').length,
    accepted:  applications.filter(a => a.status === 'accepted').length,
    rejected:  applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div>
      <style>{`
        .sam-tabs {
          display: flex; gap: 0; margin-bottom: 1.75rem;
          border-bottom: 1px solid var(--border-color);
        }
        .sam-tab {
          padding: 0.6rem 1.1rem; border: none; background: none; cursor: pointer;
          font-family: inherit; font-size: 0.875rem; font-weight: 600;
          color: var(--text-secondary); border-bottom: 2px solid transparent;
          margin-bottom: -1px; transition: color 0.15s, border-color 0.15s;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .sam-tab:hover { color: var(--text-primary); }
        .sam-tab.active { color: var(--avg-green); border-bottom-color: var(--avg-green); }
        .sam-pill {
          padding: 0.3rem 0.875rem; border-radius: 20px;
          border: 1px solid var(--border-color); background: transparent;
          cursor: pointer; font-family: inherit; font-size: 0.8rem; font-weight: 600;
          color: var(--text-secondary); transition: all 0.15s;
          display: flex; align-items: center; gap: 0.35rem;
        }
        .sam-pill:hover { border-color: var(--avg-green); color: var(--avg-green); }
        .sam-pill.active { background: var(--avg-green); border-color: var(--avg-green); color: white; }
        .sam-pill-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 10px; padding: 0 4px;
          font-size: 0.65rem; font-weight: 800;
        }
        .sam-pill.active .sam-pill-count { background: rgba(255,255,255,0.25); color: white; }
        .sam-pill:not(.active) .sam-pill-count { background: var(--bg-hover); color: var(--text-secondary); }
      `}</style>

      {/* Tabs */}
      <div className="sam-tabs">
        <button
          className={`sam-tab${tab === 'applications' ? ' active' : ''}`}
          onClick={() => setTab('applications')}
        >
          <Users size={15} />
          Applications
          {counts.pending > 0 && (
            <span style={{
              background: '#b45309', color: 'white',
              fontSize: '0.6rem', fontWeight: 800,
              padding: '1px 6px', borderRadius: 10,
            }}>
              {counts.pending}
            </span>
          )}
        </button>
        <button
          className={`sam-tab${tab === 'positions' ? ' active' : ''}`}
          onClick={() => setTab('positions')}
        >
          <Briefcase size={15} />
          Positions
        </button>
      </div>

      {tab === 'positions' && <PositionsManager />}

      {tab === 'applications' && (
        <>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {['all', 'pending', 'reviewing', 'accepted', 'rejected'].map(f => (
              <button
                key={f}
                className={`sam-pill${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : STATUS[f]?.label ?? f}
                {counts[f] > 0 && <span className="sam-pill-count">{counts[f]}</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-secondary)', padding: '3rem', textAlign: 'center', fontSize: '0.875rem' }}>
              Loading…
            </div>
          ) : applications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)', border: '2px dashed var(--border-color)', borderRadius: '12px' }}>
              <Users size={32} style={{ marginBottom: '0.75rem', opacity: 0.35 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>
                No {filter !== 'all' ? STATUS[filter]?.label.toLowerCase() : ''} applications
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {applications.map(app => (
                <AppCard key={app.id} app={app} onClick={() => setSelected(app)} />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <AppModal
          app={selected}
          onUpdate={handleUpdate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
