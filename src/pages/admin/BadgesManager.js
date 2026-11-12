/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useRef, useState } from 'react';
import { badges as badgesApi, pilots as pilotsApi, upload as uploadApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { BadgeIcon, badgeSummary, roleLabel, sortBadges } from '../../components/PilotBadge';
import { IF_ROLES } from '../../components/IFRoleBadges';
import { Pencil, Trash2, Plus, RefreshCw, Users, X } from 'lucide-react';

import brand from '../../brand';

const DEFAULT_HOUR_BADGES = [50, 100, 250, 500, 1000, 2000, 5000].map(h => ({
  type: 'hours',
  name: `${h.toLocaleString()} Hours`,
  hours_required: h,
  description: `Flown ${h.toLocaleString()} hours with ${brand.shortName}`,
}));
const DEFAULT_ROLE_BADGES = [
  { type: 'if_role', if_role_id: 64, name: 'IFATC',  description: 'Infinite Flight Air Traffic Control' },
  { type: 'if_role', if_role_id: 68, name: 'IFAET',  description: 'Infinite Flight Airport Editing Team' },
];

const ROLE_OPTIONS = Object.entries(IF_ROLES)
  .filter(([id]) => ![41, 43, 53].includes(Number(id)))
  .map(([id, r]) => ({ id: Number(id), label: r.label }));

// Founding members (an event badge staff can award)
const LEGACY_BADGE = {
  type: 'event',
  name: 'Legacy Pilot',
  description: 'A founding member of the VA',
};

const nameOf = p => `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.callsign || 'Pilot';
const fmtEarned = d => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Who has a badge, plus giving it to (or taking it from) pilots manually
function HoldersPanel({ badge }) {
  const [holders, setHolders] = useState(null);
  const [pilots, setPilots] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState(null);
  const load = () => badgesApi.holders(badge.id).then(d => { setHolders(d.holders || []); setLoadError(null); }).catch(err => setLoadError(err.message));
  useEffect(() => {
    load();
    pilotsApi.list().then(d => setPilots(d.pilots || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge.id]);

  const has = new Set((holders || []).map(h => h.id));
  const q = query.trim().toLowerCase();
  const matches = q
    ? pilots.filter(p => !has.has(p.id) && `${nameOf(p)} ${p.callsign || ''} ${p.ifc_username || ''}`.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const legacyWithout = pilots.filter(p => p.has_imported_history && !has.has(p.id));

  const award = async (list) => {
    setBusy(true);
    let done = 0;
    for (const p of list) {
      try { await badgesApi.award(badge.id, p.id); done++; } catch (err) { showToast(err.message, 'error'); }
    }
    if (done) showToast(done === 1 ? `Awarded to ${nameOf(list[0])}` : `Awarded to ${done} pilots`, 'success');
    setQuery('');
    await load();
    setBusy(false);
  };

  const remove = async (h) => {
    setBusy(true);
    try {
      await badgesApi.unaward(badge.id, h.id);
      showToast(`Removed from ${h.name}`, 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setBusy(false);
  };

  const chip = { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.4rem 0.3rem 0.65rem', borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-hover)', fontSize: '0.8rem' };
  return (
    <div style={{ padding: '1rem 1.25rem 1.1rem', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Award to a pilot: name, callsign or IFC username"
            disabled={busy} style={{ width: '100%', boxSizing: 'border-box' }} />
          {matches.length > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 5, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 8px 24px var(--shadow)', overflow: 'hidden' }}>
              {matches.map(p => (
                <button key={p.id} type="button" onClick={() => award([p])} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.55rem 0.75rem', border: 'none', background: 'none', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                  <span>{nameOf(p)}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{p.callsign}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {legacyWithout.length > 0 && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => award(legacyWithout)} style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem' }}>
            Award to all legacy pilots ({legacyWithout.length})
          </button>
        )}
      </div>
      {loadError ? (
        <div style={{ fontSize: '0.85rem', color: '#c62828' }}>Couldn't load who has this badge: {loadError}</div>
      ) : holders === null ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : holders.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No pilots have this badge yet.</div>
      ) : (
        <>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {holders.length} pilot{holders.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {holders.map(h => (
              <span key={h.id} style={chip} title={h.earned_at ? `Since ${fmtEarned(h.earned_at)}` : undefined}>
                {h.name}{h.callsign && <span style={{ color: 'var(--text-secondary)' }}>{h.callsign}</span>}
                <button type="button" onClick={() => remove(h)} disabled={busy} aria-label={`Remove from ${h.name}`}
                  style={{ display: 'flex', padding: 2, border: 'none', borderRadius: '50%', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const EMPTY_FORM = { type: 'hours', name: '', hours_required: '', if_role_id: 64, description: '' };
const labelStyle = { display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' };

export default function BadgesManager() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDefaults, setConfirmDefaults] = useState(null); // list of badges to create
  const [syncing, setSyncing] = useState(false);
  const [openHolders, setOpenHolders] = useState(null); // badge id
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const d = await badgesApi.list();
      setBadges(d.badges || []);
      setSetupError(null);
    } catch (err) {
      setSetupError(err.status === 503 ? err.message : null);
      if (err.status !== 503) showToast('Failed to load badges', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null); setForm(EMPTY_FORM); setImageFile(null); setImagePreview(null); setShowForm(true);
  };
  const openEdit = (badge) => {
    setEditing(badge);
    setForm({ type: badge.type || 'hours', name: badge.name, hours_required: badge.hours_required, if_role_id: badge.if_role_id || 64, description: badge.description || '' });
    setImageFile(null); setImagePreview(badge.image_url || null); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async () => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
    const safeName = `${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.${imageFile.name.split('.').pop()}`;
    const result = await uploadApi.fleetImage(safeName, base64, 'badges');
    return result.url;
  };

  const awardedToast = (verb, awarded) => {
    showToast(awarded ? `Badge ${verb} — awarded to ${awarded} pilot${awarded === 1 ? '' : 's'}` : `Badge ${verb}`, 'success');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let imageUrl = imagePreview && !imageFile ? imagePreview : '';
      if (imageFile) {
        try { imageUrl = await uploadImage(); } catch { showToast('Image upload failed — saved without it', 'error'); imageUrl = editing?.image_url || ''; }
      }
      const payload = {
        type: form.type,
        name: form.name.trim(),
        description: form.description.trim(),
        image_url: imageUrl,
        ...(form.type === 'event' ? {} : form.type === 'if_role' ? { if_role_id: Number(form.if_role_id) } : { hours_required: parseFloat(form.hours_required) }),
      };
      if (editing) {
        const d = await badgesApi.update(editing.id, payload);
        awardedToast('updated', d.awarded);
      } else {
        const d = await badgesApi.create(payload);
        awardedToast('created', d.awarded);
      }
      closeForm();
      load();
    } catch (err) {
      showToast(err.message || 'Failed to save badge', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (badge) => {
    try {
      await badgesApi.delete(badge.id);
      showToast('Badge deleted', 'success');
      setConfirmDelete(null);
      load();
    } catch (err) {
      showToast('Failed to delete badge', 'error');
    }
  };

  const doDefaults = async (list) => {
    setConfirmDefaults(null);
    setSaving(true);
    let awarded = 0;
    try {
      for (const b of list) awarded += (await badgesApi.create(b)).awarded || 0;
      showToast(`Badges created — ${awarded} awards to existing pilots`, 'success');
      load();
    } catch (err) {
      showToast('Failed to create default badges: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Creates the Legacy Pilot badge and opens its pilots list, ready to award
  const addLegacy = async () => {
    setSaving(true);
    try {
      const { badge } = await badgesApi.create(LEGACY_BADGE);
      showToast('Legacy Pilot badge created. Award it from the list below.', 'success');
      await load();
      setOpenHolders(badge.id);
    } catch (err) {
      showToast('Failed to create the badge: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncRoles = async () => {
    setSyncing(true);
    try {
      const r = await badgesApi.syncRoles();
      showToast(`Checked ${r.checked} pilots — ${r.granted} granted, ${r.removed} removed`, 'success');
    } catch (err) {
      showToast('Role sync failed: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const sorted = sortBadges(badges);
  const hasRoleBadges = badges.some(b => b.type === 'if_role');
  const missingRoleDefaults = DEFAULT_ROLE_BADGES.filter(d => !badges.some(b => b.type === 'if_role' && b.if_role_id === d.if_role_id));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Badge Management</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Awarded automatically for flight hours or IF community roles, or manually assigned. New automatic badges go to every pilot who already qualifies.
          </p>
        </div>
        {!setupError && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {badges.length === 0 && !loading && (
              <button onClick={() => setConfirmDefaults([...DEFAULT_HOUR_BADGES, ...DEFAULT_ROLE_BADGES])} disabled={saving} className="btn btn-secondary" style={{ padding: '0.6rem 1.1rem', fontSize: '0.875rem' }}>
                {saving ? 'Creating...' : 'Use Default Badges'}
              </button>
            )}
            {badges.length > 0 && missingRoleDefaults.length > 0 && (
              <button onClick={() => setConfirmDefaults(missingRoleDefaults)} disabled={saving} className="btn btn-secondary" style={{ padding: '0.6rem 1.1rem', fontSize: '0.875rem' }}>
                {saving ? 'Creating...' : `Add ${missingRoleDefaults.map(b => b.name).join(' & ')} badges`}
              </button>
            )}
            {hasRoleBadges && (
              <button onClick={syncRoles} disabled={syncing} className="btn btn-secondary" title="Re-check every pilot's IF roles now (also runs daily)" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem', fontSize: '0.875rem' }}>
                <RefreshCw size={14} /> {syncing ? 'Syncing roles...' : 'Sync IF roles'}
              </button>
            )}
            {badges.length > 0 && !badges.some(b => b.name === LEGACY_BADGE.name) && (
              <button onClick={addLegacy} disabled={saving} className="btn btn-secondary" style={{ padding: '0.6rem 1.1rem', fontSize: '0.875rem' }}>
                {saving ? 'Creating...' : 'Add Legacy Pilot badge'}
              </button>
            )}
            <button onClick={openAdd} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>
              <Plus size={15} strokeWidth={2.5} /> Add Badge
            </button>
          </div>
        )}
      </div>

      {setupError && (
        <div className="card" style={{ borderLeft: '4px solid var(--avg-gold)', borderRadius: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Badges aren't set up yet</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Run <code>npm run setup</code> and tick "Create the database collections" on the Database step.
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 4px 12px var(--shadow)' }}>
          <h4 style={{ margin: '0 0 1.25rem', fontWeight: 700 }}>{editing ? 'Edit Badge' : 'Add New Badge'}</h4>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>Earned For</label>
                {editing?.type === 'event' ? (
                  <div style={{ padding: '0.55rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Manually assigned</div>
                ) : (
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: '100%', boxSizing: 'border-box' }}>
                    <option value="hours">Flight hours</option>
                    <option value="if_role">IF community role</option>
                    <option value="event">Manually assigned</option>
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Badge Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={form.type === 'if_role' ? 'e.g. IFATC' : 'e.g. 500 Hours'} required style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              {form.type === 'event' ? null : form.type === 'if_role' ? (
                <div>
                  <label style={labelStyle}>IF Role</label>
                  <select value={form.if_role_id} onChange={e => setForm({ ...form, if_role_id: Number(e.target.value) })} style={{ width: '100%', boxSizing: 'border-box' }}>
                    {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Hours Required</label>
                  <input type="number" min="0" step="1" value={form.hours_required} onChange={e => setForm({ ...form, hours_required: e.target.value })} placeholder="e.g. 500" required style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
            {form.type === 'event' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.25rem 0 1rem' }}>
                Nobody gets this automatically. Give it to pilots with the pilots button once it's created.
              </p>
            )}
            {form.type === 'if_role' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.25rem 0 1rem' }}>
                Pilots get this while they hold the role on the IF Community (checked on /verify and daily), and lose it if they leave.
              </p>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional, shown in the unlock popup)</span></label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={`e.g. Flown 500 hours with ${brand.shortName}`} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Badge Image <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional, a plain hours medal is shown without one)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <BadgeIcon badge={{ name: form.name || 'Preview', type: form.type, hours_required: form.hours_required || 0, if_role_id: form.if_role_id, image_url: imagePreview }} size={48} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: '0.5rem 1rem', border: '1.5px dashed var(--border-color)', borderRadius: 8, background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                  {imagePreview ? 'Change Image' : '+ Upload Image'}
                </button>
                {imagePreview && (
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>
                {saving ? 'Saving...' : editing ? 'Update Badge' : 'Create Badge'}
              </button>
              <button type="button" onClick={closeForm} className="btn btn-secondary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>Loading badges...</div>
      ) : !setupError && sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No badges yet</div>
          <div style={{ fontSize: '0.875rem' }}>Add one above, or use the defaults: 50, 100, 250, 500, 1,000, 2,000 and 5,000 hours, plus IFATC and IFAET.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sorted.map(badge => (
            <div key={badge.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 1.25rem' }}>
              <BadgeIcon badge={badge} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{badge.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {badge.type === 'event' ? 'Manually assigned' : badge.type === 'if_role' ? `${roleLabel(badge.if_role_id)} role` : badgeSummary(badge)}{badge.description ? ` — ${badge.description}` : ''}
                </div>
              </div>
              <button onClick={() => setOpenHolders(openHolders === badge.id ? null : badge.id)} className="btn btn-secondary" title="Pilots with this badge"
                style={{ padding: '0.4rem 0.6rem', ...(openHolders === badge.id ? { borderColor: 'var(--avg-green)', color: 'var(--avg-green)' } : {}) }}><Users size={15} /></button>
              <button onClick={() => openEdit(badge)} className="btn btn-secondary" title="Edit" style={{ padding: '0.4rem 0.6rem' }}><Pencil size={15} /></button>
              <button onClick={() => setConfirmDelete(badge)} className="btn btn-secondary" title="Delete" style={{ padding: '0.4rem 0.6rem' }}><Trash2 size={15} /></button>
            </div>
            {openHolders === badge.id && <HoldersPanel badge={badge} />}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          message="This badge will be removed from every pilot who has earned it. This can't be undone."
          confirmLabel="Delete Badge"
          danger
          onConfirm={() => doDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmDefaults && (
        <ConfirmModal
          title={`Create ${confirmDefaults.length} badge${confirmDefaults.length === 1 ? '' : 's'}?`}
          message={`Creates ${confirmDefaults.map(b => b.name).join(', ')} and awards them to every pilot who already qualifies${confirmDefaults.some(b => b.type === 'if_role') ? ' (IF roles are looked up for every pilot with an IFC username, which takes a moment)' : ''}. Pilots see a one-time popup on their dashboard — nothing is posted to Discord.`}
          confirmLabel="Create Badges"
          onConfirm={() => doDefaults(confirmDefaults)}
          onClose={() => setConfirmDefaults(null)}
        />
      )}
    </div>
  );
}
