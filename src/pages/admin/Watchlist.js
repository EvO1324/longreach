/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { watchlist as watchlistApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { Plus, Pencil, Trash2, X, AlertTriangle, Ban } from 'lucide-react';

const AVG_GREEN = 'var(--avg-green)';

const STATUS_META = {
  watchlist: { label: 'Watchlist', color: '#e65100', bg: 'rgba(230,81,0,0.08)', icon: <AlertTriangle size={11} strokeWidth={2.5} /> },
  blacklist: { label: 'Blacklist', color: '#c62828', bg: 'rgba(198,40,40,0.08)', icon: <Ban size={11} strokeWidth={2.5} /> },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.watchlist;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.7rem', fontWeight: 700, color: meta.color,
      padding: '0.2rem 0.55rem', borderRadius: '999px', background: meta.bg,
    }}>
      {meta.icon}{meta.label}
    </span>
  );
}

function EntryModal({ entry, onClose, onSaved }) {
  const isEdit = !!entry;
  const [ifcUsername, setIfcUsername] = useState(entry?.ifc_username || '');
  const [status, setStatus]           = useState(entry?.status || 'watchlist');
  const [reason, setReason]           = useState(entry?.reason || '');
  const [saving, setSaving]           = useState(false);

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.88rem',
    border: '1.5px solid var(--border-color)', borderRadius: '7px',
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontFamily: 'inherit', outline: 'none',
  };

  const save = async () => {
    if (!ifcUsername.trim()) { showToast('IFC username is required', 'error'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await watchlistApi.update(entry.id, { ifc_username: ifcUsername, status, reason });
        showToast('Entry updated.', 'success');
      } else {
        await watchlistApi.add({ ifc_username: ifcUsername, status, reason });
        showToast('Entry added.', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      showToast(err?.message || 'Failed to save entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '2rem 1rem', overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', width: '100%', maxWidth: '420px', boxShadow: '0 8px 40px var(--shadow-hover)', overflow: 'hidden', marginTop: '2rem', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{isEdit ? 'Edit Entry' : 'Add to Watchlist'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', display: 'flex', borderRadius: '6px' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ padding: '1.4rem' }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            IFC Username
          </label>
          <input value={ifcUsername} onChange={e => setIfcUsername(e.target.value)} placeholder="e.g. Skyler123" style={{ ...inputStyle, marginBottom: '1rem' }} autoFocus />

          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Status
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['watchlist', 'blacklist'].map(s => {
              const meta = STATUS_META[s];
              const active = status === s;
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  flex: 1, padding: '0.55rem', borderRadius: '7px', cursor: 'pointer',
                  border: `1.5px solid ${active ? meta.color : 'var(--border-color)'}`,
                  background: active ? meta.bg : 'transparent',
                  color: active ? meta.color : 'var(--text-secondary)',
                  fontWeight: 700, fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                }}>
                  {meta.icon}{meta.label}
                </button>
              );
            })}
          </div>

          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Reason (optional)
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this person flagged?" rows={3}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: '1.25rem' }} />

          <button onClick={save} disabled={saving} style={{
            width: '100%', padding: '0.65rem', borderRadius: '7px', border: 'none',
            background: AVG_GREEN, color: 'white', fontWeight: 700, fontSize: '0.86rem',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Watchlist() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [modalEntry, setModalEntry] = useState(undefined); // undefined = closed, null = add, object = edit
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await watchlistApi.list();
      setEntries(data.entries || []);
    } catch {
      showToast('Failed to load watchlist', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.ifc_username?.toLowerCase().includes(q) || e.reason?.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const doDelete = async () => {
    try {
      await watchlistApi.remove(pendingDelete.id);
      showToast('Entry removed.', 'success');
      setPendingDelete(null);
      load();
    } catch {
      showToast('Failed to remove entry', 'error');
    }
  };

  const blacklistCount = entries.filter(e => e.status === 'blacklist').length;
  const watchlistCount = entries.filter(e => e.status === 'watchlist').length;

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', boxShadow: '0 1px 3px var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Watchlist</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {entries.length} total · {watchlistCount} watchlisted · {blacklistCount} blacklisted
              </span>
            </div>
          </div>
          <button onClick={() => setModalEntry(null)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem',
            background: AVG_GREEN, color: 'white', border: 'none', borderRadius: '7px',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}>
            <Plus size={14} strokeWidth={2.5} /> Add Entry
          </button>
        </div>

        <div style={{ padding: '0.9rem 1.25rem 0' }}>
          <input
            type="text"
            placeholder="Search IFC username or reason..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 340, padding: '0.5rem 0.8rem', fontSize: '0.82rem', border: 'none', borderRadius: '7px', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ padding: '0.75rem 0 0.25rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.7 }}>
              {search ? `No entries matching "${search}"` : 'No one on the watchlist yet.'}
            </div>
          ) : filtered.map(entry => (
            <div key={entry.id} className="watchlist-row" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.65rem 1.25rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>@{entry.ifc_username}</span>
                  <StatusBadge status={entry.status} />
                </div>
                {entry.reason && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.reason}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {entry.added_by && `${entry.added_by} · `}
                {new Date(entry.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </div>
              <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                <button onClick={() => setModalEntry(entry)} title="Edit" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                  background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px',
                  cursor: 'pointer', color: 'var(--text-secondary)',
                }}>
                  <Pencil size={12} strokeWidth={2.5} />
                </button>
                <button onClick={() => setPendingDelete(entry)} title="Remove" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                  background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px',
                  cursor: 'pointer', color: '#c62828',
                }}>
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalEntry !== undefined && (
        <EntryModal entry={modalEntry} onClose={() => setModalEntry(undefined)} onSaved={load} />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Remove @${pendingDelete.ifc_username}?`}
          message="They will no longer be flagged during recruitment."
          confirmLabel="Remove"
          danger
          onConfirm={doDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}

      <style>{`
        .watchlist-row { box-shadow: inset 0 -1px 0 0 var(--border-color); transition: background 0.12s; }
        .watchlist-row:last-child { box-shadow: none; }
        .watchlist-row:hover { background: var(--bg-hover); }
      `}</style>
    </div>
  );
}

export default Watchlist;
