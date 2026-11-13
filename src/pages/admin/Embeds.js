/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Embeds: widgets for the VA's own website. Switch one on, pick how it
// looks, copy the code.

import React, { useEffect, useState } from 'react';
import { embeds as api } from '../../api/client';
import { showToast } from '../../components/Toast';
import Dropdown from '../../components/Dropdown';
import { Switch } from './Plugins';

const small = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
const label = { display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' };

const WIDGETS = [
  { id: 'live', name: 'Flying now', description: 'Your pilots on the Expert Server right now: callsign, route, aircraft, altitude.', height: 360 },
  { id: 'stats', name: 'In numbers', description: 'Pilots, flights, hours and routes.', height: 190 },
  { id: 'leaderboard', name: 'Top pilots', description: 'The top 10 by hours, all time or this month. Shows first name, last initial and callsign.', height: 470 },
];

function Widget({ w, on, busy, onToggle }) {
  const [theme, setTheme] = useState('light');
  const [transparent, setTransparent] = useState(false);
  const [period, setPeriod] = useState('all');
  const [nonce, setNonce] = useState(0);

  const q = new URLSearchParams({ theme });
  if (transparent) q.set('transparent', '1');
  if (w.id === 'leaderboard' && period === 'month') q.set('period', 'month');
  const src = `${window.location.origin}/embed/${w.id}?${q}`;
  const code = `<iframe src="${src}" title="${w.name}" width="100%" height="${w.height}" style="border:0;border-radius:12px" loading="lazy"></iframe>`;

  // reload the preview once it's switched on
  useEffect(() => { setNonce(n => n + 1); }, [on]);

  const copy = () => navigator.clipboard.writeText(code).then(() => showToast('Copied', 'success')).catch(() => showToast('Couldn\'t copy, select it instead', 'error'));

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{w.name}</h3>
          <div style={{ ...small, marginTop: '0.2rem', lineHeight: 1.45 }}>{w.description}</div>
        </div>
        <Switch on={on} busy={busy} onChange={v => onToggle(w.id, v)} label={w.name} />
      </div>
      {on ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
            <div>
              <span style={label}>Theme</span>
              <Dropdown options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Match visitor' }]} value={theme} onChange={setTheme} />
            </div>
            {w.id === 'leaderboard' && (
              <div>
                <span style={label}>Period</span>
                <Dropdown options={[{ value: 'all', label: 'All time' }, { value: 'month', label: 'This month' }]} value={period} onChange={setPeriod} />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.7rem' }}>
              <input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} style={{ accentColor: 'var(--brand-primary)' }} />
              No background
            </label>
          </div>
          <div style={{ border: '1px dashed var(--border-color)', borderRadius: 12, padding: '0.5rem', background: theme === 'dark' ? '#1a1a1a' : 'var(--bg-secondary)' }}>
            <iframe key={`${src}-${nonce}`} src={src} title={`${w.name} preview`} width="100%" height={w.height} style={{ border: 0, borderRadius: 10, display: 'block' }} />
          </div>
          <div>
            <span style={label}>Paste this into your website</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
              <textarea readOnly value={code} rows={3} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'none' }} />
              <button onClick={copy} className="btn btn-secondary">Copy</button>
            </div>
          </div>
        </>
      ) : (
        <div style={small}>Off. Switch it on to preview it and get the code.</div>
      )}
    </section>
  );
}

function Embeds() {
  const [widgets, setWidgets] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.config().then(d => setWidgets(d.widgets)).catch(err => showToast(err.message || 'Couldn\'t load embeds', 'error'));
  }, []);

  const toggle = async (id, on) => {
    setBusy(id);
    try {
      const r = await api.save({ [id]: on });
      setWidgets(r.widgets);
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally { setBusy(null); }
  };

  if (!widgets) return <div style={small}>Loading…</div>;
  return (
    <div>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 760 }}>
        Put live crew centre info on your own website. Anyone can see a widget once it's on, so only switch on what you're happy to share.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: '1rem', alignItems: 'start' }}>
        {WIDGETS.map(w => <Widget key={w.id} w={w} on={!!widgets[w.id]} busy={busy === w.id} onToggle={toggle} />)}
      </div>
    </div>
  );
}

export default Embeds;
