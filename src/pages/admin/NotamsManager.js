/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { notams as notamsApi } from '../../api/client';
import { showToast } from '../../components/Toast';

const NOTAM_TYPES = [
  { value: 'info',    label: 'Info',    color: '#1976d2', bg: 'rgba(25,118,210,0.08)' },
  { value: 'warning', label: 'Warning', color: '#e65100', bg: 'rgba(230,81,0,0.08)' },
  { value: 'success', label: 'Success', color: '#2e7d32', bg: 'rgba(46,125,50,0.08)' },
  { value: 'critical',label: 'Critical',color: '#c62828', bg: 'rgba(198,40,40,0.08)' },
];

function NotamModal({ notam, onSave, onClose }) {
  const [title, setTitle]       = useState(notam?.title || '');
  const [body, setBody]         = useState(notam?.body || '');
  const [type, setType]         = useState(notam?.type || 'info');
  const [active, setActive]     = useState(notam?.active !== false);
  const [expiresAt, setExpiresAt] = useState(
    notam?.expires_at ? notam.expires_at.slice(0, 16) : ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return showToast('Title required', 'error');
    if (!body.trim())  return showToast('Body required', 'error');
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim(), type, active, expires_at: expiresAt ? new Date(expiresAt).toISOString() : '' });
      onClose();
    } catch (err) {
      showToast('Failed to save NOTAM', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem' }}>{notam ? 'Edit NOTAM' : 'Post NOTAM'}</h3>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Type</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {NOTAM_TYPES.map(t => (
              <button key={t.value} onClick={() => setType(t.value)} style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', border: `1px solid ${type === t.value ? t.color : 'var(--border-color)'}`, background: type === t.value ? t.bg : 'transparent', color: type === t.value ? t.color : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Scheduled Maintenance" style={inputStyle} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Details visible to all pilots on their dashboard…" rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Expires At (optional)</label>
          <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Leave blank to show indefinitely until manually deactivated.</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <input type="checkbox" id="notam-active" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="notam-active" style={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Active (visible to pilots)</label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.25rem', background: 'var(--avg-green)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 700 }}>
            {saving ? 'Posting…' : notam ? 'Save Changes' : 'Post NOTAM'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotamsManager() {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await notamsApi.listAll();
      setList(data.notams || []);
    } catch (err) {
      showToast('Failed to load NOTAMs', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    if (modal === 'create') {
      await notamsApi.create(data);
      showToast('NOTAM posted', 'success');
    } else {
      await notamsApi.update(modal.id, data);
      showToast('NOTAM updated', 'success');
    }
    load();
  };

  const handleToggle = async (notam) => {
    setToggling(notam.id);
    try {
      await notamsApi.update(notam.id, { active: !notam.active });
      showToast(notam.active ? 'NOTAM deactivated' : 'NOTAM activated', 'success');
      load();
    } catch (err) {
      showToast('Failed to update', 'error');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await notamsApi.delete(id);
      showToast('NOTAM deleted', 'success');
      load();
    } catch (err) {
      showToast('Failed to delete', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const typeStyle = (type) => NOTAM_TYPES.find(t => t.value === type) || NOTAM_TYPES[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>NOTAMs</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Post notices visible to all pilots on their dashboard.
          </p>
        </div>
        <button onClick={() => setModal('create')} style={{ padding: '0.6rem 1.25rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
          + Post NOTAM
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📋</div>
          <p style={{ margin: 0 }}>No NOTAMs yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {list.map(n => {
            const ts = typeStyle(n.type);
            const expired = n.expires_at && new Date(n.expires_at) < new Date();
            return (
              <div key={n.id} style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid var(--border-color)', borderLeft: `4px solid ${n.active && !expired ? ts.color : 'var(--border-color)'}`, opacity: (!n.active || expired) ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '10px', background: ts.bg, color: ts.color }}>{ts.label.toUpperCase()}</span>
                      {!n.active && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>INACTIVE</span>}
                      {expired && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>EXPIRED</span>}
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{n.title}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', lineHeight: 1.5 }}>{n.body}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Posted {new Date(n.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {n.expires_at && ` · Expires ${new Date(n.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={() => handleToggle(n)} disabled={toggling === n.id} style={{ padding: '0.4rem 0.8rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                      {toggling === n.id ? '…' : n.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => setModal(n)} style={{ padding: '0.4rem 0.8rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Edit</button>
                    <button onClick={() => handleDelete(n.id)} disabled={deleting === n.id} style={{ padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid #c62828', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#c62828' }}>
                      {deleting === n.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <NotamModal
          notam={modal === 'create' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default NotamsManager;
