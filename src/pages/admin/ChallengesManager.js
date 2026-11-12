/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { challenges as challengesApi, fleet as fleetApi, routes as routesApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import RouteSearch from '../../components/RouteSearch';
import Dropdown from '../../components/Dropdown';

// SVG icon helper
function Ico({ children, size = 16, sw = 1.75 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {children}
    </svg>
  );
}

// Shared style helpers
const inputStyle = {
  width: '100%', padding: '0.7rem 0.9rem', borderRadius: '8px',
  border: '1px solid var(--border-color)', fontSize: '0.88rem',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', fontWeight: 600, fontSize: '0.72rem',
  color: 'var(--text-secondary)', marginBottom: '0.35rem',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};
const btnPrimary = {
  padding: '0.6rem 1.25rem', background: 'var(--avg-green)', color: 'white',
  border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700,
  fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem',
};
const btnSecondary = {
  padding: '0.6rem 1.1rem', background: 'transparent',
  border: '1px solid var(--border-color)', borderRadius: '8px',
  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
  color: 'var(--text-secondary)',
};
const btnDanger = {
  padding: '0.45rem 0.9rem', background: 'transparent',
  border: '1px solid #c62828', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, color: '#c62828',
};

// Status badge
const STATUS_STYLES = {
  draft:  { background: 'rgba(107,114,128,0.1)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.25)' },
  active: { background: 'rgba(var(--brand-primary-rgb),0.1)',   color: 'var(--avg-green)', border: '1px solid rgba(var(--brand-primary-rgb),0.3)' },
  closed: { background: 'rgba(198,40,40,0.08)',  color: '#c62828', border: '1px solid rgba(198,40,40,0.25)' },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{ ...s, fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {status}
    </span>
  );
}

function fmtHours(h) {
  if (!h && h !== 0) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// Challenge modal (create / edit)
function ChallengeModal({ challenge, onSave, onClose }) {
  const [form, setForm] = useState({
    name:        challenge?.name        || '',
    description: challenge?.description || '',
    start_date:  challenge?.start_date  || '',
    end_date:    challenge?.end_date    || '',
    status:      challenge?.status      || 'draft',
    image_url:   challenge?.image_url   || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim())       return showToast('Name is required', 'error');
    if (!form.start_date)        return showToast('Start date is required', 'error');
    if (!form.end_date)          return showToast('End date is required', 'error');
    if (form.start_date > form.end_date) return showToast('End date must be after start date', 'error');
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch { showToast('Failed to save challenge', 'error'); }
    finally  { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
            {challenge ? 'Edit Challenge' : 'New Challenge'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <Ico size={18}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ico>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Challenge Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Pacific Run" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description shown to pilots" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Banner Image URL</label>
            <input value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://…" style={inputStyle} />
            {form.image_url && (
              <div style={{ marginTop: '0.5rem', borderRadius: '6px', overflow: 'hidden', height: 80 }}>
                <img src={form.image_url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>
          <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={inputStyle} />
            </div>
          </div>
          {challenge && (
            <div>
              <label style={labelStyle}>Status</label>
              <Dropdown
                value={form.status}
                onChange={v => set('status', v)}
                options={[
                  { value: 'draft',  label: 'Draft'  },
                  { value: 'active', label: 'Active' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : challenge ? 'Save Changes' : 'Create Challenge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Leg row (inline edit)
function LegRow({ leg, index, total, onMoveUp, onMoveDown, onUpdate, onDelete, fleetTypes = [], fleet = [], routes = [] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    departure_icao:       leg.departure_icao || '',
    arrival_icao:         leg.arrival_icao   || '',
    multiplier:           leg.multiplier && parseFloat(leg.multiplier) !== 1.0 ? leg.multiplier : '',
    aircraft_restriction: leg.aircraft_restriction || '',
    livery_id:            leg.livery_id      || '',
    livery_name:          leg.livery_name    || '',
    notes:                leg.notes          || '',
    route_id:             leg.route_id       || '',
    flight_number:        leg.flight_number  || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.departure_icao || !form.arrival_icao) return showToast('DEP and ARR are required', 'error');
    setSaving(true);
    try {
      await onUpdate(leg.id, { ...form, order: leg.order });
      setEditing(false);
    } catch { showToast('Failed to save leg', 'error'); }
    finally  { setSaving(false); }
  };

  const handleDelete = () => setConfirmDelete(true);

  const doDelete = async () => {
    setDeleting(true);
    try { await onDelete(leg.id); }
    catch { showToast('Failed to delete leg', 'error'); setDeleting(false); }
  };

  const multColour = form.multiplier >= 2 ? 'var(--avg-gold)' : form.multiplier >= 1.5 ? 'var(--avg-green)' : 'var(--text-secondary)';
  const hasMult = form.multiplier && parseFloat(form.multiplier) > 1.0;

  if (editing) {
    return (
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid var(--avg-green)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Route <span style={{ fontWeight: 400, textTransform: 'none' }}>(search or enter manually)</span></label>
          <RouteSearch
            routes={routes}
            onSelect={route => setForm(f => ({ ...f, route_id: route.id, flight_number: route.flight_number, departure_icao: route.departure_icao, arrival_icao: route.arrival_icao }))}
            placeholder="Search flight number or ICAO…"
          />
          {form.departure_icao && form.arrival_icao && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--avg-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {form.flight_number && <span style={{ fontFamily: 'monospace', marginRight: '0.35rem' }}>{form.flight_number}</span>}
              {form.departure_icao} → {form.arrival_icao}
            </div>
          )}
        </div>
        <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Departure ICAO</label>
            <input value={form.departure_icao} onChange={e => set('departure_icao', e.target.value.toUpperCase())} placeholder="YSSY" style={inputStyle} maxLength={4} />
          </div>
          <div>
            <label style={labelStyle}>Arrival ICAO</label>
            <input value={form.arrival_icao} onChange={e => set('arrival_icao', e.target.value.toUpperCase())} placeholder="YBBN" style={inputStyle} maxLength={4} />
          </div>
          <div>
            <label style={labelStyle}>Multiplier</label>
            <Dropdown
              value={form.multiplier === '' ? '' : String(form.multiplier)}
              onChange={v => set('multiplier', v === '' ? '' : parseFloat(v))}
              placeholder="— No multiplier"
              options={[
                { value: '',    label: '— No multiplier' },
                { value: '1.25', label: '×1.25' },
                { value: '1.5',  label: '×1.50' },
                { value: '1.75', label: '×1.75' },
                { value: '2',    label: '×2.00' },
                { value: '2.5',  label: '×2.50' },
                { value: '3',    label: '×3.00' },
              ]}
            />
          </div>
        </div>
        <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Required livery <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <Dropdown
              value={form.livery_id}
              onChange={v => {
                const chosen = fleet.find(l => l.livery_id === v);
                set('livery_id', v);
                set('livery_name', chosen ? chosen.displayName : '');
                set('aircraft_restriction', chosen ? chosen.type : '');
              }}
              placeholder="Any livery"
              options={[{ value: '', label: 'Any livery' }, ...fleet.map(l => ({ value: l.livery_id, label: l.displayName }))]}
            />
            {form.livery_name && <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--avg-green)' }}>✓ {form.livery_name}</div>}
          </div>
          <div>
            <label style={labelStyle}>Notes <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Shown to pilots" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save Leg'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', padding: '0.9rem 1.1rem', border: '1px solid var(--border-color)' }}>
      {/* Order handle / arrows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
        <button onClick={onMoveUp}   disabled={index === 0}         style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--border-color)' : 'var(--text-secondary)', padding: '2px' }}>
          <Ico size={13}><polyline points="18 15 12 9 6 15"/></Ico>
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--border-color)' : 'var(--text-secondary)', padding: '2px' }}>
          <Ico size={13}><polyline points="6 9 12 15 18 9"/></Ico>
        </button>
      </div>

      {/* Leg number */}
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
        {index + 1}
      </div>

      {/* Route */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>{leg.departure_icao}</span>
        <Ico size={14} sw={2}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Ico>
        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>{leg.arrival_icao}</span>
        {leg.aircraft_restriction && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            {leg.aircraft_restriction}
          </span>
        )}
        {leg.notes && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {leg.notes}
          </span>
        )}
      </div>

      {/* Multiplier */}
      {hasMult && (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: multColour, minWidth: 44, textAlign: 'right', flexShrink: 0 }}>
          ×{parseFloat(form.multiplier).toFixed(2)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        <button onClick={() => setEditing(true)} style={{ ...btnSecondary, padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>Edit</button>
        <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>
          {deleting ? '…' : 'Remove'}
        </button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Remove this leg?"
          message="This leg will be permanently deleted from the challenge."
          confirmLabel="Remove Leg"
          danger
          onConfirm={doDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// Add leg form
function AddLegForm({ challengeId, nextOrder, onAdded, onCancel, fleetTypes = [], fleet = [], routes = [] }) {
  const [form, setForm] = useState({
    departure_icao: '', arrival_icao: '', multiplier: '',
    aircraft_restriction: '', livery_id: '', livery_name: '',
    notes: '', route_id: '', flight_number: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.departure_icao || !form.arrival_icao) return showToast('DEP and ARR are required', 'error');
    setSaving(true);
    try {
      const { leg } = await challengesApi.createLeg(challengeId, { ...form, order: nextOrder });
      onAdded(leg);
      setForm({ departure_icao: '', arrival_icao: '', multiplier: '', aircraft_restriction: '', livery_id: '', livery_name: '', notes: '', route_id: '', flight_number: '' });
    } catch { showToast('Failed to add leg', 'error'); }
    finally  { setSaving(false); }
  };

  return (
    <div style={{ background: 'var(--avg-green-pale)', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px dashed var(--avg-green)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--avg-green)' }}>Add Leg {nextOrder}</div>

      <div>
        <label style={labelStyle}>Route <span style={{ fontWeight: 400, textTransform: 'none' }}>(search or enter manually)</span></label>
        <RouteSearch
          routes={routes}
          onSelect={route => setForm(f => ({ ...f, route_id: route.id, flight_number: route.flight_number, departure_icao: route.departure_icao, arrival_icao: route.arrival_icao }))}
          placeholder="Search flight number or ICAO…"
        />
        {form.departure_icao && form.arrival_icao && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--avg-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {form.departure_icao} → {form.arrival_icao}
          </div>
        )}
      </div>

      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Departure ICAO</label>
          <input value={form.departure_icao} onChange={e => set('departure_icao', e.target.value.toUpperCase())} placeholder="YSSY" style={inputStyle} maxLength={4} />
        </div>
        <div>
          <label style={labelStyle}>Arrival ICAO</label>
          <input value={form.arrival_icao} onChange={e => set('arrival_icao', e.target.value.toUpperCase())} placeholder="YBBN" style={inputStyle} maxLength={4} />
        </div>
        <div>
          <label style={labelStyle}>Multiplier</label>
          <Dropdown
            value={form.multiplier === '' ? '' : String(form.multiplier)}
            onChange={v => set('multiplier', v === '' ? '' : parseFloat(v))}
            placeholder="— No multiplier"
            options={[
              { value: '',    label: '— No multiplier' },
              { value: '1.25', label: '×1.25' },
              { value: '1.5',  label: '×1.50' },
              { value: '1.75', label: '×1.75' },
              { value: '2',    label: '×2.00' },
              { value: '2.5',  label: '×2.50' },
              { value: '3',    label: '×3.00' },
            ]}
          />
        </div>
      </div>
      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Required livery <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <Dropdown
            value={form.livery_id}
            onChange={v => {
              const chosen = fleet.find(l => l.livery_id === v);
              set('livery_id', v);
              set('livery_name', chosen ? chosen.displayName : '');
              set('aircraft_restriction', chosen ? chosen.type : '');
            }}
            placeholder="Any livery"
            options={[{ value: '', label: 'Any livery' }, ...fleet.map(l => ({ value: l.livery_id, label: l.displayName }))]}
          />
          {form.livery_name && <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--avg-green)' }}>✓ {form.livery_name}</div>}
        </div>
        <div>
          <label style={labelStyle}>Notes <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Shown to pilots" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        <button onClick={handleAdd} disabled={saving} style={btnPrimary}>
          <Ico size={15}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>
          {saving ? 'Adding…' : 'Add Leg'}
        </button>
      </div>
    </div>
  );
}

// Challenge detail / legs panel
function ChallengeDetail({ challengeId, onBack, fleetTypes = [], fleet = [], routes = [] }) {
  const [challenge, setChallenge] = useState(null);
  const [legs, setLegs]           = useState([]);
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [showAddLeg, setShowAddLeg] = useState(false);
  const [tab, setTab] = useState('legs');
  const [rewards, setRewards] = useState(() => {
    try { return JSON.parse('[]'); } catch { return []; }
  });
  const [rewardsSaving, setRewardsSaving] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmClose, setConfirmClose]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, entriesData] = await Promise.all([
        challengesApi.get(challengeId),
        challengesApi.adminEntries(challengeId),
      ]);
      setChallenge(detail.challenge);
      setLegs(detail.legs || []);
      setEntries(entriesData.entries || []);
      try {
        const r = detail.challenge.rewards ? JSON.parse(detail.challenge.rewards) : [];
        setRewards(Array.isArray(r) ? r : []);
      } catch { setRewards([]); }
    } catch { showToast('Failed to load challenge', 'error'); }
    finally  { setLoading(false); }
  }, [challengeId]);

  useEffect(() => { load(); }, [load]);

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const updated = [...legs];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const reordered = updated.map((l, i) => ({ ...l, order: i + 1 }));
    setLegs(reordered);
    try {
      await Promise.all(reordered.map(l => challengesApi.updateLeg(l.id, { order: l.order })));
    } catch { showToast('Failed to reorder legs', 'error'); load(); }
  };

  const handleMoveDown = async (index) => {
    if (index === legs.length - 1) return;
    const updated = [...legs];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reordered = updated.map((l, i) => ({ ...l, order: i + 1 }));
    setLegs(reordered);
    try {
      await Promise.all(reordered.map(l => challengesApi.updateLeg(l.id, { order: l.order })));
    } catch { showToast('Failed to reorder legs', 'error'); load(); }
  };

  const handleUpdateLeg = async (legId, data) => {
    await challengesApi.updateLeg(legId, data);
    await load();
  };

  const handleDeleteLeg = async (legId) => {
    await challengesApi.deleteLeg(legId);
    await load();
  };

  const handleLegAdded = (leg) => {
    setLegs(l => [...l, leg]);
    setShowAddLeg(false);
  };

  const handleSaveChallenge = async (data) => {
    await challengesApi.update(challengeId, data);
    showToast('Challenge updated', 'success');
    load();
  };

  const handlePublish = async () => {
    if (legs.length === 0) return showToast('Add at least one leg before publishing', 'error');
    setConfirmActivate(true);
  };

  const doPublish = async () => {
    await challengesApi.update(challengeId, { status: 'active' });
    showToast('Challenge published', 'success');
    load();
  };

  const handleClose = () => setConfirmClose(true);

  const doClose = async () => {
    await challengesApi.update(challengeId, { status: 'closed' });
    showToast('Challenge closed', 'success');
    load();
  };

  const tabStyle = (active) => ({
    padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600,
    border: 'none', cursor: 'pointer', borderRadius: '6px',
    background: active ? 'var(--avg-green)' : 'transparent',
    color: active ? 'white' : 'var(--text-secondary)',
  });

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>;
  if (!challenge) return null;

  const enrolled  = entries.filter(e => e.status === 'enrolled' || e.status === 'active').length;
  const completed = entries.filter(e => e.status === 'completed').length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ ...btnSecondary, padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, marginTop: 3 }}>
          <Ico size={14}><polyline points="15 18 9 12 15 6"/></Ico>
          Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{challenge.name}</h2>
            <StatusBadge status={challenge.status} />
          </div>
          {challenge.description && <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{challenge.description}</p>}
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Ico size={13}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Ico>
              {challenge.start_date} — {challenge.end_date}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{enrolled} enrolled</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--avg-green)', fontWeight: 600 }}>{completed} completed</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={() => setEditModal(true)} style={{ ...btnSecondary, padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Ico size={14}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Ico>
            Edit
          </button>
          {challenge.status === 'draft'  && <button onClick={handlePublish} style={{ ...btnPrimary, padding: '0.5rem 0.9rem' }}>Publish</button>}
          {challenge.status === 'active' && <button onClick={handleClose}   style={{ ...btnDanger,  padding: '0.5rem 0.9rem' }}>Close Challenge</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button style={tabStyle(tab === 'legs')}    onClick={() => setTab('legs')}>Legs</button>
        <button style={tabStyle(tab === 'entries')} onClick={() => setTab('entries')}>Entries ({entries.length})</button>
        <button style={tabStyle(tab === 'rewards')} onClick={() => setTab('rewards')}>Rewards</button>
      </div>

      {/* Legs tab */}
      {tab === 'legs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {legs.length === 0 && !showAddLeg && (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '10px' }}>
              <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center', opacity: 0.4 }}>
                <Ico size={32} sw={1}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>
              </div>
              No legs yet. Add the first leg below.
            </div>
          )}
          {legs.map((leg, i) => (
            <LegRow
              key={leg.id}
              leg={leg}
              index={i}
              total={legs.length}
              onMoveUp={()           => handleMoveUp(i)}
              onMoveDown={()         => handleMoveDown(i)}
              onUpdate={handleUpdateLeg}
              onDelete={handleDeleteLeg}
              fleetTypes={fleetTypes}
              fleet={fleet}
              routes={routes}
            />
          ))}
          {showAddLeg ? (
            <AddLegForm
              challengeId={challengeId}
              nextOrder={legs.length + 1}
              onAdded={handleLegAdded}
              onCancel={() => setShowAddLeg(false)}
              fleetTypes={fleetTypes}
              fleet={fleet}
              routes={routes}
            />
          ) : (
            <button
              onClick={() => setShowAddLeg(true)}
              style={{ ...btnSecondary, padding: '0.65rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center', borderStyle: 'dashed' }}
            >
              <Ico size={15}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>
              Add Leg
            </button>
          )}
        </div>
      )}

      {/* Entries tab */}
      {tab === 'entries' && (
        <div>
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No entries yet.</div>
          ) : (
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-secondary)' }}>
                  <tr>
                    {['Pilot', 'Callsign', 'Status', 'Progress', 'Flight Time', 'Enrolled', 'Completed'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const u = e.expand?.user;
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem' }}>
                          {u ? `${u.first_name} ${u.last_name}` : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                          {u?.callsign || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <StatusBadge status={e.status} />
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          Leg {e.current_leg_index} / {legs.length}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                          {fmtHours(e.total_flight_time)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {e.completed_at ? new Date(e.completed_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rewards tab */}
      {tab === 'rewards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 600 }}>
          <div style={{ background: 'rgba(var(--brand-accent-rgb),0.06)', border: '1px solid rgba(var(--brand-accent-rgb),0.25)', borderRadius: '10px', padding: '1rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Set bonus hour rewards for the first 3 pilots to complete this challenge. When a pilot's entry is marked complete and they are in the top 3, the bonus hours will be added to their total.
          </div>
          {[0, 1, 2].map(pos => {
            const medal = ['🥇', '🥈', '🥉'][pos];
            const label = ['1st place', '2nd place', '3rd place'][pos];
            const r = rewards[pos] || { bonus_hours: 0, label: '' };
            const update = (field, val) => {
              const next = [...rewards];
              while (next.length <= pos) next.push({ bonus_hours: 0, label: '' });
              next[pos] = { ...next[pos], [field]: val };
              setRewards(next);
            };
            return (
              <div key={pos} style={{ background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>{medal}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>{label}</div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number" min="0" max="500" step="1"
                        value={r.bonus_hours || ''}
                        onChange={e => update('bonus_hours', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        style={{ ...inputStyle, width: 80, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>bonus hours</span>
                    </div>
                    <input
                      type="text"
                      value={r.label || ''}
                      onChange={e => update('label', e.target.value)}
                      placeholder="Optional label, e.g. Gold Wings"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <button
            onClick={async () => {
              setRewardsSaving(true);
              try {
                await challengesApi.update(challengeId, { rewards: JSON.stringify(rewards) });
                showToast('Rewards saved', 'success');
              } catch { showToast('Failed to save rewards', 'error'); }
              finally { setRewardsSaving(false); }
            }}
            disabled={rewardsSaving}
            style={{ ...btnPrimary, alignSelf: 'flex-start', padding: '0.65rem 1.25rem' }}
          >
            {rewardsSaving ? 'Saving…' : 'Save Rewards'}
          </button>
        </div>
      )}

      {editModal && (
        <ChallengeModal
          challenge={challenge}
          onSave={handleSaveChallenge}
          onClose={() => setEditModal(false)}
        />
      )}

      {confirmActivate && (
        <ConfirmModal
          title="Publish this challenge?"
          message="It will become visible to all pilots immediately."
          confirmLabel="Publish"
          onConfirm={doPublish}
          onClose={() => setConfirmActivate(false)}
        />
      )}
      {confirmClose && (
        <ConfirmModal
          title="Close this challenge?"
          message="Incomplete entries will be marked as abandoned. This cannot be undone."
          confirmLabel="Close Challenge"
          danger
          onConfirm={doClose}
          onClose={() => setConfirmClose(false)}
        />
      )}
    </div>
  );
}

// Main ChallengesManager
function ChallengesManager() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [selected, setSelected]     = useState(null);

  const [fleetTypes, setFleetTypes] = useState([]);
  const [fleet, setFleet]             = useState([]);
  const [routes, setRoutes]           = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [confirmReset, setConfirmReset]   = useState(null); // { id, name }

  const load = useCallback(async () => {
    try {
      const [challengeData, fleetData, routesData] = await Promise.all([
        challengesApi.list(),
        fleetApi.list(),
        routesApi.list({ active: true }),
      ]);
      setChallenges(challengeData.challenges || []);
      const allLiveries = (fleetData.fleet || []).flatMap(g =>
        (g.liveries || []).map(l => ({ ...l, type: g.type, displayName: l.name || `${g.type} - ${l.livery_name}` }))
      );
      setFleet(allLiveries);
      const types = [...new Set(
        (fleetData.fleet || []).map(g => g.type).filter(Boolean)
      )].sort();
      setFleetTypes(types);
      setRoutes(routesData.routes || []);
    } catch { showToast('Failed to load challenges', 'error'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    await challengesApi.create(data);
    showToast('Challenge created', 'success');
    load();
  };

  const handleDelete = (id, name) => setConfirmDelete({ id, name });

  const doDelete = async ({ id }) => {
    try {
      await challengesApi.remove(id);
      showToast('Challenge and all data deleted', 'success');
      load();
    } catch { showToast('Failed to delete', 'error'); }
  };

  const handleReset = (id, name) => setConfirmReset({ id, name });

  const doReset = async ({ id }) => {
    try {
      const result = await challengesApi.reset(id);
      showToast(`Reset complete — ${result.entries_wiped} entries wiped`, 'success');
      load();
    } catch { showToast('Failed to reset', 'error'); }
  };

  if (selected) {
    return <ChallengeDetail challengeId={selected} onBack={() => { setSelected(null); load(); }} fleetTypes={fleetTypes} fleet={fleet} routes={routes} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Challenges</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Monthly multi-leg campaigns with hour multipliers and a completion leaderboard.
          </p>
        </div>
        <button onClick={() => setModal(true)} style={btnPrimary}>
          <Ico size={15}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>
          New Challenge
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : challenges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem', opacity: 0.35 }}>
            <Ico size={36} sw={1}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Ico>
          </div>
          No challenges yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {challenges.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.name}</span>
                  <StatusBadge status={c.status} />
                </div>
                {c.description && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Ico size={12}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Ico>
                    {c.start_date} — {c.end_date}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => setSelected(c.id)}
                  style={{ ...btnSecondary, padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  Manage
                  <Ico size={13}><polyline points="9 18 15 12 9 6"/></Ico>
                </button>
                <button onClick={() => handleReset(c.id, c.name)} style={{ ...btnSecondary, padding: '0.5rem 0.9rem', color: 'var(--avg-gold)', borderColor: 'rgba(var(--brand-accent-rgb),0.4)' }}>
                  Reset
                </button>
                <button onClick={() => handleDelete(c.id, c.name)} style={{ ...btnDanger, padding: '0.5rem 0.9rem' }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ChallengeModal
          challenge={null}
          onSave={handleCreate}
          onClose={() => setModal(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          message="This will permanently delete the challenge, all legs, all entries and all completion records. This cannot be undone."
          confirmLabel="Delete Challenge"
          danger
          onConfirm={() => doDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmReset && (
        <ConfirmModal
          title={`Reset "${confirmReset.name}"?`}
          message="This will wipe all pilot entries and completions. The challenge and its legs will remain. Cannot be undone."
          confirmLabel="Reset Challenge"
          danger
          onConfirm={() => doReset(confirmReset)}
          onClose={() => setConfirmReset(null)}
        />
      )}
    </div>
  );
}

export default ChallengesManager;
