/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ifLive, upload } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import { useIFLive } from './IFLiveContext';
import { RefreshCw, Radar, Plane, ChevronDown, Warehouse, Image as ImageIcon } from 'lucide-react';

const AC_VISIBILITY = { 0: 'Unknown', 1: 'Visible', 2: 'Hangared' };
const AC_STATE = { 0: 'Unknown', 1: 'On ground', 2: 'In flight', 3: 'Cancelled', 4: 'Stopped', 5: 'Maintenance' };

function IFLiveFleet() {
  const { orgId, typeNames, fleetImages, refreshFleetImages } = useIFLive();
  const [aircraft, setAircraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [positionData, setPositionData] = useState({});
  const [positionLoading, setPositionLoading] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null); // aircraft type id currently uploading

  const uploadTypeImage = (typeId, file) => {
    setUploadingFor(typeId);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const filename = `${typeId}-${file.name}`.replace(/\s+/g, '-').toLowerCase();
      try {
        const d = await upload.fleetImage(filename, base64, 'iflive');
        await ifLive.setFleetImage(typeId, d.url);
        refreshFleetImages();
        showToast('Aircraft image updated — applies to every tail of this type', 'success');
      } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
      }
      setUploadingFor(null);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (orgId) loadFleet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadFleet = async () => {
    setLoading(true);
    try {
      const d = await ifLive.aircraftList(orgId);
      setAircraft(d.aircraft || []);
    } catch (err) {
      showToast(err.message || 'Failed to load fleet', 'error');
    } finally {
      setLoading(false);
    }
  };

  const togglePosition = async (aircraftId) => {
    if (expanded === aircraftId) { setExpanded(null); return; }
    setExpanded(aircraftId);
    if (!positionData[aircraftId]) {
      setPositionLoading(aircraftId);
      try {
        const d = await ifLive.position(aircraftId);
        setPositionData(p => ({ ...p, [aircraftId]: d.position }));
      } catch (err) {
        showToast(err.message || 'Failed to fetch live position', 'error');
      } finally {
        setPositionLoading(null);
      }
    }
  };

  const activeCount = (aircraft || []).filter(a => a.isFleetActiveSlot).length;
  const storageCount = (aircraft || []).length - activeCount;

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <StatChip icon={Plane} value={(aircraft || []).length} label="Total" color="var(--avg-green)" bg="var(--avg-green-pale)" />
          <StatChip icon={Radar} value={activeCount} label="Active fleet" color="var(--avg-green)" bg="var(--avg-green-pale)" />
          <StatChip icon={Warehouse} value={storageCount} label="In storage" color="var(--text-secondary)" bg="var(--bg-hover)" />
        </div>
        <button onClick={loadFleet} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading fleet…</div>
      ) : (aircraft || []).length === 0 ? (
        <EmptyState icon={Plane} text="No aircraft found in this organization." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
          {aircraft.map(ac => {
            const isExpanded = expanded === ac.id;
            const pos = positionData[ac.id];
            const typeName = typeNames[ac.aircraftId];
            const active = ac.isFleetActiveSlot;
            const image = fleetImages?.[ac.aircraftId];
            const uploadingThis = uploadingFor === ac.aircraftId;
            return (
              <div key={ac.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
                overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              }}>
                {/* Status accent bar */}
                <div style={{ height: 4, background: active ? 'linear-gradient(90deg, var(--avg-green), var(--avg-green-light))' : 'var(--border-color)' }} />

                <div style={{ position: 'relative', height: 140, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {image ? (
                    <img src={image} alt={typeName || ac.registration} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Plane size={26} color="var(--text-secondary)" style={{ opacity: 0.35 }} />
                  )}
                  <label style={{
                    position: 'absolute', bottom: 6, right: 6, display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.68rem', fontWeight: 700,
                    padding: '0.3rem 0.55rem', borderRadius: 7, cursor: uploadingThis ? 'wait' : 'pointer',
                  }}>
                    <ImageIcon size={11} /> {uploadingThis ? 'Uploading…' : image ? 'Replace image' : 'Set image'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingThis}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadTypeImage(ac.aircraftId, f); e.target.value = ''; }} />
                  </label>
                </div>

                <div style={{ padding: '1.1rem 1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: active ? 'var(--avg-green-pale)' : 'var(--bg-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Plane size={16} color={active ? 'var(--avg-green)' : 'var(--text-secondary)'} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{ac.registration}</div>
                        {typeName && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeName}</div>}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', flexShrink: 0,
                      background: active ? 'var(--avg-green)' : 'var(--bg-hover)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                      {active ? 'Active' : 'Storage'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '1.1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.7rem', paddingBottom: '0.7rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span>{AC_VISIBILITY[ac.visibility] || '—'}</span>
                    <span>Rank #{ac.fleetRank}</span>
                  </div>

                  {isExpanded ? (
                    <div style={{ fontSize: '0.78rem' }}>
                      {positionLoading === ac.id ? (
                        <span style={{ color: 'var(--text-secondary)' }}>Fetching…</span>
                      ) : pos ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                          <span><strong style={{ color: 'var(--text-primary)' }}>{AC_STATE[pos.state] || '—'}</strong></span>
                          <span>{Math.round(pos.altitude).toLocaleString()} ft · {Math.round(pos.speed)} kts · {Math.round(pos.heading)}°</span>
                          <span>Last pilot: {pos.lastPilotUsername || '—'}</span>
                          <span>Updated {new Date(pos.updatedAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>No position data.</span>
                      )}
                      <button onClick={() => setExpanded(null)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <ChevronDown size={12} style={{ transform: 'rotate(180deg)' }} /> Hide
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => togglePosition(ac.id)} style={{
                      background: 'var(--bg-hover)', border: 'none', borderRadius: 8, padding: '0.4rem 0.7rem',
                      cursor: 'pointer', color: 'var(--avg-green)', fontSize: '0.78rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%', justifyContent: 'center',
                    }}>
                      <Radar size={12} /> Get live position
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, value, label, color, bg }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem', background: bg,
      borderRadius: 11, padding: '0.5rem 0.85rem',
    }}>
      <Icon size={14} color={color} />
      <span style={{ fontWeight: 800, fontSize: '0.95rem', color }}>{value}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 14,
      padding: '2.5rem', textAlign: 'center',
    }}>
      <Icon size={26} color="var(--text-secondary)" style={{ marginBottom: '0.6rem' }} />
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{text}</div>
    </div>
  );
}

export default IFLiveFleet;
