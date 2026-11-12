/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { connections as api } from '../../api/client';
import { showToast } from '../../components/Toast';

const control = { width: '100%', padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box' };
const row = { display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 1.4fr)', gap: '0.5rem 1.25rem', alignItems: 'center', padding: '0.8rem 0', borderTop: '1px solid var(--border-color)' };
const small = { fontSize: '0.78rem', color: 'var(--text-secondary)' };
const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit', textDecoration: 'underline' };

function Picker({ field, value, options, onChange }) {
  const list = field.kind === 'role' ? options?.roles : options?.channels;
  const [typing, setTyping] = useState(false);
  if (!list || typing) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="Discord ID" style={control} inputMode="numeric" />
        {list && <button type="button" style={linkBtn} onClick={() => setTyping(false)}>List</button>}
      </div>
    );
  }
  const known = !value || list.some(o => o.id === value);
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={control}>
        <option value="">Not set</option>
        {!known && <option value={value}>Not in the server ({value})</option>}
        {field.kind === 'role'
          ? list.map(o => <option key={o.id} value={o.id}>@{o.name}</option>)
          : Object.entries(list.reduce((acc, o) => { (acc[o.category || ''] ||= []).push(o); return acc; }, {})).map(([cat, items]) => (
              <optgroup key={cat} label={cat || 'No category'}>
                {items.map(o => <option key={o.id} value={o.id}>#{o.name}</option>)}
              </optgroup>
            ))}
      </select>
      <button type="button" style={linkBtn} onClick={() => setTyping(true)}>ID</button>
    </div>
  );
}

function Secret({ field, draft, removing, onChange }) {
  const [status, setStatus] = useState(null);
  const editing = draft !== undefined;
  const test = async () => {
    setStatus({ text: 'Checking…' });
    try {
      const r = await api.testWebhook(field.key, editing ? draft : undefined);
      setStatus(r.ok ? { ok: true, text: r.channel ? `Posts to #${r.channel}` : `Works (${r.name})` } : { ok: false, text: r.error });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
  };
  return (
    <div>
      {editing ? (
        <input value={draft} onChange={e => onChange(e.target.value)} placeholder={field.kind === 'webhook' ? 'https://discord.com/api/webhooks/…' : ''} style={control} autoComplete="off" spellCheck={false} autoFocus />
      ) : (
        <div style={{ ...small, fontSize: '0.85rem', padding: '0.5rem 0' }}>{field.set ? 'Saved' : 'Not set'}</div>
      )}
      <div style={{ display: 'flex', gap: '0.9rem', marginTop: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {!editing && <button type="button" style={linkBtn} onClick={() => onChange('')}>{field.set ? 'Replace' : 'Add'}</button>}
        {editing && <button type="button" style={linkBtn} onClick={() => { onChange(undefined); setStatus(null); }}>Cancel</button>}
        {field.set && !editing && (removing
          ? <button type="button" style={linkBtn} onClick={() => onChange(undefined)}>Undo remove</button>
          : <button type="button" style={linkBtn} onClick={() => onChange(null)}>Remove</button>)}
        {field.kind === 'webhook' && (field.set || (editing && draft)) && <button type="button" style={linkBtn} onClick={test}>Test</button>}
        {status && <span style={{ fontSize: '0.8rem', color: status.ok === false ? '#c62828' : status.ok ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{status.text}</span>}
      </div>
    </div>
  );
}

function Connections() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [secrets, setSecrets] = useState({});
  const [options, setOptions] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    const d = await api.get();
    setData(d);
    setForm(Object.fromEntries(d.groups.flatMap(g => g.fields).filter(f => !f.secret).map(f => [f.key, f.value || ''])));
    setSecrets({});
    return d;
  };
  const loadOptions = (guild) => api.discord(guild).then(setOptions).catch(() => setOptions({ ok: false, error: 'Couldn\'t reach the crew centre' }));

  useEffect(() => {
    load().then(() => loadOptions()).catch(err => showToast(err.message || 'Couldn\'t load the settings', 'error'));
  }, []);

  const fields = useMemo(() => (data ? data.groups.flatMap(g => g.fields) : []), [data]);
  const changes = useMemo(() => {
    const out = {};
    for (const f of fields) {
      if (f.secret) {
        const d = secrets[f.key];
        if (d === null) out[f.key] = '';
        else if (d) out[f.key] = d.trim();
      } else if ((form[f.key] || '').trim() !== (f.value || '')) {
        out[f.key] = (form[f.key] || '').trim();
      }
    }
    return out;
  }, [fields, form, secrets]);
  const changed = Object.keys(changes).length;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.save(changes);
      if (r.restarting) {
        setNotice('Saved. The crew centre is restarting to use the new settings, which takes about 20 seconds.');
        setTimeout(() => { load().catch(() => {}); setNotice(null); }, 20000);
      } else {
        setNotice('Saved. Restart the API and the bot to use the new settings.');
      }
      await load();
      if ('DISCORD_GUILD_ID' in changes) loadOptions(changes.DISCORD_GUILD_ID);
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div style={small}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, paddingBottom: changed ? '5rem' : 0 }}>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
        The Discord roles, channels and webhooks the crew centre uses, and a few other settings from setup. What you save here replaces the value from setup.
        The bot token, database and Infinite Flight API key stay in the server settings.
      </p>

      {notice && <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>{notice}</div>}

      {data.groups.map(g => (
        <div key={g.id} className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{g.title}</h3>
            {(g.id === 'roles' || g.id === 'channels') && options && !options.ok && <span style={small}>{options.error}</span>}
          </div>
          {g.fields.map(f => (
            <div key={f.key} style={row}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{f.label}</div>
                {f.hint && <div style={{ ...small, marginTop: '0.15rem' }}>{f.hint}</div>}
              </div>
              {f.secret
                ? <Secret field={f} draft={secrets[f.key] === null ? undefined : secrets[f.key]} removing={secrets[f.key] === null} onChange={v => setSecrets(s => ({ ...s, [f.key]: v }))} />
                : (f.kind === 'role' || f.kind === 'channel')
                  ? <Picker field={f} value={form[f.key] || ''} options={options?.ok ? options : null} onChange={v => setForm(s => ({ ...s, [f.key]: v }))} />
                  : <input value={form[f.key] || ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} style={control} spellCheck={false} />}
              {f.secret && secrets[f.key] === null && <div style={{ ...small, gridColumn: '2', color: '#c62828' }}>Will be removed when you save</div>}
            </div>
          ))}
        </div>
      ))}

      {changed > 0 && (
        <div style={{ position: 'sticky', bottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <span style={small}>{changed} change{changed === 1 ? '' : 's'}{data.canRestart ? '. Saving restarts the crew centre for a few seconds.' : ''}</span>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button type="button" style={linkBtn} onClick={() => load()}>Discard</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Connections;
