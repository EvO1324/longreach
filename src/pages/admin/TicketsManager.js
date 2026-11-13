/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Tickets: the Discord ticket panel, where ticket channels go, who can
// see them, what the messages say, and past tickets with their transcripts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tickets as api } from '../../api/client';
import { showToast } from '../../components/Toast';
import Dropdown from '../../components/Dropdown';

const input = { width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' };
const hint = { fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.45 };
const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit', textDecoration: 'underline' };
const BUTTON_COLOURS = { primary: '#5865F2', secondary: '#4E5058', success: '#248046', danger: '#DA373C' };

function Field({ title, help, children }) {
  return (
    <div>
      <label style={label}>{title}</label>
      {children}
      {help && <div style={hint}>{help}</div>}
    </div>
  );
}

// Roughly how Discord shows the message, so staff can see it before posting
function DiscordPreview({ color, title, description, buttonLabel, buttonEmoji, buttonStyle, mention, select, extra, footer }) {
  return (
    <div style={{ background: '#313338', borderRadius: 10, padding: '1rem', color: '#dbdee1', fontSize: '0.9rem', lineHeight: 1.45 }}>
      {mention && <div style={{ marginBottom: '0.4rem' }}><span style={{ background: 'rgba(88,101,242,0.3)', color: '#c9cdfb', borderRadius: 3, padding: '0 2px' }}>{mention}</span></div>}
      <div style={{ display: 'flex', background: '#2b2d31', borderRadius: 4, overflow: 'hidden', maxWidth: 440 }}>
        <div style={{ width: 4, background: color || '#1f5f8b', flexShrink: 0 }} />
        <div style={{ padding: '0.6rem 0.9rem 0.75rem', minWidth: 0 }}>
          {title && <div style={{ fontWeight: 700, color: '#f2f3f5', marginBottom: '0.3rem' }}>{title}</div>}
          {description && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{description}</div>}
          {footer && <div style={{ fontSize: '0.75rem', color: '#949ba4', marginTop: '0.4rem' }}>{footer}</div>}
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {select ? (
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 440, background: '#1e1f22', borderRadius: 4, padding: '0.55rem 0.75rem', color: '#949ba4', fontSize: '0.88rem' }}>
            {select}<span style={{ fontSize: '0.7rem' }}>▼</span>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: BUTTON_COLOURS[buttonStyle] || BUTTON_COLOURS.primary, color: '#fff', borderRadius: 4, padding: '0.35rem 1rem', fontSize: '0.85rem', fontWeight: 500 }}>
            {buttonEmoji && <span>{buttonEmoji}</span>}{buttonLabel}
          </span>
        )}
        {extra && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: BUTTON_COLOURS.primary, color: '#fff', borderRadius: 4, padding: '0.35rem 1rem', fontSize: '0.85rem', fontWeight: 500 }}>{extra}</span>
        )}
      </div>
    </div>
  );
}

// Roles as removable chips, plus a dropdown to add one
function RoleChips({ value, onChange, roles, disabled, placeholder = 'Add a role' }) {
  const name = id => roles.find(r => r.id === id)?.name || id;
  const free = roles.filter(r => !value.includes(r.id)).map(r => ({ value: r.id, label: `@${r.name}` }));
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: value.length ? '0.5rem' : 0 }}>
        {value.map(id => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-hover)', borderRadius: 999, padding: '0.3rem 0.4rem 0.3rem 0.75rem', fontSize: '0.85rem' }}>
            @{name(id)}
            <button onClick={() => onChange(value.filter(r => r !== id))} aria-label={`Remove ${name(id)}`} style={{ border: 'none', background: 'var(--border-color)', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1, color: 'var(--text-primary)' }}>✕</button>
          </span>
        ))}
      </div>
      <Dropdown options={free} value="" onChange={v => v && onChange([...value, v])} placeholder={placeholder} searchPlaceholder="Search roles…" disabled={disabled} />
    </>
  );
}

const ticketNo = n => `#${String(n).padStart(4, '0')}`;

// A ticket: an open one's messages read live from Discord with a reply box,
// Claim and Close; a closed one's saved transcript
function TicketView({ id, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const listRef = useRef(null);

  const load = () => api.get(id).then(d => setT(d.ticket));
  useEffect(() => {
    load().catch(err => { showToast(err.message, 'error'); onClose(); });
  }, [id]); // eslint-disable-line
  // keep an open ticket fresh while it's on screen
  useEffect(() => {
    if (t?.status !== 'open') return undefined;
    const timer = setInterval(() => { load().catch(() => {}); }, 10000);
    return () => clearInterval(timer);
  }, [t?.status, id]); // eslint-disable-line
  const count = t?.transcript?.length || 0;
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [count]);

  const act = async (what, fn, done) => {
    setBusy(what);
    try { await fn(); await done?.(); }
    catch (err) { showToast(err.message || 'Something went wrong', 'error'); }
    finally { setBusy(''); }
  };
  const send = () => text.trim() && act('reply', () => api.reply(id, text.trim()), async () => { setText(''); await load(); });
  const claim = () => act('claim', () => api.claim(id), async () => { await load(); onChanged(); });
  const close = () => act('close', () => api.close(id), () => { showToast('Ticket closed', 'success'); onChanged(); onClose(); });

  const open = t?.status === 'open';
  const sub = t && [t.user_discord_name, t.category, open ? (t.claimed_by ? `Claimed by ${t.claimed_by}` : 'Open') : `Closed by ${t.closed_by || 'someone'}`].filter(Boolean).join(' · ');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{t ? `Ticket ${ticketNo(t.number)}` : 'Ticket'}</div>
            {t && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sub}</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {open && !t.claimed_by && <button onClick={claim} disabled={!!busy} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>{busy === 'claim' ? 'Claiming…' : 'Claim'}</button>}
            {open && (confirmClose
              ? <button onClick={close} disabled={!!busy} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', background: '#c62828', borderColor: '#c62828' }}>{busy === 'close' ? 'Closing…' : 'Yes, close it'}</button>
              : <button onClick={() => setConfirmClose(true)} disabled={!!busy} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>Close ticket</button>)}
            <button onClick={onClose} style={linkBtn}>Done</button>
          </div>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          {!t ? <div style={hint}>Loading…</div>
            : !t.transcript.length ? <div style={hint}>{open ? 'No messages yet.' : 'No messages were saved.'}</div>
            : t.transcript.map((m, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 700 }}>{m.author}</span>
                  {m.bot && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: '#5865F2', color: '#fff', borderRadius: 3, padding: '0 4px', marginLeft: 6 }}>BOT</span>}
                  {m.staff && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'var(--avg-green)', color: '#fff', borderRadius: 3, padding: '0 4px', marginLeft: 6 }}>STAFF</span>}
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{new Date(m.at).toLocaleString()}</span>
                </div>
                {m.content && <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>}
                {m.embeds?.map((e, j) => <div key={j} style={{ fontSize: '0.85rem', borderLeft: '3px solid var(--border-color)', paddingLeft: '0.6rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{e}</div>)}
                {m.attachments?.map(a => <div key={a}><a href={a} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>{a.split('/').pop().split('?')[0]}</a></div>)}
                {!m.content && !m.embeds?.length && !m.attachments?.length && <div style={{ ...hint, marginTop: 0 }}>(message text not available)</div>}
              </div>
            ))}
        </div>
        {open && (
          <div style={{ padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.6rem', alignItems: 'flex-end' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={4000} placeholder="Reply in Discord…"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
              style={{ ...input, fontSize: '0.9rem', padding: '0.6rem 0.8rem', resize: 'vertical' }} />
            <button onClick={send} disabled={!!busy || !text.trim()} className="btn btn-primary" style={{ opacity: busy || !text.trim() ? 0.6 : 1 }}>{busy === 'reply' ? 'Sending…' : 'Send'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TicketsManager() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showSettings, setShowSettings] = useState(null);

  useEffect(() => {
    api.config().then(d => { setData(d); setForm(d.config); setSaved(d.config); }).catch(err => showToast(err.message || 'Couldn\'t load tickets', 'error'));
  }, []);
  const loadList = () => api.list(filter).then(setList).catch(() => setList({ tickets: [], open: 0 }));
  useEffect(() => { loadList(); }, [filter]); // eslint-disable-line

  const changed = useMemo(() => form && saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  if (!form) return <div style={hint}>Loading…</div>;

  const d = data.discord;
  const topicsHaveCategories = saved.categories.length > 0 && saved.categories.every(c => c.category_id);
  const setUp = !!((saved.category_id || topicsHaveCategories) && saved.panel_channel_id);
  // folded away once it's set up; open the first time
  if (showSettings === null) setShowSettings(!setUp);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setIn = (group, k, v) => setForm(f => ({ ...f, [group]: { ...f[group], [k]: v } }));
  const channelOpts = d.ok ? d.channels.map(c => ({ value: c.id, label: `#${c.name}${c.category ? `  ·  ${c.category}` : ''}` })) : [];
  const categoryOpts = d.ok ? d.categories.map(c => ({ value: c.id, label: c.name })) : [];
  const roleName = id => d.ok ? (d.roles.find(r => r.id === id)?.name || id) : id;
  const roles = d.ok ? d.roles : [];
  const topics = form.categories || [];
  const setTopic = (i, k, v) => set('categories', topics.map((c, n) => n === i ? { ...c, [k]: v } : c));
  const addTopic = () => set('categories', [...topics, { id: '', label: '', emoji: '', description: '', staff_role_ids: [], category_id: '' }]);
  const removeTopic = i => set('categories', topics.filter((_, n) => n !== i));
  const firstTopic = topics.length === 1 ? topics[0] : null;
  const posted = saved.panel_message_id && saved.panel_message_channel_id === saved.panel_channel_id;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveConfig(form);
      setForm(r.config); setSaved(r.config);
      showToast(posted ? 'Saved. Update the panel in Discord to show your changes.' : 'Saved', 'success');
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally { setSaving(false); }
  };
  const postPanel = async () => {
    setPosting(true);
    try {
      const r = await api.postPanel();
      const fresh = await api.config();
      setSaved(fresh.config); setForm(fresh.config);
      showToast(r.updated ? 'Panel updated in Discord' : 'Panel posted in Discord', 'success');
    } catch (err) {
      showToast(err.message || 'Couldn\'t post the panel', 'error');
    } finally { setPosting(false); }
  };

  // boxes inside the Settings card: an outline rather than another card
  const card = { margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.1rem' };
  const exampleUser = '@pilot';

  return (
    <div style={{ paddingBottom: changed ? '5rem' : 0 }}>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Tickets{list ? ` · ${list.open} open` : ''}</h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[['', 'All'], ['open', 'Open'], ['closed', 'Closed']].map(([k, t]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '0.35rem 0.8rem', borderRadius: 999, border: `1.5px solid ${filter === k ? 'var(--avg-green)' : 'var(--border-color)'}`, background: filter === k ? 'var(--avg-green)' : 'transparent', color: filter === k ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>{t}</button>
            ))}
          </div>
        </div>
        {!list ? <div style={hint}>Loading…</div>
          : !list.tickets.length ? <div style={{ ...hint, padding: '1rem 0' }}>No tickets yet.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {list.tickets.map(t => (
                <button key={t.id} onClick={() => setOpenId(t.id)} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: '1rem', alignItems: 'center', padding: '0.7rem 0.25rem', border: 'none', borderTop: '1px solid var(--border-color)', background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{String(t.number).padStart(4, '0')}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{t.user_discord_name}</span>
                    <span style={{ ...hint, marginLeft: 8 }}>{[t.category, `opened ${new Date(t.created).toLocaleDateString()}`, t.status === 'open' && t.claimed_by ? `claimed by ${t.claimed_by}` : '', t.status === 'closed' && t.closed_by ? `closed by ${t.closed_by}` : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: t.status === 'open' ? (t.claimed_by ? 'var(--text-primary)' : 'var(--avg-green)') : 'var(--text-secondary)' }}>{t.status === 'open' ? (t.claimed_by ? 'Claimed' : 'Open') : 'Closed'}</span>
                </button>
              ))}
            </div>
          )}
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)', textAlign: 'left' }}>
          <span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem' }}>Settings</span>
            <span style={{ ...hint, marginTop: '0.15rem', display: 'block' }}>{setUp ? 'Panel, topics, ticket channels, staff roles and messages' : 'Not set up yet'}</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transition: 'transform .2s', transform: showSettings ? 'rotate(180deg)' : 'none', color: 'var(--text-secondary)' }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        {showSettings && (
          <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 780 }}>
        Members press a button (or pick a topic) in Discord to open a private ticket channel with your staff. Set up where it goes and what it says here, then post the panel.
      </p>

      {!d.ok && <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>{d.error} Channels and roles can be picked once the bot can see your server.</div>}
      {!data.messageContent && d.ok && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <b>Transcripts won't include what people wrote.</b> To save full transcripts, switch on <b>Message Content Intent</b> for your bot in the Discord developer portal (Bot › Privileged Gateway Intents). The bot picks it up next time it restarts.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1rem', alignItems: 'start' }}>
        <section style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Where</h3>
          <Field title="Panel channel" help="Where the message with the button goes, e.g. #support.">
            <Dropdown options={channelOpts} value={form.panel_channel_id} onChange={v => set('panel_channel_id', v)} placeholder="Choose a channel" searchPlaceholder="Search channels…" disabled={!d.ok} />
          </Field>
          <Field title="Ticket category" help="New ticket channels are made in this category, unless a topic has its own.">
            <Dropdown options={categoryOpts} value={form.category_id} onChange={v => set('category_id', v)} placeholder="Choose a category" searchPlaceholder="Search categories…" disabled={!d.ok} />
          </Field>
          <Field title="Staff roles" help="These roles see every ticket, unless a topic has its own. The member who opened it can always see theirs.">
            <RoleChips value={form.staff_role_ids} onChange={v => set('staff_role_ids', v)} roles={roles} disabled={!d.ok} />
          </Field>
          <Field title="Log channel" help="Optional. A note goes here whenever a ticket is closed.">
            <Dropdown options={[{ value: '', label: 'None' }, ...channelOpts]} value={form.log_channel_id} onChange={v => set('log_channel_id', v)} placeholder="None" searchPlaceholder="Search channels…" disabled={!d.ok} />
          </Field>
        </section>

        <section style={card}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Topics</h3>
            <div style={hint}>Optional. With two or more, members pick one from a dropdown. Each can go to its own staff roles and category.</div>
          </div>
          {topics.map((c, i) => (
            <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: '0.6rem', alignItems: 'end' }}>
                <Field title="Emoji"><input value={c.emoji} onChange={e => setTopic(i, 'emoji', e.target.value)} style={{ ...input, textAlign: 'center' }} maxLength={8} /></Field>
                <Field title="Name"><input value={c.label} onChange={e => setTopic(i, 'label', e.target.value)} style={input} maxLength={80} placeholder="e.g. Recruitment" /></Field>
                <button onClick={() => removeTopic(i)} style={{ ...linkBtn, paddingBottom: '0.85rem' }}>Remove</button>
              </div>
              <Field title="Description" help="Optional, shown under the name in the dropdown.">
                <input value={c.description} onChange={e => setTopic(i, 'description', e.target.value)} style={input} maxLength={100} />
              </Field>
              <Field title="Staff roles" help="Blank uses the staff roles above.">
                <RoleChips value={c.staff_role_ids} onChange={v => setTopic(i, 'staff_role_ids', v)} roles={roles} disabled={!d.ok} />
              </Field>
              <Field title="Category">
                <Dropdown options={[{ value: '', label: 'Same as above' }, ...categoryOpts]} value={c.category_id} onChange={v => setTopic(i, 'category_id', v)} placeholder="Same as above" searchPlaceholder="Search categories…" disabled={!d.ok} />
              </Field>
            </div>
          ))}
          {topics.length < 10 && (
            <button onClick={addTopic} className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>Add a topic</button>
          )}
          {firstTopic && <div style={hint}>With one topic, the button opens a "{firstTopic.label || 'untitled'}" ticket. Add another for a dropdown.</div>}
        </section>

        <section style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Panel message</h3>
          <Field title="Title"><input value={form.panel.title} onChange={e => setIn('panel', 'title', e.target.value)} style={input} maxLength={256} /></Field>
          <Field title="Message" help="Discord formatting works, like **bold** and links.">
            <textarea value={form.panel.description} onChange={e => setIn('panel', 'description', e.target.value)} rows={4} maxLength={4000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          {topics.length >= 2 ? (
            <Field title="Dropdown text" help="Shown on the topic dropdown before anyone picks one.">
              <input value={form.panel.select_placeholder} onChange={e => setIn('panel', 'select_placeholder', e.target.value)} style={input} maxLength={150} />
            </Field>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.75rem' }}>
            <Field title="Button text"><input value={form.panel.button_label} onChange={e => setIn('panel', 'button_label', e.target.value)} style={input} maxLength={80} /></Field>
            <Field title="Emoji"><input value={form.panel.button_emoji} onChange={e => setIn('panel', 'button_emoji', e.target.value)} style={{ ...input, textAlign: 'center' }} maxLength={8} /></Field>
          </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: topics.length >= 2 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
            {topics.length < 2 && (
              <Field title="Button colour">
                <Dropdown options={[{ value: 'primary', label: 'Blurple' }, { value: 'success', label: 'Green' }, { value: 'secondary', label: 'Grey' }, { value: 'danger', label: 'Red' }]} value={form.panel.button_style} onChange={v => setIn('panel', 'button_style', v)} />
              </Field>
            )}
            <Field title="Side colour">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={form.panel.color} onChange={e => setIn('panel', 'color', e.target.value)} style={{ width: 46, height: 46, padding: 2, border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer' }} />
                <input value={form.panel.color} onChange={e => setIn('panel', 'color', e.target.value)} style={{ ...input, fontFamily: 'monospace' }} maxLength={7} />
              </div>
            </Field>
          </div>
          <DiscordPreview color={form.panel.color} title={form.panel.title} description={form.panel.description} buttonLabel={form.panel.button_label} buttonEmoji={form.panel.button_emoji} buttonStyle={form.panel.button_style} select={topics.length >= 2 ? form.panel.select_placeholder : null} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={postPanel} disabled={posting || changed || !d.ok} className="btn btn-primary" style={{ opacity: posting || changed || !d.ok ? 0.5 : 1 }}>
              {posting ? 'Posting…' : posted ? 'Update panel in Discord' : 'Post panel in Discord'}
            </button>
            <span style={hint}>{changed ? 'Save your changes first.' : posted ? 'Edits the panel already posted.' : 'Posts it in the panel channel.'}</span>
          </div>
        </section>

        <section style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Inside a ticket</h3>
          <Field title="Title" help="{number} is the ticket number.">
            <input value={form.welcome.title} onChange={e => setIn('welcome', 'title', e.target.value)} style={input} maxLength={256} />
          </Field>
          <Field title="First message" help="{user} mentions the member, {name} is their name, {number} is the ticket number, {category} is the topic they picked.">
            <textarea value={form.welcome.message} onChange={e => setIn('welcome', 'message', e.target.value)} rows={4} maxLength={4000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          <Field title="Close button text"><input value={form.welcome.close_label} onChange={e => setIn('welcome', 'close_label', e.target.value)} style={input} maxLength={80} /></Field>
          <DiscordPreview
            color={form.panel.color}
            title={(form.welcome.title || '').replace(/\{number\}/g, '0001')}
            description={(form.welcome.message || '').replace(/\{user\}/g, exampleUser).replace(/\{name\}/g, 'Sam').replace(/\{number\}/g, '0001').replace(/\{category\}/g, topics[0]?.label || 'Support')}
            buttonLabel={form.welcome.close_label} buttonEmoji="🔒" buttonStyle="danger"
            extra={form.claim ? '🙋 Claim' : null}
            footer={topics[0]?.label || null}
            mention={[exampleUser, ...(form.ping_staff ? ((topics[0]?.staff_role_ids?.length ? topics[0].staff_role_ids : form.staff_role_ids).map(id => `@${roleName(id)}`)) : [])].join(' ')}
          />
        </section>

        <section style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Options</h3>
          {[
            ['ping_staff', 'Ping the staff roles when a ticket opens'],
            ['one_open_per_user', 'One open ticket per member at a time'],
            ['claim', 'Show a Claim button so staff can take a ticket'],
          ].map(([k, text]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16 }} />
              {text}
            </label>
          ))}
          <Field title="Channel name" help={`New channels are named like ${(form.name_prefix || 'ticket')}-0001-username.`}>
            <input value={form.name_prefix} onChange={e => set('name_prefix', e.target.value)} style={input} maxLength={20} />
          </Field>
        </section>
      </div>

          </div>
        )}
      </section>

      {openId && <TicketView id={openId} onClose={() => setOpenId(null)} onChanged={loadList} />}

      {changed && (
        <div style={{ position: 'sticky', bottom: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <span style={hint}>Unsaved changes</span>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button type="button" style={linkBtn} onClick={() => setForm(saved)}>Discard</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketsManager;
