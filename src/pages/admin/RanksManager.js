/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ranks as ranksApi, fleet as fleetApi } from '../../api/client';
import { upload as uploadApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { Plane, Pencil, Trash2, Plus } from 'lucide-react';
import { normaliseType } from '../../utils/rankAccess';

const DEFAULT_RANKS = [
  { name: 'Student Pilot',        hours_required: 0,    order_position: 1 },
  { name: 'Second Officer',       hours_required: 25,   order_position: 2 },
  { name: 'First Officer',        hours_required: 75,   order_position: 3 },
  { name: 'Senior First Officer', hours_required: 150,  order_position: 4 },
  { name: 'Captain',              hours_required: 300,  order_position: 5 },
  { name: 'Senior Captain',       hours_required: 500,  order_position: 6 },
  { name: 'Chief Pilot',          hours_required: 1000, order_position: 7 },
];

const RANK_COLOURS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#E40000', '#1a1a2e',
];

function getRankColour(orderPosition) {
  return RANK_COLOURS[Math.min(orderPosition - 1, RANK_COLOURS.length - 1)] || '#6b7280';
}

// Extract unique aircraft types from fleet records
function getAircraftTypes(fleet) {
  const types = new Set(fleet.map(f => f.name.split(' - ')[0]));
  return [...types].sort();
}

function RanksManager() {
  const [ranks, setRanks] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRank, setEditingRank] = useState(null);
  const [form, setForm] = useState({ name: '', hours_required: '', order_position: '', pirep_multiplier: '', unlocks_codeshares: false });
  const [badgeFile, setBadgeFile]   = useState(null);
  const [badgePreview, setBadgePreview] = useState(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const badgeInputRef = React.useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmSeed, setConfirmSeed] = useState(false);

  // Aircraft restriction editing
  const [editingRestrictionsFor, setEditingRestrictionsFor] = useState(null); // rank id
  const [restrictionDraft, setRestrictionDraft] = useState([]); // array of type strings

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    try {
      setLoading(true);
      const [ranksData, fleetData] = await Promise.all([
        ranksApi.list(),
        fleetApi.list(),
      ]);
      setRanks(ranksData.ranks || []);
      // Fleet API returns grouped [{ type, liveries }]; flatten for getAircraftTypes
      const flat = (fleetData.fleet || []).flatMap(g => g.liveries.map(l => ({ ...l, _type: g.type })));
      setFleet(flat);
    } catch (err) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Rank CRUD
  const openAddForm = () => {
    setEditingRank(null);
    const nextOrder = ranks.length > 0 ? Math.max(...ranks.map(r => r.order_position)) + 1 : 1;
    setForm({ name: '', hours_required: '', order_position: nextOrder });
    setShowForm(true);
  };

  const openEditForm = (rank) => {
    setEditingRank(rank);
    setForm({ name: rank.name, hours_required: rank.hours_required, order_position: rank.order_position, pirep_multiplier: rank.pirep_multiplier || '', unlocks_codeshares: rank.unlocks_codeshares === true });
    setBadgeFile(null);
    setBadgePreview(rank.badge_url || null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRank(null);
    setForm({ name: '', hours_required: '', order_position: '', pirep_multiplier: '', unlocks_codeshares: false });
    setBadgeFile(null);
    setBadgePreview(null);
  };

  const handleBadgePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBadgeFile(file);
    const reader = new FileReader();
    reader.onload = () => setBadgePreview(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.hours_required === '') {
      showToast('Please fill in all fields', 'error');
      return;
    }
    try {
      setSaving(true);
      // Upload badge if a new file was selected
      let badgeUrl = editingRank?.badge_url || null;
      if (badgeFile) {
        setUploadingBadge(true);
        try {
          const base64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result.split(',')[1]);
            reader.onerror = rej;
            reader.readAsDataURL(badgeFile);
          });
          const safeName = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-badge.' + badgeFile.name.split('.').pop();
          const result = await uploadApi.rankBadge(safeName, base64);
          badgeUrl = result.url;
        } catch {
          showToast('Badge upload failed', 'error');
        } finally {
          setUploadingBadge(false);
        }
      }

      const payload = {
        name: form.name.trim(),
        hours_required: parseFloat(form.hours_required),
        order_position: parseInt(form.order_position) || 1,
        pirep_multiplier: form.pirep_multiplier ? parseFloat(form.pirep_multiplier) : null,
        unlocks_codeshares: !!form.unlocks_codeshares,
        badge_url: badgeUrl,
        ...(editingRank ? { aircraft_restrictions: editingRank.aircraft_restrictions || '' } : {}),
      };
      if (editingRank) {
        await ranksApi.update(editingRank.id, payload);
        showToast('Rank updated!', 'success');
      } else {
        await ranksApi.create(payload);
        showToast('Rank created!', 'success');
      }
      closeForm();
      loadAll();
    } catch (err) {
      showToast('Failed to save rank', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rank) => setConfirmDelete(rank);

  const doDelete = async (rank) => {
    try {
      await ranksApi.delete(rank.id);
      showToast('Rank deleted', 'success');
      loadAll();
    } catch (err) {
      showToast('Failed to delete rank', 'error');
    }
  };

  const seedDefaultRanks = () => setConfirmSeed(true);

  const doSeed = async () => {
    try {
      setSaving(true);
      for (const rank of DEFAULT_RANKS) {
        await ranksApi.create(rank);
      }
      showToast('Default ranks created!', 'success');
      loadAll();
    } catch (err) {
      showToast('Failed to seed ranks: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Aircraft restrictions
  const openRestrictions = (rank) => {
    const current = rank.aircraft_restrictions ? JSON.parse(rank.aircraft_restrictions) : [];
    setEditingRestrictionsFor(rank.id);
    setRestrictionDraft(current);
  };

  const toggleType = (type) => {
    setRestrictionDraft(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const saveRestrictions = async (rankId) => {
    try {
      setSaving(true);
      await ranksApi.update(rankId, {
        aircraft_restrictions: JSON.stringify(restrictionDraft),
      });
      showToast('Aircraft unlocks saved!', 'success');
      setEditingRestrictionsFor(null);
      loadAll();
    } catch (err) {
      showToast('Failed to save aircraft unlocks', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getRestrictions = (rank) => {
    try {
      return rank.aircraft_restrictions ? JSON.parse(rank.aircraft_restrictions) : [];
    } catch { return []; }
  };

  const aircraftTypes = getAircraftTypes(fleet);
  const sorted = [...ranks].sort((a, b) => a.hours_required - b.hours_required || a.order_position - b.order_position);
  const flaggedCodeshareIdx = sorted.findIndex(r => r.unlocks_codeshares === true);
  const codeshareIdx = flaggedCodeshareIdx !== -1 ? flaggedCodeshareIdx : (sorted.length > 1 ? 1 : 0);
  const unlockedKeys = new Set(sorted.flatMap(r => getRestrictions(r).map(normaliseType)));
  // ("ROTW" is a placeholder fleet entry for Routes of the Week, not an aircraft.)
  const unassignedTypes = aircraftTypes.filter(t => !unlockedKeys.has(normaliseType(t)) && t.toUpperCase() !== 'ROTW');

  return (
    <div className="ranks-manager">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Rank Management</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Configure rank tiers, hour thresholds, and which aircraft each rank unlocks
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {ranks.length === 0 && !loading && (
            <button onClick={seedDefaultRanks} disabled={saving}
              style={{ padding: '0.6rem 1.1rem', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {saving ? 'Seeding...' : 'Use Default Ranks'}
            </button>
          )}
          <button onClick={openAddForm} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>
            <Plus size={15} strokeWidth={2.5} /> Add Rank
          </button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 4px 12px var(--shadow)' }}>
          <h4 style={{ margin: '0 0 1.25rem', fontWeight: 700 }}>{editingRank ? 'Edit Rank' : 'Add New Rank'}</h4>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>Rank Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. First Officer" required style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>Hours Required</label>
                <input type="number" min="0" step="0.5" value={form.hours_required} onChange={e => setForm({ ...form, hours_required: e.target.value })} placeholder="e.g. 75" required style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>Order (1 = lowest)</label>
                <input type="number" min="1" value={form.order_position} onChange={e => setForm({ ...form, order_position: e.target.value })} required style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                  PIREP Multiplier
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>(optional)</span>
                </label>
                <input
                  type="number" min="1" max="5" step="0.05"
                  value={form.pirep_multiplier}
                  onChange={e => setForm({ ...form, pirep_multiplier: e.target.value })}
                  placeholder="e.g. 1.25"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.unlocks_codeshares} onChange={e => setForm({ ...form, unlocks_codeshares: e.target.checked })} style={{ margin: 0 }} />
                Unlocks codeshare flights
              </label>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Non-QF/JQ flight numbers. The lowest ticked rank wins; if none are ticked, the second rank unlocks them.
              </div>
            </div>
            {/* Badge upload */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                Rank Badge <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional — PNG/JPG)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {badgePreview && (
                  <img src={badgePreview} alt="Badge preview"
                    style={{ height: 40, width: 'auto', borderRadius: 6, border: '1px solid var(--border-color)', objectFit: 'contain', background: '#111' }} />
                )}
                <button type="button" onClick={() => badgeInputRef.current?.click()}
                  style={{ padding: '0.5rem 1rem', border: '1.5px dashed var(--border-color)', borderRadius: 8, background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                  {badgePreview ? 'Change Badge' : '+ Upload Badge'}
                </button>
                {badgePreview && (
                  <button type="button" onClick={() => { setBadgeFile(null); setBadgePreview(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                    Remove
                  </button>
                )}
                <input ref={badgeInputRef} type="file" accept="image/*" onChange={handleBadgePick} style={{ display: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving || uploadingBadge} className="btn btn-primary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>
                {uploadingBadge ? 'Uploading badge...' : saving ? 'Saving...' : editingRank ? 'Update Rank' : 'Create Rank'}
              </button>
              <button type="button" onClick={closeForm} className="btn btn-secondary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Rank list */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>Loading ranks...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No ranks configured yet</div>
          <div style={{ fontSize: '0.875rem' }}>Add your first rank above, or use the default rank structure.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sorted.map((rank, idx) => {
            const colour = getRankColour(rank.order_position);
            const nextRank = sorted[idx + 1];
            const restrictions = getRestrictions(rank);
            const isEditingThisRank = editingRestrictionsFor === rank.id;

            return (
              <div key={rank.id} className="rank-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: `4px solid ${colour}`, borderRadius: '10px', boxShadow: '0 1px 3px var(--shadow)', overflow: 'hidden' }}>

                <div style={{ padding: '1rem 1.25rem' }}>
                  {/* Top: badge + name/subtitle + hours pill */}
                  <div className="rank-top" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                    {rank.badge_url ? (
                      <img src={rank.badge_url} alt={rank.name}
                        style={{ height: 34, width: 'auto', maxWidth: 48, objectFit: 'contain', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: `${colour}18`, border: `1.5px solid ${colour}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colour }} />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: colour }}>{rank.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        {rank.hours_required === 0 ? 'Starting rank' : `Unlocks at ${rank.hours_required}h`}
                        {nextRank && ` · up to ${nextRank.hours_required}h`}
                      </div>
                    </div>

                    <div className="rank-hours-pill" style={{ flexShrink: 0, padding: '0.3rem 0.85rem', background: `${colour}15`, border: `1px solid ${colour}30`, borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, color: colour, whiteSpace: 'nowrap' }}>
                      {rank.hours_required}h+
                    </div>
                  </div>

                  <div className="rank-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    {rank.pirep_multiplier && rank.pirep_multiplier > 1 ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.25rem 0.65rem',
                        background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)',
                        border: '1px solid rgba(var(--brand-primary-rgb),0.2)',
                        borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace',
                      }}>
                        ×{rank.pirep_multiplier} PIREP
                      </span>
                    ) : null}

                    {idx === codeshareIdx && (
                      <span title={flaggedCodeshareIdx === -1 ? 'Default — no rank is ticked "Unlocks codeshare flights"' : undefined}
                        style={{ padding: '0.18rem 0.6rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                        Unlocks codeshares{flaggedCodeshareIdx === -1 ? ' (default)' : ''}
                      </span>
                    )}
                    {restrictions.length === 0 ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unlocks no aircraft</span>
                    ) : restrictions.map(type => (
                      <span key={type} style={{ padding: '0.18rem 0.6rem', background: 'rgba(var(--brand-accent-rgb),0.12)', color: 'var(--brand-accent)', border: '1px solid rgba(var(--brand-accent-rgb),0.3)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {type}
                      </span>
                    ))}
                  </div>

                  <div className="rank-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
                    <button
                      onClick={() => isEditingThisRank ? setEditingRestrictionsFor(null) : openRestrictions(rank)}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.45rem 0.6rem', background: isEditingThisRank ? colour + '20' : 'var(--bg-hover)', border: `1px solid ${isEditingThisRank ? colour + '50' : 'var(--border-color)'}`, borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', color: isEditingThisRank ? colour : 'var(--text-primary)', fontWeight: 600 }}>
                      <Plane size={13} strokeWidth={2.25} /><span>Aircraft</span>
                    </button>
                    <button onClick={() => openEditForm(rank)}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.45rem 0.6rem', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <Pencil size={13} strokeWidth={2.25} /><span>Edit</span>
                    </button>
                    <button onClick={() => handleDelete(rank)}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.45rem 0.6rem', background: 'transparent', border: '1px solid #e5373730', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', color: '#e53737', fontWeight: 600 }}>
                      <Trash2 size={13} strokeWidth={2.25} /><span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Aircraft restriction panel */}
                {isEditingThisRank && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '1rem 1.25rem', background: 'var(--bg-hover)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Aircraft unlocked at {rank.name}
                    </div>

                    {aircraftTypes.length === 0 ? (
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No aircraft in fleet yet — add aircraft in the Fleet tab first.</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                        {aircraftTypes.map(type => {
                          const selected = restrictionDraft.includes(type);
                          return (
                            <button
                              key={type}
                              onClick={() => toggleType(type)}
                              style={{
                                padding: '0.35rem 0.9rem',
                                borderRadius: '999px',
                                border: `1px solid ${selected ? 'rgba(var(--brand-accent-rgb),0.5)' : 'var(--border-color)'}`,
                                background: selected ? 'rgba(var(--brand-accent-rgb),0.15)' : 'var(--bg-card)',
                                color: selected ? 'var(--brand-accent)' : 'var(--text-primary)',
                                fontWeight: selected ? 700 : 500,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {selected && '✓ '}{type}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => saveRestrictions(rank.id)}
                        disabled={saving}
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
                      >
                        {saving ? 'Saving...' : 'Save Aircraft'}
                      </button>
                      <button
                        onClick={() => setEditingRestrictionsFor(null)}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sorted.length > 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '1rem' }}>
          {sorted.length} rank{sorted.length !== 1 ? 's' : ''} configured · Aircraft unlocks apply to all liveries of that type
        </p>
      )}
      {sorted.length > 0 && unassignedTypes.length > 0 && (
        <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Not unlocked by any rank, so every pilot can fly: {unassignedTypes.join(', ')}
        </p>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          message="This rank will be permanently removed. Pilots currently at this rank will not be affected immediately, but the rank will no longer appear in the system."
          confirmLabel="Delete Rank"
          danger
          onConfirm={() => doDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmSeed && (
        <ConfirmModal
          title="Seed default ranks?"
          message="This will create the default rank structure. Existing ranks will not be affected."
          confirmLabel="Create Default Ranks"
          onConfirm={doSeed}
          onClose={() => setConfirmSeed(false)}
        />
      )}

      <style>{`
        @media (max-width: 480px) {
          .rank-card .rank-hours-pill { display: none; }
          .rank-card .rank-actions button span { display: none; }
        }
      `}</style>
    </div>
  );
}

export default RanksManager;
