/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Upload, ExternalLink, Trash2 } from 'lucide-react';
import { events as eventsApi, fleet as fleetApi, routes as routesApi, upload } from '../../api/client';
import RouteSearch from '../../components/RouteSearch';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import Loader from '../../components/Loader';
import { fmtWhen } from '../Events';

// <input type="datetime-local"> works in local time
const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = v => (v ? new Date(v).toISOString() : '');
const zuluOf = v => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
};

const EMPTY = {
  title: '', body: '', header_image: '', start_at: '', end_at: '',
  route: '', flight_number: '', departure_icao: '', arrival_icao: '',
  aircraft: '', gates: '', multiplier: '1', status: 'draft',
};

const toForm = ev => ({
  title: ev.title, body: ev.body || '', header_image: ev.header_image || '',
  start_at: toLocalInput(ev.start_at), end_at: toLocalInput(ev.end_at),
  route: ev.route || '', flight_number: ev.flight_number || '', departure_icao: ev.departure_icao, arrival_icao: ev.arrival_icao,
  aircraft: ev.aircraft, gates: (ev.gates || []).join('\n'), multiplier: String(ev.multiplier || 1), status: ev.status,
});

const label = { display: 'grid', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' };
const input = { padding: '0.55rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 400, width: '100%', boxSizing: 'border-box' };
const hint = { fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-secondary)' };
const STATUS_TONE = { published: ['var(--avg-green-pale)', 'var(--avg-green)'], draft: ['var(--bg-hover)', 'var(--text-secondary)'], cancelled: ['rgba(198,40,40,0.1)', '#c62828'] };

function StatusChip({ status }) {
  const [bg, color] = STATUS_TONE[status] || STATUS_TONE.draft;
  return <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 5, background: bg, color, textTransform: 'capitalize' }}>{status}</span>;
}

// A route's aircraft list: a JSON array of fleet names, a real array, or one name
function routeAircraft(route) {
  const raw = route?.aircraft;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const t = String(raw || '').trim();
  if (t.startsWith('[')) { try { return JSON.parse(t).filter(Boolean); } catch { return []; } }
  return t ? [t] : [];
}

const typeAndLivery = name => {
  const [type, ...rest] = String(name).split(' - ');
  return rest.length ? `${type} · ${rest.join(' - ')}` : type;
};

function RouteAndAircraft({ form, setForm, routes, fleetGroups }) {
  const route = routes.find(r => r.id === form.route) || null;
  const options = routeAircraft(route);
  const pick = r => {
    const list = routeAircraft(r);
    setForm(f => ({
      ...f, route: r.id, flight_number: r.flight_number || '', departure_icao: r.departure_icao, arrival_icao: r.arrival_icao,
      aircraft: list.length === 1 ? list[0] : (list.includes(f.aircraft) ? f.aircraft : ''),
    }));
  };
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={label}>
        Route
        {form.route ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.8rem', border: '1px solid var(--avg-green)', background: 'var(--avg-green-pale)', borderRadius: 8, color: 'var(--text-primary)', fontWeight: 600 }}>
            <span>{form.flight_number && <span style={{ fontFamily: 'monospace' }}>{form.flight_number} · </span>}{form.departure_icao} → {form.arrival_icao}
              {route && <span style={{ ...hint, marginLeft: 8 }}>{options.length} aircraft on this route</span>}
              {!route && routes.length > 0 && <span style={{ ...hint, marginLeft: 8, color: '#c62828' }}>not in the active routes any more</span>}
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.78rem', background: 'var(--bg-card)' }}
              onClick={() => setForm(f => ({ ...f, route: '', flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '' }))}>Change</button>
          </div>
        ) : (
          <RouteSearch routes={routes} onSelect={pick} placeholder="Search flight number or ICAO…" />
        )}
      </div>
      {form.route && (options.length > 0 ? (
        <label style={label}>Aircraft
          <select value={form.aircraft} onChange={e => setForm(f => ({ ...f, aircraft: e.target.value }))} style={input} disabled={options.length === 1}>
            {options.length > 1 && <option value="">Choose one of this route's aircraft…</option>}
            {options.map(a => <option key={a} value={a}>{typeAndLivery(a)}</option>)}
          </select>
          {options.length === 1 && <span style={hint}>The only aircraft on this route</span>}
        </label>
      ) : (
        <>
          <span style={hint}>This route doesn't list any aircraft, so pick one from the fleet.</span>
          <AircraftPicker value={form.aircraft} onChange={v => setForm(f => ({ ...f, aircraft: v }))} fleetGroups={fleetGroups} />
        </>
      ))}
    </div>
  );
}

function AircraftPicker({ value, onChange, fleetGroups }) {
  const type = value ? value.split(' - ')[0] : '';
  const [pickedType, setPickedType] = useState(type);
  useEffect(() => { setPickedType(value ? value.split(' - ')[0] : ''); }, [value]);
  const group = fleetGroups.find(g => g.type === pickedType);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
      <label style={label}>Aircraft
        <select value={pickedType} onChange={e => { setPickedType(e.target.value); onChange(''); }} style={input}>
          <option value="">Choose…</option>
          {fleetGroups.map(g => <option key={g.type} value={g.type}>{g.type}</option>)}
        </select>
      </label>
      <label style={label}>Livery
        <select value={value} onChange={e => onChange(e.target.value)} style={input} disabled={!group}>
          <option value="">{group ? 'Choose…' : 'Pick an aircraft first'}</option>
          {(group?.liveries || []).map(l => <option key={l.id} value={l.name}>{l.livery_name || l.name.split(' - ').slice(1).join(' - ') || l.name}</option>)}
        </select>
      </label>
    </div>
  );
}

function Editor({ event, fleetGroups, routes, onSaved, onDeleted }) {
  const [form, setForm] = useState(event ? toForm(event) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'delete' | 'cancel'
  const [detail, setDetail] = useState(null);
  useEffect(() => { setForm(event ? toForm(event) : EMPTY); }, [event]);

  const loadDetail = useCallback(() => {
    if (!event) { setDetail(null); return; }
    eventsApi.get(event.id).then(d => setDetail(d.event)).catch(() => setDetail(null));
  }, [event]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target ? e.target.value : e }));

  const onImage = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { showToast('Use a PNG, JPG, WebP or GIF', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('Keep the image under 8 MB', 'error'); return; }
    setUploading(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const ext = file.name.split('.').pop().toLowerCase();
      const name = `${(form.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now()}.${ext}`;
      const res = await upload.fleetImage(name, data, 'events');
      setForm(f => ({ ...f, header_image: res.url }));
      showToast('Image uploaded', 'success');
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally { setUploading(false); }
  };

  const save = async status => {
    const payload = {
      ...form,
      start_at: fromLocalInput(form.start_at),
      end_at: form.end_at ? fromLocalInput(form.end_at) : null,
      gates: form.gates.split(/[\n,]/).map(g => g.trim()).filter(Boolean),
      multiplier: form.multiplier || 1,
      status: status || form.status,
    };
    setSaving(true);
    try {
      const res = event ? await eventsApi.update(event.id, payload) : await eventsApi.create(payload);
      showToast(payload.status === 'published' && form.status !== 'published' ? 'Published, and posted to Discord' : 'Saved', 'success');
      onSaved(res.event);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    try { await eventsApi.remove(event.id); showToast('Event deleted', 'success'); onDeleted(); }
    catch (err) { showToast(err.message || 'Failed to delete', 'error'); }
  };
  const removeSignup = async reg => {
    try { await eventsApi.removeSignup(event.id, reg.id); showToast(`Removed ${reg.user?.name || 'sign-up'}`, 'success'); loadDetail(); }
    catch (err) { showToast(err.message || 'Failed to remove', 'error'); }
  };

  const published = event?.status === 'published';
  return (
    <div className="card" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{event ? 'Edit event' : 'New event'} {event && <StatusChip status={event.status} />}</h3>
        {event && <Link to={`/events?id=${event.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}>View as a pilot <ExternalLink size={13} /></Link>}
      </div>

      <div>
        <div style={{ ...label, marginBottom: 5 }}>Header image</div>
        <div style={{ position: 'relative', height: 170, borderRadius: 10, overflow: 'hidden', border: '1px dashed var(--border-color)', background: form.header_image ? '#000' : 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {form.header_image
            ? <img src={form.header_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No image yet. Wide images work best (about 3:1).</span>}
          <label className="btn btn-secondary" style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploading ? 'wait' : 'pointer', background: 'var(--bg-card)' }}>
            <Upload size={14} />{uploading ? 'Uploading…' : form.header_image ? 'Replace' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onImage} disabled={uploading} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <label style={label}>Title<input value={form.title} onChange={set('title')} maxLength={120} style={input} placeholder="Hub to hub shuttle" /></label>
      <label style={label}>Body<textarea value={form.body} onChange={set('body')} rows={6} maxLength={10000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} placeholder="What's the plan, the briefing, the server, anything pilots should know." /></label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        <label style={label}>Starts (your time)<input type="datetime-local" value={form.start_at} onChange={set('start_at')} style={input} />{form.start_at && <span style={hint}>{zuluOf(form.start_at)}</span>}</label>
        <label style={label}>Ends (optional)<input type="datetime-local" value={form.end_at} onChange={set('end_at')} style={input} />{form.end_at && <span style={hint}>{zuluOf(form.end_at)}</span>}</label>
      </div>

      <RouteAndAircraft form={form} setForm={setForm} routes={routes} fleetGroups={fleetGroups} />

      <label style={{ ...label, maxWidth: 200 }}>Multiplier<input type="number" min="1" max="5" step="0.25" value={form.multiplier} onChange={set('multiplier')} style={input} /><span style={hint}>1 for none</span></label>

      <label style={label}>Gates
        <textarea value={form.gates} onChange={set('gates')} rows={4} style={{ ...input, fontFamily: 'monospace', resize: 'vertical' }} placeholder={'One per line, or separated by commas\nA1\nA2\nB10'} />
        <span style={hint}>{form.gates.split(/[\n,]/).filter(g => g.trim()).length} gates. Leave empty if pilots don't need one.</span>
      </label>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        {!published && <button className="btn btn-primary" disabled={saving || uploading} onClick={() => save('published')}>Publish</button>}
        {published && <button className="btn btn-primary" disabled={saving || uploading} onClick={() => save()}>Save changes</button>}
        {!published && <button className="btn btn-secondary" disabled={saving || uploading} onClick={() => save(event?.status === 'cancelled' ? 'cancelled' : 'draft')}>{event?.status === 'cancelled' ? 'Save' : 'Save draft'}</button>}
        {published && <button className="btn btn-secondary" disabled={saving} onClick={() => setConfirm('cancel')}>Cancel event</button>}
        {event && <button className="btn btn-secondary" disabled={saving} onClick={() => setConfirm('delete')} style={{ marginLeft: 'auto', color: '#c62828', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Trash2 size={14} />Delete</button>}
      </div>
      {!published && <p style={{ ...hint, margin: 0 }}>Publishing shows it to every pilot, pops it up for them once, and posts it to Discord.</p>}

      {event && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.6rem' }}>Sign-ups {detail ? `(${detail.registrations.length})` : ''}</h4>
          {!detail ? <Loader size={40} /> : detail.registrations.length === 0 ? <p style={{ ...hint, margin: 0 }}>Nobody yet.</p> : (
            <table style={{ width: '100%', fontSize: '0.88rem' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Gate</th><th style={{ textAlign: 'left' }}>Pilot</th><th style={{ textAlign: 'left' }}>Signed up</th><th /></tr></thead>
              <tbody>
                {[...detail.registrations].sort((a, b) => (a.gate || '~').localeCompare(b.gate || '~', undefined, { numeric: true })).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.gate || '—'}</td>
                    <td>{r.user?.name}{r.user?.callsign ? <span style={{ color: 'var(--text-secondary)' }}> · {r.user.callsign}</span> : null}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(r.created).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => setConfirm({ reg: r })}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {confirm === 'delete' && <ConfirmModal title="Delete this event?" message="Its sign-ups and Discord post go too. This can't be undone." confirmLabel="Delete" danger onConfirm={remove} onClose={() => setConfirm(null)} />}
      {confirm === 'cancel' && <ConfirmModal title="Cancel this event?" message="It stays listed as cancelled, the Discord post is marked cancelled, and nobody can sign up or log it." confirmLabel="Cancel event" danger onConfirm={() => save('cancelled')} onClose={() => setConfirm(null)} />}
      {confirm?.reg && <ConfirmModal title={`Remove ${confirm.reg.user?.name || 'this pilot'}?`} message={confirm.reg.gate ? `Gate ${confirm.reg.gate} becomes free.` : 'They can sign up again.'} confirmLabel="Remove" danger onConfirm={() => removeSignup(confirm.reg)} onClose={() => setConfirm(null)} />}
    </div>
  );
}

export default function EventsManager() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');
  const [list, setList] = useState(null);
  const [fleetGroups, setFleetGroups] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    eventsApi.list(true).then(d => setList(d.events)).catch(err => { showToast(err.message || 'Failed to load events', 'error'); setList([]); });
  }, []);
  useEffect(() => {
    load();
    fleetApi.list().then(d => setFleetGroups(d.fleet || [])).catch(() => {});
    routesApi.list({ active: true, fields: 'id,flight_number,departure_icao,arrival_icao,aircraft' })
      .then(d => setRoutes(d.routes || d.items || (Array.isArray(d) ? d : [])))
      .catch(() => showToast('Failed to load routes', 'error'));
  }, [load]);

  const select = id => { setCreating(false); setParams(p => { const n = new URLSearchParams(p); if (id) n.set('id', id); else n.delete('id'); return n; }); };
  const selected = useMemo(() => (list || []).find(e => e.id === selectedId) || null, [list, selectedId]);

  if (!list) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}><Loader size={72} /></div>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
      <div className="card" style={{ padding: '0.75rem', flex: '1 1 240px', maxWidth: 340 }}>
        <button className="btn btn-primary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: '0.75rem' }} onClick={() => { select(null); setCreating(true); }}><Plus size={15} />New event</button>
        {list.length === 0 && <p style={{ ...hint, textAlign: 'center' }}>No events yet.</p>}
        {list.map(ev => (
          <button key={ev.id} onClick={() => select(ev.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.7rem', marginBottom: 4, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid', borderColor: ev.id === selectedId ? 'var(--avg-green)' : 'transparent',
            background: ev.id === selectedId ? 'var(--avg-green-pale)' : 'transparent', color: 'var(--text-primary)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
              <strong style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</strong>
              <StatusChip status={ev.status} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{fmtWhen(ev.start_at)} · {ev.registrationCount} signed up</div>
          </button>
        ))}
      </div>
      <div style={{ flex: '3 1 420px', minWidth: 0 }}>
      {creating || selected
        ? <Editor key={selected?.id || 'new'} event={selected} fleetGroups={fleetGroups} routes={routes}
            onSaved={ev => { load(); select(ev.id); }} onDeleted={() => { load(); select(null); }} />
        : <div className="card" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 1rem' }}>Pick an event, or make a new one.</div>}
      </div>
    </div>
  );
}
