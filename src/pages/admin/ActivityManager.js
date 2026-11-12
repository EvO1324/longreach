/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { settings as settingsApi } from '../../api/client';
import { showToast } from '../../components/Toast';

const DEFAULTS = { activity_enabled: 'true', inactivity_days: '30', activity_notice_days: '7', activity_final_warning: 'true' };

const label = { display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' };
const input = { width: 90, padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.95rem' };
const row = { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0', borderTop: '1px solid var(--border-color)' };

function ActivityManager() {
  const [saved, setSaved]   = useState(DEFAULTS);
  const [form, setForm]     = useState(DEFAULTS);
  const [lastRun, setLastRun] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.list().then(d => {
      const s = d.settings || {};
      const next = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, s[k] ?? DEFAULTS[k]]));
      setSaved(next); setForm(next);
      setLastRun(s.activity_last_run || null);
    }).catch(() => {});
  }, []);

  const on      = form.activity_enabled !== 'false';
  const days    = parseInt(form.inactivity_days, 10);
  const notice  = parseInt(form.activity_notice_days, 10);
  const final   = form.activity_final_warning !== 'false';
  const valid   = days >= 2 && notice >= 1 && notice < days;
  const changed = Object.keys(DEFAULTS).some(k => String(form[k]) !== String(saved[k]));
  const set = (k, v) => setForm(f => ({ ...f, [k]: String(v) }));

  const save = async () => {
    if (!valid) return showToast('The warning has to come at least a day before the archive date', 'error');
    setSaving(true);
    try {
      await Promise.all(Object.keys(DEFAULTS).filter(k => String(form[k]) !== String(saved[k])).map(k => settingsApi.save(k, String(form[k]))));
      setSaved(form);
      showToast('Saved', 'success');
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.3rem' }}>Activity</h2>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Once a day, pilots who haven't flown in a while are warned on Discord and, if they still don't fly, archived. Pilots on approved leave and new pilots are left alone.
      </p>

      <div className="card">
        <label style={{ ...row, borderTop: 0, paddingTop: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={on} onChange={e => set('activity_enabled', e.target.checked)} style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16 }} />
          <span>Check pilot activity every day</span>
        </label>

        <div style={{ opacity: on ? 1 : 0.5, pointerEvents: on ? 'auto' : 'none' }}>
          <div style={{ ...row, flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <span style={label}>Archive after</span>
              <input type="number" min="2" value={form.inactivity_days} onChange={e => set('inactivity_days', e.target.value)} style={input} /> <span style={{ color: 'var(--text-secondary)' }}>days without a flight</span>
            </div>
            <div>
              <span style={label}>First warning</span>
              <input type="number" min="1" value={form.activity_notice_days} onChange={e => set('activity_notice_days', e.target.value)} style={input} /> <span style={{ color: 'var(--text-secondary)' }}>days before that</span>
            </div>
          </div>
          <label style={{ ...row, cursor: 'pointer' }}>
            <input type="checkbox" checked={final} onChange={e => set('activity_final_warning', e.target.checked)} style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16 }} />
            <span>Send a final warning the day before</span>
          </label>
        </div>

        <div style={{ ...row, justifyContent: 'space-between', paddingBottom: 0 }}>
          <span style={{ fontSize: '0.85rem', color: valid || !on ? 'var(--text-secondary)' : '#c62828' }}>
            {!on ? 'Activity checks are off.'
              : !valid ? 'The warning has to come at least a day before the archive date.'
              : `A pilot is warned after ${days - notice} days without a flight${final ? `, warned again at ${days - 1} days,` : ''} and archived at ${days} days.`}
          </span>
          <button onClick={save} disabled={!changed || saving} className="btn btn-primary" style={{ opacity: !changed || saving ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {lastRun && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.9rem' }}>
          Last checked {new Date(lastRun).toLocaleString()}.
        </p>
      )}
    </div>
  );
}

export default ActivityManager;
