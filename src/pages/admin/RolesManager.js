/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { roles as rolesApi } from '../../api/client';
import { showToast } from '../../components/Toast';

const PERMISSION_GROUPS = [
  { label: 'PIREPs',      perms: ['pireps.view', 'pireps.approve', 'pireps.reject'] },
  { label: 'Recruitment', perms: ['recruitment.view', 'recruitment.manage'] },
  { label: 'Pilots',      perms: ['pilots.view', 'pilots.edit', 'pilots.view_email', 'pilots.edit_email'] },
  { label: 'Leave',       perms: ['leave.manage'] },
  { label: 'Fleet',       perms: ['fleet.manage'] },
  { label: 'Routes',      perms: ['routes.manage'] },
  { label: 'Ranks',       perms: ['ranks.manage'] },
  { label: 'Settings',    perms: ['settings.manage', 'settings.edit'] },
  { label: 'Roles',       perms: ['roles.manage'] },
  { label: 'NOTAMs',      perms: ['notams.manage'] },
  { label: 'Events',      perms: ['events.manage'] },
  { label: 'Audit Log',   perms: ['audit.view'] },
];

const PERM_LABELS = {
  'pireps.view': 'View PIREPs',           'pireps.approve': 'Approve PIREPs',     'pireps.reject': 'Reject PIREPs',
  'recruitment.view': 'View Pipeline',    'recruitment.manage': 'Manage Pipeline',
  'pilots.view': 'View Pilots',           'pilots.edit': 'Edit Pilots',           'pilots.view_email': 'View Pilot Emails', 'pilots.edit_email': 'Edit Pilot Emails',
  'leave.manage': 'Manage Leave Requests',
  'fleet.manage': 'Manage Fleet',         'routes.manage': 'Manage Routes',
  'ranks.manage': 'Manage Ranks',         'settings.manage': 'Manage Settings',   'settings.edit': 'Edit Settings',
  'roles.manage': 'Manage Roles',         'notams.manage': 'Manage NOTAMs',
  'audit.view': 'View Audit Log',
};

const COLORS = ['var(--avg-green)','#1976d2','#7b1fa2','#2e7d32','#e65100','#00838f','#c62828','#4527a0','#558b2f','#6e6e6e'];

function RoleModal({ role, onSave, onClose }) {
  const [name, setName] = useState(role?.name || '');
  const [color, setColor] = useState(role?.color || COLORS[0]);
  const [permissions, setPermissions] = useState(() => {
    if (!role?.permissions) return [];
    if (Array.isArray(role.permissions)) return role.permissions;
    try { return JSON.parse(role.permissions); } catch { return []; }
  });
  const [saving, setSaving] = useState(false);
  

  const toggle = (perm) => setPermissions(prev =>
    prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
  );

  const handleSave = async () => {
    if (!name.trim()) return showToast('Role name required', 'error');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, permissions });
      onClose();
    } catch (e) {
      showToast('Failed to save role', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem' }}>{role ? 'Edit Role' : 'Create Role'}</h3>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>ROLE NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Recruitment Officer"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.95rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>COLOUR</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer', flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.75rem' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>PERMISSIONS</label>
          {PERMISSION_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{group.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {group.perms.map(perm => {
                  const active = permissions.includes(perm);
                  return (
                    <button key={perm} onClick={() => toggle(perm)} style={{
                      padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                      background: active ? color : 'var(--bg-primary)',
                      color: active ? 'white' : 'var(--text-secondary)',
                      border: `1px solid ${active ? color : 'var(--border-color)'}`,
                    }}>
                      {PERM_LABELS[perm]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.25rem', background: 'var(--avg-green)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 700 }}>
            {saving ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesManager() {
  const [rolesList, setRolesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | role object
  const [deleting, setDeleting] = useState(null);
  

  const load = useCallback(async () => {
    try {
      const data = await rolesApi.list();
      setRolesList(data.roles || []);
    } catch (e) {
      showToast('Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    if (modal === 'create') {
      await rolesApi.create(data);
      showToast('Role created', 'success');
    } else {
      await rolesApi.update(modal.id, data);
      showToast('Role updated', 'success');
    }
    load();
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await rolesApi.delete(id);
      showToast('Role deleted', 'success');
      load();
    } catch {
      showToast('Failed to delete role', 'error');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Staff Roles</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Create roles and assign permissions to staff members.
          </p>
        </div>
        <button onClick={() => setModal('create')} style={{
          padding: '0.6rem 1.25rem', background: 'var(--avg-green)', color: 'white',
          border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
        }}>
          + New Role
        </button>
      </div>

      {rolesList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎖️</div>
          <p style={{ margin: 0 }}>No staff roles yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {rolesList.map(role => {
            const perms = Array.isArray(role.permissions) ? role.permissions : [];
            return (
              <div key={role.id} style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--border-color)' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: role.color || '#6e6e6e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>{role.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {perms.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No permissions</span>
                    ) : perms.map(p => (
                      <span key={p} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '10px', background: `${role.color}20`, color: role.color, fontWeight: 600 }}>
                        {PERM_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button onClick={() => setModal(role)} style={{ padding: '0.45rem 0.9rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Edit</button>
                  <button onClick={() => handleDelete(role.id)} disabled={deleting === role.id} style={{ padding: '0.45rem 0.9rem', background: 'transparent', border: '1px solid #c62828', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#c62828' }}>
                    {deleting === role.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <RoleModal
          role={modal === 'create' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default RolesManager;
