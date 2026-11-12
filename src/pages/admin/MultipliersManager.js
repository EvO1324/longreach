/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { multipliers as multipliersApi, routes as routesApi, settings as settingsApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';

const EMPTY_FORM = { name: '', code: '', value: '', description: '', promo_code: '', promo_route: '', active: true, gift: false };

const GIFT_SETTING_KEY = 'gift_multipliers';

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STATUS_COLOURS = { approved: 'var(--avg-green)', pending: 'var(--avg-gold-dark)', rejected: '#c62828' };

// Who has claimed a gift / promo (when, on which PIREP) and who hasn't yet
function ClaimsPanel({ multiplierId, isGift }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    multipliersApi.claims(multiplierId).then(setData).catch(() => setError(true));
  }, [multiplierId]);

  const box = { flexBasis: '100%', marginTop: '0.25rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border-color)' };
  if (error) return <div style={{ ...box, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Couldn't load claims.</div>;
  if (!data) return <div style={{ ...box, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading claims…</div>;

  const listStyle = { maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' };
  const heading = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' };
  return (
    <div style={box}>
      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.8rem' }}>
        Claimed by {data.claims.length}{isGift ? ` of ${data.eligible} approved pilots` : ` pilot${data.claims.length === 1 ? '' : 's'}`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isGift ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr', gap: '1.25rem' }}>
        <div>
          <div style={heading}>Claimed</div>
          {data.claims.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Nobody yet.</div>
          ) : (
            <div style={listStyle}>
              {data.claims.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>
                    <strong style={{ fontWeight: 600 }}>{c.pilot?.name || 'Unknown pilot'}</strong>
                    {c.pilot?.callsign && <span style={{ color: 'var(--text-secondary)' }}> ({c.pilot.callsign})</span>}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {c.flight
                      ? <>{c.flight.route} <span style={{ color: STATUS_COLOURS[c.flight.status] || 'inherit', fontWeight: 600 }}>{c.flight.status}</span></>
                      : 'no PIREP linked'}
                    {' '}{fmtDate(c.usedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {isGift && (
          <div>
            <div style={heading}>Not claimed yet ({data.unclaimed.length})</div>
            {data.unclaimed.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Every approved pilot has claimed it.</div>
            ) : (
              <div style={listStyle}>
                {data.unclaimed.map(p => (
                  <div key={p.id}>
                    {p.name}{p.callsign && <span style={{ color: 'var(--text-secondary)' }}> ({p.callsign})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function parseGiftIds(raw) {
  try {
    const ids = JSON.parse(raw || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

const STYLES = `
  .mm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }
  .mm-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .mm-form-footer {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .mm-form-footer-actions {
    margin-left: auto;
    display: flex;
    gap: 0.75rem;
  }
  .mm-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--bg-card);
    border-radius: 10px;
    flex-wrap: wrap;
  }
  .mm-card-main {
    display: contents;
  }
  .mm-card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .mm-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .mm-header .btn {
      align-self: flex-start;
    }
    .mm-form-grid {
      grid-template-columns: 1fr;
    }
    .mm-form-footer {
      flex-direction: column;
      align-items: flex-start;
    }
    .mm-form-footer-actions {
      margin-left: 0;
      width: 100%;
      justify-content: flex-end;
    }
    .mm-card {
      /* Top row: badge + name + value, bottom row: actions */
      row-gap: 0.65rem;
    }
    .mm-card-name {
      /* Allow name block to shrink and wrap */
      min-width: 0;
      flex: 1 1 0;
    }
    .mm-card-actions {
      /* Push actions to their own full-width row */
      width: 100%;
      margin-left: 0;
      justify-content: flex-end;
    }
  }
`;

function MultipliersManager() {
  const [multipliers, setMultipliers] = useState([]);
  const [routes, setRoutes]           = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [giftIds, setGiftIds] = useState([]);
  const [openClaims, setOpenClaims] = useState(null); // multiplier id whose claims panel is open

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try {
      setLoading(true);
      const [data, routesData, settingsData] = await Promise.all([
        multipliersApi.listAll(), routesApi.list({ active: true }), settingsApi.list(),
      ]);
      setMultipliers(data.multipliers || []);
      setRoutes(routesData.routes || []);
      setGiftIds(parseGiftIds(settingsData.settings?.[GIFT_SETTING_KEY]));
    } catch (err) {
      showToast('Failed to load multipliers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (m) => {
    setEditing(m.id);
    setForm({ name: m.name, code: m.code, value: m.value, description: m.description || '', promo_code: m.promo_code || '', promo_route: m.promo_route || '', active: m.active, gift: giftIds.includes(m.id) });
    setAdding(false);
  };

  const handleCancel = () => {
    setEditing(null);
    setAdding(false);
    setForm(EMPTY_FORM);
  };

  // Add or remove a multiplier from the gift list, saving only if it changed
  const saveGift = async (id, gift) => {
    if (giftIds.includes(id) === gift) return;
    const next = gift ? [...giftIds, id] : giftIds.filter(g => g !== id);
    await settingsApi.save(GIFT_SETTING_KEY, JSON.stringify(next));
    setGiftIds(next);
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.value) {
      showToast('Name, code and value are required', 'error');
      return;
    }
    const value = parseFloat(form.value);
    if (isNaN(value) || value <= 0) {
      showToast('Value must be a positive number', 'error');
      return;
    }
    const code = form.code.toUpperCase();
    const clash = multipliers.find(m => m.code === code && m.id !== editing);
    if (clash) {
      showToast(`"${clash.name}" already uses the code ${code}. Pick a different code.`, 'error');
      return;
    }
    try {
      setSaving(true);
      const { gift, ...fields } = form;
      const payload = { ...fields, code: form.code.toUpperCase(), value };
      if (editing) {
        await multipliersApi.update(editing, payload);
        await saveGift(editing, gift);
        showToast('Multiplier updated', 'success');
      } else {
        const created = await multipliersApi.create(payload);
        if (created.multiplier?.id) await saveGift(created.multiplier.id, gift);
        showToast('Multiplier created', 'success');
      }
      handleCancel();
      await load();
    } catch (err) {
      showToast('Failed to save multiplier', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => setConfirmDelete(id);

  const handleToggleActive = async (m) => {
    try {
      await multipliersApi.update(m.id, { active: !m.active });
      await load();
    } catch (err) {
      showToast('Failed to update', 'error');
    }
  };

  return (
    <div>
      <style>{STYLES}</style>

      {/* Header */}
      <div className="mm-header">
        <div>
          <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>Flight Time Multipliers</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Pilots can apply these when filing PIREPs from Routes of the Week. Multiplied against their logged flight time.
          </p>
        </div>
        {!adding && !editing && (
          <button
            onClick={() => { setAdding(true); setForm(EMPTY_FORM); }}
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            + Add Multiplier
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {(adding || editing) && (
        <div style={{
          background: 'var(--bg-hover)',
          border: '1.5px solid var(--avg-green)',
          borderRadius: '10px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}>
          <h4 style={{ margin: '0 0 1.25rem' }}>{editing ? 'Edit Multiplier' : 'New Multiplier'}</h4>
          <div className="mm-form-grid">
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Double Hours"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                Code * <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(shown on PIREP form)</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. 2X"
                maxLength={8}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                Multiplier Value * <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(e.g. 2 = double)</span>
              </label>
              <input
                type="number"
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                placeholder="2.0"
                step="0.25"
                min="0.25"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                Description <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Double hours for ROTW routes"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                Promo code <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional — enables URL activation)</span>
              </label>
              <input
                type="text"
                value={form.promo_code}
                onChange={e => setForm({ ...form, promo_code: e.target.value.toUpperCase() })}
                placeholder="e.g. SUMMERBASH"
                maxLength={32}
              />
              {form.promo_code && (
                <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  URL: <code style={{ background: 'var(--bg-hover)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>/log-flight?multi={form.promo_code}</code>
                </div>
              )}
            </div>
            {form.promo_code && (
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                  Linked route <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional — auto-fills form when pilot uses the link)</span>
                </label>
                <select
                  value={form.promo_route}
                  onChange={e => setForm({ ...form, promo_route: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="">No route linked</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.flight_number} — {r.departure_icao} → {r.arrival_icao}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mm-form-footer">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm({ ...form, active: e.target.checked })}
              />
              Active (visible to pilots)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={form.gift}
                onChange={e => setForm({ ...form, gift: e.target.checked })}
              />
              Gift to every pilot (one use each, on any flight)
            </label>
            <div className="mm-form-footer-actions">
              <button onClick={handleCancel} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary"
                style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multipliers list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : multipliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', border: '2px dashed var(--border-color)', borderRadius: '10px' }}>
          No multipliers yet — add one above
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {multipliers.map(m => (
            <div
              key={m.id}
              className="mm-card"
              style={{
                border: `1.5px solid var(--border-color)`,
                opacity: m.active ? 1 : 0.55,
              }}
            >
              {/* Code badge */}
              <div style={{
                padding: '0.35rem 0.75rem',
                background: 'rgba(var(--brand-primary-rgb),0.08)',
                color: 'var(--avg-green)',
                borderRadius: '6px',
                fontWeight: 700,
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                letterSpacing: '0.5px',
                flexShrink: 0,
              }}>
                {m.code}
              </div>

              {/* Name + description */}
              <div className="mm-card-name" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{m.name}</div>
                {m.description && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                    {m.description}
                  </div>
                )}
                {giftIds.includes(m.id) && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--avg-gold-dark)', marginTop: '0.2rem', fontWeight: 600 }}>
                    Gifted to every pilot, one use each
                  </div>
                )}
                {m.promo_code && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--avg-gold-dark)', marginTop: '0.2rem', fontFamily: 'monospace', fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                    🔗 /log-flight?multi={m.promo_code}
                  </div>
                )}
              </div>

              {/* Value */}
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1, color: 'var(--text-primary)' }}>
                  ×{m.value}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                  multiplier
                </div>
              </div>

              {/* Actions: status toggle + edit + delete */}
              <div className="mm-card-actions">
                <button
                  onClick={() => handleToggleActive(m)}
                  style={{
                    padding: '0.3rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: m.active ? '#15803d' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.active ? 'Active' : 'Inactive'}
                </button>
                {(giftIds.includes(m.id) || m.promo_code) && (
                  <button
                    onClick={() => setOpenClaims(openClaims === m.id ? null : m.id)}
                    style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: openClaims === m.id ? 'var(--bg-hover)' : 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}
                  >
                    Claims
                  </button>
                )}
                <button
                  onClick={() => handleEdit(m)}
                  style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  style={{ padding: '0.35rem 0.75rem', border: '1px solid rgba(var(--brand-primary-rgb),0.3)', borderRadius: '6px', background: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--avg-green)', whiteSpace: 'nowrap' }}
                >
                  Delete
                </button>
              </div>
              {openClaims === m.id && <ClaimsPanel multiplierId={m.id} isGift={giftIds.includes(m.id)} />}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this multiplier?"
          message="This will permanently remove the multiplier."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try { await multipliersApi.delete(confirmDelete); await saveGift(confirmDelete, false); showToast('Deleted', 'success'); await load(); }
            catch { showToast('Failed to delete', 'error'); }
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

export default MultipliersManager;