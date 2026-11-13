/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { plugins as api } from '../../api/client';
import { showToast } from '../../components/Toast';

const small = { fontSize: '0.8rem', color: 'var(--text-secondary)' };

export function Switch({ on, busy, onChange, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', padding: 2, cursor: busy ? 'wait' : 'pointer', flexShrink: 0,
        background: on ? 'var(--brand-primary)' : 'var(--border-color)', opacity: busy ? 0.6 : 1, transition: 'background .15s',
      }}
    >
      <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  );
}

function Plugins() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api.list().then(d => setList(d.plugins)).catch(err => showToast(err.message || 'Couldn\'t load plugins', 'error'));
  }, []);

  const toggle = async (p, enabled) => {
    setBusy(p.id);
    try {
      const r = await api.set(p.id, enabled);
      setList(r.plugins);
      window.dispatchEvent(new Event('plugins-changed'));
      setNotice(r.restarting
        ? `${p.name} is ${enabled ? 'on' : 'off'}. The crew centre is restarting so the Discord bot and scheduled jobs pick it up, which takes about 20 seconds.`
        : `${p.name} is ${enabled ? 'on' : 'off'}. Restart the API and the bot so Discord commands and scheduled jobs pick it up.`);
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!list) return <div style={small}>Loading…</div>;

  return (
    <div>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 760 }}>
        Optional parts of the crew centre. Switching one off hides its pages, stops its Discord commands and scheduled posts, and keeps its data, so switching it back on picks up where it left off.
        New plugins arrive with updates, switched off until you turn them on.
      </p>

      {notice && <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
        {list.map(p => (
          <section key={p.id} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {p.name}
                {p.beta && <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.15rem 0.45rem', borderRadius: 4, background: 'rgba(230,81,0,0.1)', color: '#e65100' }}>Testing</span>}
              </h3>
              <Switch on={p.enabled} busy={busy === p.id} label={p.name} onChange={v => toggle(p, v)} />
            </div>
            <div style={{ ...small, lineHeight: 1.5 }}>{p.description}</div>
            <div style={{ ...small, fontSize: '0.75rem', marginTop: 'auto', color: p.enabled ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{p.enabled ? 'On' : 'Off'}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default Plugins;
