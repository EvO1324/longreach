/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Partners (the "partners" plugin, in testing): link up with another
// Longreach VA and choose what each one sees.

import React, { useEffect, useState } from 'react';
import { partners as api } from '../../api/client';
import { showToast } from '../../components/Toast';
import { Switch } from './Plugins';

const small = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
const codeBox = { width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', wordBreak: 'break-all' };
const when = iso => iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';

function PartnerCard({ p, onChange, onRemove }) {
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const save = async (what, data) => {
    setBusy(what);
    try { onChange((await api.update(p.id, data)).partner); }
    catch (err) { showToast(err.message || 'Couldn\'t save', 'error'); }
    finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('remove');
    try { await api.remove(p.id); onRemove(p.id); }
    catch (err) { showToast(err.message || 'Couldn\'t remove', 'error'); setBusy(''); }
  };
  const pending = p.status === 'pending';
  const status = pending ? 'Waiting for them to use the invite' : p.status === 'paused' ? 'Paused' : 'Linked';

  return (
    <section className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {p.logo_url ? <img src={p.logo_url} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8 }} /> : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-secondary)' }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{p.name}</h3>
          <div style={{ ...small, color: p.status === 'active' ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{status}</div>
        </div>
      </div>
      {!pending && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ ...small, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>What they see</div>
            {[['routes', 'Your routes'], ['flights', 'Your live and recent flights (callsigns, not names)']].map(([k, label]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.88rem' }}>
                {label}
                <Switch on={p.share[k]} busy={busy === k} label={label} onChange={v => save(k, { share: { [k]: v } })} />
              </div>
            ))}
          </div>
          <div style={small}>
            Last heard from {when(p.last_seen)}{p.url ? ` · ${p.url.replace(/^https?:\/\//, '')}` : ''}
          </div>
          {p.last_error && <div style={{ ...small, color: '#c62828' }}>{p.last_error}</div>}
        </>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
        {!pending && (
          <button className="btn btn-secondary" disabled={!!busy} onClick={() => save('status', { status: p.status === 'paused' ? 'active' : 'paused' })}>
            {p.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        {confirm
          ? <button className="btn btn-primary" disabled={!!busy} onClick={remove} style={{ background: '#c62828', borderColor: '#c62828' }}>{busy === 'remove' ? 'Removing…' : pending ? 'Yes, cancel it' : 'Yes, remove'}</button>
          : <button className="btn btn-secondary" disabled={!!busy} onClick={() => setConfirm(true)}>{pending ? 'Cancel invite' : 'Remove'}</button>}
      </div>
    </section>
  );
}

function PartnersManager() {
  const [list, setList] = useState(null);
  const [code, setCode] = useState('');
  const [inviting, setInviting] = useState(false);
  const [paste, setPaste] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.list().then(d => setList(d.partners)).catch(err => showToast(err.message || 'Couldn\'t load partners', 'error'));
  }, []);

  const invite = async () => {
    setInviting(true);
    try {
      const r = await api.invite();
      setCode(r.code);
      setList(l => [r.partner, ...(l || [])]);
    } catch (err) { showToast(err.message || 'Couldn\'t make an invite', 'error'); }
    finally { setInviting(false); }
  };
  const accept = async () => {
    setAccepting(true);
    try {
      const r = await api.accept(paste.trim());
      setList(l => [r.partner, ...(l || [])]);
      setPaste('');
      showToast(`Linked with ${r.partner.name}`, 'success');
    } catch (err) { showToast(err.message || 'Couldn\'t link', 'error'); }
    finally { setAccepting(false); }
  };
  const copy = () => navigator.clipboard.writeText(code).then(() => showToast('Copied', 'success')).catch(() => {});

  if (!list) return <div style={small}>Loading…</div>;
  return (
    <div>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 760 }}>
        Link up with another VA on Longreach. Your pilots see their routes and flights on the Partners page, and they see yours. You choose what each partner sees, and either side can pause or remove the link.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <section className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Invite a VA</h3>
          <div style={{ ...small, lineHeight: 1.5 }}>Make a code and send it to the other VA's staff. It works once.</div>
          {code ? (
            <>
              <textarea readOnly value={code} rows={3} onFocus={e => e.target.select()} style={codeBox} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={copy}>Copy code</button>
                <button className="btn btn-secondary" onClick={() => setCode('')}>Done</button>
              </div>
            </>
          ) : (
            <button className="btn btn-primary" onClick={invite} disabled={inviting} style={{ alignSelf: 'flex-start' }}>{inviting ? 'Making…' : 'Make an invite code'}</button>
          )}
        </section>
        <section className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Got a code?</h3>
          <div style={{ ...small, lineHeight: 1.5 }}>Paste the code another VA sent you.</div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3} placeholder="Paste the invite code" style={codeBox} />
          <button className="btn btn-primary" onClick={accept} disabled={accepting || !paste.trim()} style={{ alignSelf: 'flex-start', opacity: accepting || !paste.trim() ? 0.6 : 1 }}>{accepting ? 'Linking…' : 'Link up'}</button>
        </section>
      </div>

      {list.length === 0 ? <div style={small}>No partners yet.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
          {list.map(p => (
            <PartnerCard key={p.id} p={p}
              onChange={np => setList(l => l.map(x => x.id === np.id ? np : x))}
              onRemove={id => setList(l => l.filter(x => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PartnersManager;
