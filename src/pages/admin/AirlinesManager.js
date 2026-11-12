/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { airlines as airlinesApi, upload } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';

function AirlinesManager() {
  const [airlines, setAirlines]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editingId, setEditingId]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // New airline form
  const [newCode, setNewCode]         = useState('');
  const [newName, setNewName]         = useState('');
  const [newLogoUrl, setNewLogoUrl]   = useState('');
  const [adding, setAdding]           = useState(false);
  const [uploading, setUploading]     = useState(false);

  // Edit state
  const [editCode, setEditCode]       = useState('');
  const [editName, setEditName]       = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);
  const [saving, setSaving]           = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await airlinesApi.list();
      setAirlines(data.airlines || []);
    } catch {
      showToast('Failed to load airlines', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadLogo = async (file, onSuccess, setUploadingState) => {
    setUploadingState(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const filename = file.name.replace(/\s+/g, '-').toLowerCase();
      try {
        const d = await upload.airlineLogo(filename, base64);
        onSuccess(d.url);
        showToast('Logo uploaded!', 'success');
      } catch {
        showToast('Upload failed', 'error');
      } finally {
        setUploadingState(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async () => {
    if (!newCode.trim() || !newName.trim()) {
      showToast('Code and name are required', 'error');
      return;
    }
    try {
      setAdding(true);
      await airlinesApi.create({ code: newCode, name: newName, logo_url: newLogoUrl });
      showToast('Airline added', 'success');
      setNewCode(''); setNewName(''); setNewLogoUrl('');
      load();
    } catch {
      showToast('Failed to add airline', 'error');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (airline) => {
    setEditingId(airline.id);
    setEditCode(airline.code);
    setEditName(airline.name);
    setEditLogoUrl(airline.logo_url || '');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await airlinesApi.update(editingId, { code: editCode, name: editName, logo_url: editLogoUrl });
      showToast('Saved', 'success');
      setEditingId(null);
      load();
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await airlinesApi.delete(confirmDelete.id);
      showToast('Airline deleted', 'success');
      setConfirmDelete(null);
      load();
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  const inp = {
    padding: '0.55rem 0.75rem', border: '1px solid var(--border-color)',
    borderRadius: '7px', fontSize: '0.875rem', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete Airline"
          message={`Delete ${confirmDelete.code} — ${confirmDelete.name}? This won't affect existing routes, but the logo will no longer appear.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      <h3 style={{ marginBottom: '1.5rem' }}>Airlines</h3>

      {/* Add new */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <h4 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 700 }}>Add Airline</h4>
        <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>IATA Code *</label>
            <input style={inp} value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase().slice(0, 3))} placeholder="QF" maxLength={3} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Airline Name *</label>
            <input style={inp} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Airline name" />
          </div>
        </div>
        <div style={{ marginBottom: '0.875rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Logo</label>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.75rem', background: 'var(--bg-hover)', border: '1.5px dashed var(--border-color)',
            borderRadius: '8px', cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', fontWeight: 600, opacity: uploading ? 0.6 : 1, marginBottom: '0.5rem',
          }}>
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files[0];
                if (!f) return;
                await uploadLogo(f, setNewLogoUrl, setUploading);
              }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            {uploading ? 'Uploading…' : newLogoUrl ? 'Replace Logo' : 'Choose File'}
          </label>
          {newLogoUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '7px', border: '1px solid var(--border-color)' }}>
              <img src={newLogoUrl} alt="preview" style={{ width: 40, height: 40, objectFit: 'contain', background: 'white', borderRadius: 4, padding: 2, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
              <span style={{ fontSize: '0.78rem', color: 'var(--avg-green)', fontWeight: 600 }}>✓ Logo uploaded</span>
              <button type="button" onClick={() => setNewLogoUrl('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1 }}>×</button>
            </div>
          )}
        </div>
        <button onClick={handleAdd} disabled={adding} style={{
          padding: '0.55rem 1.25rem', background: 'var(--avg-green)', color: 'white',
          border: 'none', borderRadius: '7px', cursor: adding ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: '0.875rem', opacity: adding ? 0.6 : 1,
        }}>
          {adding ? 'Adding…' : 'Add Airline'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : airlines.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No airlines yet. Add one above.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {airlines.map((airline, i) => (
            <div key={airline.id} style={{
              borderBottom: i < airlines.length - 1 ? '1px solid var(--border-color)' : 'none',
              padding: '0.875rem 1rem',
            }}>
              {editingId === airline.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Code</label>
                      <input style={inp} value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Name</label>
                      <input style={inp} value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Logo</label>
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      padding: '0.6rem', background: 'var(--bg-hover)', border: '1.5px dashed var(--border-color)',
                      borderRadius: '7px', cursor: editUploading ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600, opacity: editUploading ? 0.6 : 1, marginBottom: '0.4rem',
                    }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={editUploading}
                        onChange={async (e) => {
                          const f = e.target.files[0];
                          if (!f) return;
                          await uploadLogo(f, setEditLogoUrl, setEditUploading);
                        }} />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                      {editUploading ? 'Uploading…' : editLogoUrl ? 'Replace Logo' : 'Choose File'}
                    </label>
                    {editLogoUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '7px', border: '1px solid var(--border-color)' }}>
                        <img src={editLogoUrl} alt="preview" style={{ width: 36, height: 36, objectFit: 'contain', background: 'white', borderRadius: 4, padding: 2, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--avg-green)', fontWeight: 600 }}>✓ Logo ready</span>
                        <button type="button" onClick={() => setEditLogoUrl('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1 }}>×</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleSave} disabled={saving} style={{
                      padding: '0.45rem 1rem', background: 'var(--avg-green)', color: 'white',
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                    }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{
                      padding: '0.45rem 1rem', background: 'transparent', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Logo */}
                  <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRadius: 8, border: '1px solid var(--border-color)', padding: 4 }}>
                    {airline.logo_url
                      ? <img src={airline.logo_url} alt={airline.code} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
                      : <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)' }}>No logo</span>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{airline.code}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{airline.name}</div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={() => startEdit(airline)} style={{
                      padding: '0.35rem 0.875rem', background: 'transparent', border: '1px solid var(--border-color)',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)',
                    }}>Edit</button>
                    <button onClick={() => setConfirmDelete(airline)} style={{
                      padding: '0.35rem 0.875rem', background: 'transparent', border: '1px solid rgba(198,40,40,0.3)',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#c62828',
                    }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AirlinesManager;
