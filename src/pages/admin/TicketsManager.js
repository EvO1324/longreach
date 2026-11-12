/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Admin › Tickets: the Discord ticket panel, where ticket channels go, who can
// see them, what the messages say, and past tickets with their transcripts.

import React, { useEffect, useMemo, useState } from 'react';
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
function DiscordPreview({ color, title, description, buttonLabel, buttonEmoji, buttonStyle, mention }) {
  return (
    <div style={{ background: '#313338', borderRadius: 10, padding: '1rem', color: '#dbdee1', fontSize: '0.9rem', lineHeight: 1.45 }}>
      {mention && <div style={{ marginBottom: '0.4rem' }}><span style={{ background: 'rgba(88,101,242,0.3)', color: '#c9cdfb', borderRadius: 3, padding: '0 2px' }}>{mention}</span></div>}
      <div style={{ display: 'flex', background: '#2b2d31', borderRadius: 4, overflow: 'hidden', maxWidth: 440 }}>
        <div style={{ width: 4, background: color || '#1f5f8b', flexShrink: 0 }} />
        <div style={{ padding: '0.6rem 0.9rem 0.75rem', minWidth: 0 }}>
          {title && <div style={{ fontWeight: 700, color: '#f2f3f5', marginBottom: '0.3rem' }}>{title}</div>}
          {description && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{description}</div>}
        </div>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: BUTTON_COLOURS[buttonStyle] || BUTTON_COLOURS.primary, color: '#fff', borderRadius: 4, padding: '0.35rem 1rem', fontSize: '0.85rem', fontWeight: 500 }}>
          {buttonEmoji && <span>{buttonEmoji}</span>}{buttonLabel}
        </span>
      </div>
    </div>
  );
}

function Transcript({ id, onClose }) {
  const [t, setT] = useState(null);
  useEffect(() => { api.get(id).then(d => setT(d.ticket)).catch(err => { showToast(err.message, 'error'); onClose(); }); }, [id]); // eslint-disable-line
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{t ? `Ticket #${String(t.number).padStart(4, '0')}` : 'Ticket'}</div>
            {t && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.user_discord_name} · {t.status === 'open' ? 'Open' : `Closed by ${t.closed_by || 'someone'}`}</div>}
          </div>
          <button onClick={onClose} style={linkBtn}>Close</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {!t ? <div style={hint}>Loading…</div>
            : t.status === 'open' ? <div style={hint}>The transcript is saved when the ticket is closed.</div>
            : !t.transcript.length ? <div style={hint}>No messages were saved.</div>
            : t.transcript.map((m, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 700 }}>{m.author}</span>
                  {m.bot && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: '#5865F2', color: '#fff', borderRadius: 3, padding: '0 4px', marginLeft: 6 }}>BOT</span>}
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{new Date(m.at).toLocaleString()}</span>
                </div>
                {m.content && <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>}
                {m.embeds?.map((e, j) => <div key={j} style={{ fontSize: '0.85rem', borderLeft: '3px solid var(--border-color)', paddingLeft: '0.6rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{e}</div>)}
                {m.attachments?.map(a => <div key={a}><a href={a} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>{a.split('/').pop().split('?')[0]}</a></div>)}
                {!m.content && !m.embeds?.length && !m.attachments?.length && <div style={{ ...hint, marginTop: 0 }}>(message text not saved)</div>}
              </div>
            ))}
        </div>
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

  useEffect(() => {
    api.config().then(d => { setData(d); setForm(d.config); setSaved(d.config); }).catch(err => showToast(err.message || 'Couldn\'t load tickets', 'error'));
  }, []);
  useEffect(() => {
    api.list(filter).then(setList).catch(() => setList({ tickets: [], open: 0 }));
  }, [filter]);

  const changed = useMemo(() => form && saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  if (!form) return <div style={hint}>Loading…</div>;

  const d = data.discord;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setIn = (group, k, v) => setForm(f => ({ ...f, [group]: { ...f[group], [k]: v } }));
  const channelOpts = d.ok ? d.channels.map(c => ({ value: c.id, label: `#${c.name}${c.category ? `  ·  ${c.category}` : ''}` })) : [];
  const categoryOpts = d.ok ? d.categories.map(c => ({ value: c.id, label: c.name })) : [];
  const roleName = id => d.ok ? (d.roles.find(r => r.id === id)?.name || id) : id;
  const freeRoles = d.ok ? d.roles.filter(r => !form.staff_role_ids.includes(r.id)).map(r => ({ value: r.id, label: `@${r.name}` })) : [];
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

  const card = { margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 };
  const exampleUser = '@pilot';

  return (
    <div style={{ paddingBottom: changed ? '5rem' : 0 }}>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 780 }}>
        Members press a button in Discord to open a private ticket channel with your staff. Set up where it goes and what it says here, then post the panel.
      </p>

      {!d.ok && <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>{d.error} Channels and roles can be picked once the bot can see your server.</div>}
      {!data.messageContent && d.ok && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <b>Transcripts won't include what people wrote.</b> To save full transcripts, switch on <b>Message Content Intent</b> for your bot in the Discord developer portal (Bot › Privileged Gateway Intents). The bot picks it up next time it restarts.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1rem', alignItems: 'start' }}>
        <section className="card" style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Where</h3>
          <Field title="Panel channel" help="Where the message with the button goes, e.g. #support.">
            <Dropdown options={channelOpts} value={form.panel_channel_id} onChange={v => set('panel_channel_id', v)} placeholder="Choose a channel" searchPlaceholder="Search channels…" disabled={!d.ok} />
          </Field>
          <Field title="Ticket category" help="New ticket channels are made in this category.">
            <Dropdown options={categoryOpts} value={form.category_id} onChange={v => set('category_id', v)} placeholder="Choose a category" searchPlaceholder="Search categories…" disabled={!d.ok} />
          </Field>
          <Field title="Staff roles" help="These roles can see every ticket. The member who opened it can always see theirs.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: form.staff_role_ids.length ? '0.5rem' : 0 }}>
              {form.staff_role_ids.map(id => (
                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-hover)', borderRadius: 999, padding: '0.3rem 0.4rem 0.3rem 0.75rem', fontSize: '0.85rem' }}>
                  @{roleName(id)}
                  <button onClick={() => set('staff_role_ids', form.staff_role_ids.filter(r => r !== id))} aria-label={`Remove ${roleName(id)}`} style={{ border: 'none', background: 'var(--border-color)', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1, color: 'var(--text-primary)' }}>✕</button>
                </span>
              ))}
            </div>
            <Dropdown options={freeRoles} value="" onChange={v => v && set('staff_role_ids', [...form.staff_role_ids, v])} placeholder="Add a role" searchPlaceholder="Search roles…" disabled={!d.ok} />
          </Field>
          <Field title="Log channel" help="Optional. A note goes here whenever a ticket is closed.">
            <Dropdown options={[{ value: '', label: 'None' }, ...channelOpts]} value={form.log_channel_id} onChange={v => set('log_channel_id', v)} placeholder="None" searchPlaceholder="Search channels…" disabled={!d.ok} />
          </Field>
        </section>

        <section className="card" style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Panel message</h3>
          <Field title="Title"><input value={form.panel.title} onChange={e => setIn('panel', 'title', e.target.value)} style={input} maxLength={256} /></Field>
          <Field title="Message" help="Discord formatting works, like **bold** and links.">
            <textarea value={form.panel.description} onChange={e => setIn('panel', 'description', e.target.value)} rows={4} maxLength={4000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.75rem' }}>
            <Field title="Button text"><input value={form.panel.button_label} onChange={e => setIn('panel', 'button_label', e.target.value)} style={input} maxLength={80} /></Field>
            <Field title="Emoji"><input value={form.panel.button_emoji} onChange={e => setIn('panel', 'button_emoji', e.target.value)} style={{ ...input, textAlign: 'center' }} maxLength={8} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Field title="Button colour">
              <Dropdown options={[{ value: 'primary', label: 'Blurple' }, { value: 'success', label: 'Green' }, { value: 'secondary', label: 'Grey' }, { value: 'danger', label: 'Red' }]} value={form.panel.button_style} onChange={v => setIn('panel', 'button_style', v)} />
            </Field>
            <Field title="Side colour">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={form.panel.color} onChange={e => setIn('panel', 'color', e.target.value)} style={{ width: 46, height: 46, padding: 2, border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer' }} />
                <input value={form.panel.color} onChange={e => setIn('panel', 'color', e.target.value)} style={{ ...input, fontFamily: 'monospace' }} maxLength={7} />
              </div>
            </Field>
          </div>
          <DiscordPreview color={form.panel.color} title={form.panel.title} description={form.panel.description} buttonLabel={form.panel.button_label} buttonEmoji={form.panel.button_emoji} buttonStyle={form.panel.button_style} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={postPanel} disabled={posting || changed || !d.ok} className="btn btn-primary" style={{ opacity: posting || changed || !d.ok ? 0.5 : 1 }}>
              {posting ? 'Posting…' : posted ? 'Update panel in Discord' : 'Post panel in Discord'}
            </button>
            <span style={hint}>{changed ? 'Save your changes first.' : posted ? 'Edits the panel already posted.' : 'Posts it in the panel channel.'}</span>
          </div>
        </section>

        <section className="card" style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Inside a ticket</h3>
          <Field title="Title" help="{number} is the ticket number.">
            <input value={form.welcome.title} onChange={e => setIn('welcome', 'title', e.target.value)} style={input} maxLength={256} />
          </Field>
          <Field title="First message" help="{user} mentions the member, {name} is their name, {number} is the ticket number.">
            <textarea value={form.welcome.message} onChange={e => setIn('welcome', 'message', e.target.value)} rows={4} maxLength={4000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          <Field title="Close button text"><input value={form.welcome.close_label} onChange={e => setIn('welcome', 'close_label', e.target.value)} style={input} maxLength={80} /></Field>
          <DiscordPreview
            color={form.panel.color}
            title={(form.welcome.title || '').replace(/\{number\}/g, '0001')}
            description={(form.welcome.message || '').replace(/\{user\}/g, exampleUser).replace(/\{name\}/g, 'Sam').replace(/\{number\}/g, '0001')}
            buttonLabel={form.welcome.close_label} buttonEmoji="🔒" buttonStyle="danger"
            mention={[exampleUser, ...(form.ping_staff ? form.staff_role_ids.map(id => `@${roleName(id)}`) : [])].join(' ')}
          />
        </section>

        <section className="card" style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Options</h3>
          {[
            ['ping_staff', 'Ping the staff roles when a ticket opens'],
            ['one_open_per_user', 'One open ticket per member at a time'],
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

      <section className="card" style={{ marginTop: '1rem' }}>
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
                    <span style={{ ...hint, marginLeft: 8 }}>opened {new Date(t.created).toLocaleDateString()}{t.status === 'closed' && t.closed_by ? ` · closed by ${t.closed_by}` : ''}</span>
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: t.status === 'open' ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{t.status === 'open' ? 'Open' : 'Closed'}</span>
                </button>
              ))}
            </div>
          )}
      </section>

      {openId && <Transcript id={openId} onClose={() => setOpenId(null)} />}

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
