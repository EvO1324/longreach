/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import ConfirmModal from '../../components/ConfirmModal';
import Dropdown from '../../components/Dropdown';
import React, { useState, useEffect } from 'react';
import { fleet as fleetApi, flights as flightsApi, infiniteFlight, upload } from '../../api/client';
import { showToast } from '../../components/Toast';

function FleetManager() {
  const [fleet, setFleet]                       = useState([]);
  const [aircraft, setAircraft]                 = useState([]);
  const [selectedAircraft, setSelectedAircraft] = useState('');
  const [liveries, setLiveries]                 = useState([]);
  const [selectedLivery, setSelectedLivery]     = useState('');
  const [imageUrl, setImageUrl]                 = useState('');
  const [loading, setLoading]                   = useState(true);
  const [adding, setAdding]                     = useState(false);
  const [stats, setStats]                       = useState({});
  const [showAddPanel, setShowAddPanel]         = useState(false);
  const [selected, setSelected]                 = useState(null);
  const [editingId, setEditingId]               = useState(null);
  const [editImageUrl, setEditImageUrl]         = useState('');
  const [uploading, setUploading]               = useState(false);
  const [editUploading, setEditUploading]       = useState(false);
  const [addIcao, setAddIcao]                   = useState('');
  const [editingIcaoId, setEditingIcaoId]       = useState(null);
  const [editIcaoVal, setEditIcaoVal]           = useState('');
  const [confirmRemove, setConfirmRemove]       = useState(null);

  useEffect(() => { loadFleet(); loadAircraft(); }, []); // eslint-disable-line
  useEffect(() => { if (fleet.length > 0) loadFleetStats(); }, [fleet]); // eslint-disable-line

  const loadFleet = async () => {
    try {
      const data = await fleetApi.list();
      setFleet((data.fleet || []).flatMap(g => g.liveries.map(l => ({ ...l, _type: g.type }))));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadFleetStats = async () => {
    try {
      const data = await flightsApi.aircraftStats();
      const s = {};
      for (const [ac, v] of Object.entries(data.stats || {})) s[ac] = { totalFlights: v.flights, totalHours: v.hours };
      setStats(s);
    } catch (e) { console.error(e); }
  };

  const loadAircraft = async () => {
    try { const d = await infiniteFlight.aircraft(); setAircraft(d.aircraft || []); }
    catch { showToast('Failed to load aircraft', 'error'); }
  };

  const handleAircraftChange = async (id) => {
    setSelectedAircraft(id); setSelectedLivery('');
    if (id) {
      try { const d = await infiniteFlight.liveries(id); setLiveries(d.liveries || []); }
      catch { showToast('Failed to load liveries', 'error'); }
    } else { setLiveries([]); }
  };

  const handleAdd = async () => {
    if (!selectedLivery) { showToast('Please select a livery', 'error'); return; }
    const livery = liveries.find(l => l.id === selectedLivery);
    try {
      setAdding(true);
      await fleetApi.add({ name: `${livery.aircraftName} - ${livery.liveryName}`, aircraft_id: livery.aircraftID, livery_id: livery.id, livery_name: livery.liveryName, image_url: imageUrl.trim(), icao_code: addIcao.trim().toUpperCase() });
      showToast('Aircraft added!', 'success');
      setSelectedAircraft(''); setSelectedLivery(''); setLiveries([]); setImageUrl(''); setAddIcao(''); setShowAddPanel(false);
      await loadFleet();
    } catch (e) { showToast('Failed: ' + e.message, 'error'); } finally { setAdding(false); }
  };

  const handleSaveIcao = async (id) => {
    try {
      await fleetApi.updateIcao(id, editIcaoVal.trim().toUpperCase());
      showToast('ICAO code updated!', 'success');
      setEditingIcaoId(null);
      await loadFleet();
      setSelected(prev => prev ? { ...prev, liveries: prev.liveries.map(l => l.id === id ? { ...l, icao_code: editIcaoVal.trim().toUpperCase() } : l) } : null);
    } catch { showToast('Failed to update ICAO', 'error'); }
  };

  const handleRemove = (id) => setConfirmRemove(id);

  const handleSaveImage = async (id) => {
    try {
      await fleetApi.updateImage(id, editImageUrl.trim());
      showToast('Image updated!', 'success');
      setEditingId(null);
      await loadFleet();
      // Refresh open modal livery data
      setSelected(prev => {
        if (!prev) return null;
        return { ...prev, liveries: prev.liveries.map(l => l.id === id ? { ...l, image_url: editImageUrl.trim() } : l) };
      });
    } catch { showToast('Failed to update image', 'error'); }
  };

  const uploadImage = async (file, onSuccess, setUploadingState) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const filename = file.name.replace(/\s+/g, '-').toLowerCase();
      try { const d = await upload.fleetImage(filename, base64, 'heroes'); onSuccess(d.url); showToast('Uploaded!', 'success'); }
      catch (err) { showToast('Upload failed: ' + err.message, 'error'); }
      setUploadingState(false);
    };
    reader.readAsDataURL(file);
  };

  const getStats = name => stats[name] || { totalFlights: 0, totalHours: 0 };

  const grouped = fleet.reduce((acc, ac) => {
    const type = ac.name.split(' - ')[0];
    if (!acc[type]) acc[type] = [];
    acc[type].push(ac);
    return acc;
  }, {});

  const totalFlights = Object.values(stats).reduce((s, v) => s + v.totalFlights, 0);
  const totalHours   = Object.values(stats).reduce((s, v) => s + v.totalHours, 0);

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>Loading fleet…</div>;

  return (
    <div>
      <style>{`
        .fm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:1rem; }
        .fm-card { border-radius:12px; overflow:hidden; border:1.5px solid var(--border-color); background:var(--bg-card); cursor:pointer; transition:border-color 0.2s,transform 0.18s,box-shadow 0.18s; }
        .fm-card:hover { border-color:var(--avg-green); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.15); }
        .fm-img { width:100%; height:130px; object-fit:cover; display:block; background:#0f172a; }
        .fm-placeholder { width:100%; height:130px; background:linear-gradient(135deg,#0f172a,#1e293b); display:flex; align-items:center; justify-content:center; }
        .fm-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1500; display:flex; align-items:center; justify-content:center; padding:1.5rem; }
        .fm-modal { background:var(--bg-card); border-radius:14px; width:100%; max-width:540px; max-height:84vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,0.3); }
        .fm-livery-row { display:flex; align-items:center; gap:0.875rem; padding:0.75rem; border-radius:8px; background:var(--bg-secondary); }
        .add-panel { position:fixed; top:0; right:0; width:380px; height:100vh; background:var(--bg-card); border-left:1.5px solid var(--border-color); z-index:3000; display:flex; flex-direction:column; box-shadow:-8px 0 32px rgba(0,0,0,0.2); transform:translateX(100%); transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); }
        .add-panel.open { transform:translateX(0); }
        .add-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:2999; opacity:0; pointer-events:none; transition:opacity 0.3s; }
        .add-backdrop.open { opacity:1; pointer-events:all; }
        @media(max-width:480px){ .fm-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));} .add-panel{width:100vw;} }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <div style={{ display:'flex', gap:'2rem', flexWrap:'wrap' }}>
          {[
            { label:'Types',  value: Object.keys(grouped).length },
            { label:'Liveries', value: fleet.length },
            { label:'Flights', value: totalFlights, green:true },
            { label:'Hours',   value: `${totalHours.toFixed(0)}h`, green:true },
          ].map(({ label, value, green }) => (
            <div key={label}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.08em', color:'var(--text-secondary)', textTransform:'uppercase' }}>{label}</div>
              <div style={{ fontSize:'1.5rem', fontWeight:700, lineHeight:1.1, color: green ? 'var(--avg-green)' : 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setShowAddPanel(true)} className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:'0.5rem', whiteSpace:'nowrap' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Aircraft
        </button>
      </div>

      {/* Type grid */}
      {fleet.length === 0 ? (
        <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-secondary)', border:'2px dashed var(--border-color)', borderRadius:'12px' }}>
          <p style={{ margin:'0 0 1rem' }}>No aircraft in fleet yet</p>
          <button onClick={() => setShowAddPanel(true)} className="btn btn-primary">Add first aircraft</button>
        </div>
      ) : (
        <div className="fm-grid">
          {Object.entries(grouped).map(([type, livs]) => {
            const hero        = livs.find(l => l.image_url)?.image_url || null;
            const typeFlights = livs.reduce((s, ac) => s + getStats(ac.name).totalFlights, 0);
            const typeHours   = livs.reduce((s, ac) => s + getStats(ac.name).totalHours, 0);
            return (
              <div key={type} className="fm-card" onClick={() => setSelected({ type, liveries: livs })}>
                {hero
                  ? <div style={{ position:'relative' }}>
                      <img src={hero} alt={type} className="fm-img" onError={e => e.target.style.display='none'} />
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(transparent 35%,rgba(0,0,0,0.65))' }} />
                    </div>
                  : <div className="fm-placeholder">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 5.2a1 1 0 0 0-.8.3L2 7.5l7 3.5L7 13l-2 .5L3 11l-1.5 1.5 3 6L6 20l6-1.5L15.5 22l1.5-1.5-.7-1.3z"/></svg>
                    </div>
                }
                <div style={{ padding:'0.75rem' }}>
                  <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'0.25rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{type}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginBottom:'0.5rem' }}>{livs.length} {livs.length === 1 ? 'livery' : 'liveries'}</div>
                  <div style={{ display:'flex', gap:'0.75rem' }}>
                    <span style={{ fontSize:'0.78rem', fontWeight:600, color: typeFlights > 0 ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{typeFlights} flt</span>
                    <span style={{ fontSize:'0.78rem', fontWeight:600, color: typeHours > 0 ? 'var(--avg-green)' : 'var(--text-secondary)' }}>{typeHours.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Liveries modal */}
      {selected && (
        <div className="fm-backdrop" onClick={() => { setSelected(null); setEditingId(null); }}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            {/* Hero / header */}
            {(() => {
              const hero = selected.liveries.find(l => l.image_url)?.image_url;
              return hero ? (
                <div style={{ height:180, background:'#0f172a', position:'relative', flexShrink:0 }}>
                  <img src={hero} alt={selected.type} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(transparent 40%,rgba(0,0,0,0.7))' }} />
                  <div style={{ position:'absolute', bottom:'1rem', left:'1.25rem' }}>
                    <div style={{ color:'white', fontWeight:800, fontSize:'1.2rem' }}>{selected.type}</div>
                    <div style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.82rem' }}>{selected.liveries.length} {selected.liveries.length === 1 ? 'livery' : 'liveries'}</div>
                  </div>
                  <button onClick={() => { setSelected(null); setEditingId(null); }} style={{ position:'absolute', top:'0.75rem', right:'0.75rem', background:'rgba(0,0,0,0.5)', border:'none', borderRadius:'50%', width:32, height:32, cursor:'pointer', color:'white', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:'1.1rem' }}>{selected.type}</div>
                    <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>{selected.liveries.length} {selected.liveries.length === 1 ? 'livery' : 'liveries'}</div>
                  </div>
                  <button onClick={() => { setSelected(null); setEditingId(null); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              );
            })()}

            {/* Liveries */}
            <div style={{ overflowY:'auto', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {selected.liveries.map(ac => {
                const s = getStats(ac.name);
                const liveryLabel = ac.livery_name || ac.name.split(' - ')[1] || ac.name;
                const isEditing   = editingId === ac.id;
                return (
                  <div key={ac.id}>
                    <div className="fm-livery-row">
                      {ac.image_url && (
                        <div style={{ width:56, height:36, borderRadius:5, overflow:'hidden', background:'#0f172a', flexShrink:0 }}>
                          <img src={ac.image_url} alt={liveryLabel} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
                        </div>
                      )}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.15rem' }}>
                          <span style={{ fontWeight:600, fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{liveryLabel}</span>
                          {ac.icao_code && (
                            <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:'4px', background:'rgba(var(--brand-primary-rgb),0.1)', color:'var(--avg-green)', border:'1px solid rgba(var(--brand-primary-rgb),0.2)', fontFamily:'monospace', flexShrink:0 }}>{ac.icao_code}</span>
                          )}
                        </div>
                        <div style={{ fontSize:'0.75rem', color: s.totalFlights > 0 ? 'var(--avg-green)' : 'var(--text-secondary)', fontWeight:600 }}>{s.totalFlights} flt · {s.totalHours.toFixed(1)}h</div>
                      </div>
                      <div style={{ display:'flex', gap:'0.4rem', flexShrink:0 }}>
                        <button
                          onClick={() => { setEditingIcaoId(editingIcaoId === ac.id ? null : ac.id); setEditIcaoVal(ac.icao_code || ''); }}
                          style={{ padding:'0.35rem 0.7rem', background:'none', border:'1.5px solid var(--border-color)', borderRadius:'6px', cursor:'pointer', fontSize:'0.75rem', fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', fontFamily:'monospace' }}>
                          {ac.icao_code || 'ICAO'}
                        </button>
                        <button
                          onClick={() => { setEditingId(isEditing ? null : ac.id); setEditImageUrl(ac.image_url || ''); }}
                          style={{ padding:'0.35rem 0.7rem', background:'none', border:'1.5px solid var(--border-color)', borderRadius:'6px', cursor:'pointer', fontSize:'0.75rem', fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap' }}>
                          {ac.image_url ? 'Edit img' : 'Add img'}
                        </button>
                        <button
                          onClick={() => handleRemove(ac.id)}
                          style={{ padding:'0.35rem 0.7rem', background:'#c62828', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.75rem', fontWeight:600, color:'white' }}>
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Inline ICAO editor */}
                    {editingIcaoId === ac.id && (
                      <div style={{ margin:'0.25rem 0 0.25rem 0', padding:'0.75rem', background:'var(--bg-secondary)', borderRadius:'8px', border:'1px solid var(--border-color)' }}>
                        <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.78rem', fontWeight:600, color:'var(--text-secondary)' }}>ICAO Code</label>
                        <div style={{ display:'flex', gap:'0.5rem' }}>
                          <input
                            value={editIcaoVal}
                            onChange={e => setEditIcaoVal(e.target.value.toUpperCase().slice(0, 6))}
                            placeholder="e.g. A388"
                            maxLength={6}
                            style={{ flex:1, padding:'0.45rem 0.7rem', border:'1.5px solid var(--border-color)', borderRadius:'6px', background:'var(--bg-card)', color:'var(--text-primary)', fontSize:'0.9rem', fontFamily:'monospace', fontWeight:700, outline:'none' }}
                            onFocus={e => e.target.style.borderColor='var(--avg-green)'}
                            onBlur={e => e.target.style.borderColor='var(--border-color)'}
                          />
                          <button onClick={() => handleSaveIcao(ac.id)} className="btn btn-primary" style={{ padding:'0.45rem 0.9rem', fontSize:'0.8rem' }}>Save</button>
                          <button onClick={() => setEditingIcaoId(null)} className="btn btn-secondary" style={{ padding:'0.45rem 0.7rem', fontSize:'0.8rem' }}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Inline image editor */}
                    {isEditing && (
                      <div style={{ margin:'0.25rem 0 0.25rem 0', padding:'0.875rem', background:'var(--bg-secondary)', borderRadius:'8px', border:'1px solid var(--border-color)' }}>
                        {editImageUrl && (
                          <div style={{ borderRadius:'6px', overflow:'hidden', height:80, background:'#0f172a', marginBottom:'0.75rem' }}>
                            <img src={editImageUrl} alt="Preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
                          </div>
                        )}
                        <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', padding:'0.5rem', background:'var(--bg-hover)', border:'1.5px dashed var(--border-color)', borderRadius:'7px', cursor: editUploading ? 'not-allowed' : 'pointer', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.5rem', opacity: editUploading ? 0.6 : 1 }}>
                          <input type="file" accept="image/*" style={{ display:'none' }} disabled={editUploading} onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setEditUploading(true); await uploadImage(f, setEditImageUrl, setEditUploading); }} />
                          {editUploading ? 'Uploading…' : 'Choose File'}
                        </label>
                        <div style={{ display:'flex', gap:'0.5rem' }}>
                          <button onClick={() => handleSaveImage(ac.id)} disabled={!editImageUrl || editUploading} className="btn btn-primary" style={{ flex:1, padding:'0.5rem', fontSize:'0.8rem' }}>Save</button>
                          <button onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ flex:1, padding:'0.5rem', fontSize:'0.8rem' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add panel backdrop */}
      <div className={`add-backdrop ${showAddPanel ? 'open' : ''}`} onClick={() => setShowAddPanel(false)} />

      {/* Add aircraft slide-in panel */}
      <div className={`add-panel ${showAddPanel ? 'open' : ''}`}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border-color)' }}>
          <h3 style={{ margin:0, fontSize:'1rem', fontWeight:700 }}>Add Aircraft</h3>
          <button onClick={() => setShowAddPanel(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <div>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:600, fontSize:'0.875rem' }}>Aircraft Type</label>
            <Dropdown value={selectedAircraft} onChange={handleAircraftChange} placeholder="Select aircraft…" options={[{ value:'', label:'Select aircraft…' }, ...aircraft.map(ac => ({ value:ac.id, label:ac.name }))]} />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:600, fontSize:'0.875rem' }}>Livery</label>
            <Dropdown value={selectedLivery} onChange={setSelectedLivery} placeholder="Select livery…" disabled={!selectedAircraft} options={[{ value:'', label:'Select livery…' }, ...liveries.map(l => ({ value:l.id, label:l.liveryName }))]} />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:600, fontSize:'0.875rem' }}>Image <span style={{ fontWeight:400, color:'var(--text-secondary)' }}>(optional)</span></label>
            <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem', padding:'0.75rem', background:'var(--bg-hover)', border:'1.5px dashed var(--border-color)', borderRadius:'8px', cursor: uploading ? 'not-allowed' : 'pointer', fontSize:'0.875rem', fontWeight:600, opacity: uploading ? 0.6 : 1 }}>
              <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploading} onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setUploading(true); await uploadImage(f, setImageUrl, setUploading); }} />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              {uploading ? 'Uploading…' : 'Upload Image'}
            </label>
            {imageUrl && (
              <div style={{ marginTop:'0.75rem', borderRadius:'8px', overflow:'hidden', height:130, background:'#0f172a', border:'1px solid var(--border-color)' }}>
                <img src={imageUrl} alt="Preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
              </div>
            )}
          </div>
        </div>
        <div style={{ padding:'0 1.5rem 1.25rem' }}>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:600, fontSize:'0.875rem' }}>
              ICAO Code <span style={{ fontWeight:400, color:'var(--text-secondary)' }}>(optional, e.g. A388)</span>
            </label>
            <input
              value={addIcao}
              onChange={e => setAddIcao(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="e.g. DH8D"
              maxLength={6}
              style={{ width:'100%', boxSizing:'border-box', padding:'0.65rem 0.875rem', border:'1.5px solid var(--border-color)', borderRadius:'8px', background:'var(--bg-card)', color:'var(--text-primary)', fontSize:'0.95rem', fontFamily:'monospace', fontWeight:600, outline:'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--avg-green)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>
        <div style={{ padding:'1.25rem 1.5rem', borderTop:'1px solid var(--border-color)' }}>
          <button onClick={handleAdd} disabled={!selectedLivery || adding} className="btn btn-primary" style={{ width:'100%', padding:'0.8rem' }}>
            {adding ? 'Adding…' : 'Add to Fleet'}
          </button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove this aircraft?"
          message="It will be removed from the fleet and can no longer be selected for PIREPs."
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              await fleetApi.remove(confirmRemove);
              showToast('Removed', 'success');
              await loadFleet();
              setSelected(prev => {
                if (!prev) return null;
                const updated = prev.liveries.filter(l => l.id !== confirmRemove);
                return updated.length ? { ...prev, liveries: updated } : null;
              });
            } catch { showToast('Failed to remove', 'error'); }
          }}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

export default FleetManager;
